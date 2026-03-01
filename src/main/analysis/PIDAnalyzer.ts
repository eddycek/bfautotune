/**
 * Top-level PID analysis orchestrator.
 *
 * Coordinates the full pipeline: step detection → metrics → recommendation.
 * This is the main entry point for PID step-response analysis.
 */
import type { BlackboxFlightData } from '@shared/types/blackbox.types';
import type { PIDConfiguration } from '@shared/types/pid.types';
import type { FlightStyle } from '@shared/types/profile.types';
import type {
  AnalysisProgress,
  AnalysisWarning,
  DTermEffectivenessPerAxis,
  PIDAnalysisResult,
  StepResponse,
} from '@shared/types/analysis.types';
import { detectSteps } from './StepDetector';
import {
  computeStepResponse,
  aggregateAxisMetrics,
  classifyFFContribution,
  computeAdaptiveWindowMs,
} from './StepMetrics';
import { recommendPID, generatePIDSummary, extractFeedforwardContext } from './PIDRecommender';
import { scorePIDDataQuality, adjustPIDConfidenceByQuality } from './DataQualityScorer';
import { STEP_RESPONSE_WINDOW_MAX_MS } from './constants';
import { analyzeCrossAxisCoupling } from './CrossAxisDetector';
import { estimateTransferFunctions } from './TransferFunctionEstimator';
import { analyzeDTermEffectiveness } from './DTermAnalyzer';
import { analyzePropWash } from './PropWashDetector';

/** Default PID configuration if none provided */
const DEFAULT_PIDS: PIDConfiguration = {
  roll: { P: 45, I: 80, D: 30 },
  pitch: { P: 47, I: 84, D: 32 },
  yaw: { P: 45, I: 80, D: 0 },
};

/**
 * Run the full PID analysis pipeline on parsed flight data.
 *
 * @param flightData - Parsed Blackbox flight data for one session
 * @param sessionIndex - Which session is being analyzed
 * @param currentPIDs - Current PID configuration from the FC
 * @param onProgress - Optional progress callback
 * @param flightPIDs - PIDs from the BBL header (flight-time PIDs) for convergent recommendations
 * @param rawHeaders - BBL raw headers for feedforward context extraction
 * @param flightStyle - Pilot's flying style preference (affects thresholds)
 * @returns Complete PID analysis result with recommendations
 */
export async function analyzePID(
  flightData: BlackboxFlightData,
  sessionIndex: number = 0,
  currentPIDs: PIDConfiguration = DEFAULT_PIDS,
  onProgress?: (progress: AnalysisProgress) => void,
  flightPIDs?: PIDConfiguration,
  rawHeaders?: Map<string, string>,
  flightStyle: FlightStyle = 'balanced'
): Promise<PIDAnalysisResult> {
  const startTime = performance.now();

  // Step 1: Detect step inputs with generous window for adaptive sizing
  onProgress?.({ step: 'detecting', percent: 5 });
  const firstPassSteps = detectSteps(flightData, STEP_RESPONSE_WINDOW_MAX_MS);

  await yieldToEventLoop();

  // Step 1b: First-pass metrics to determine adaptive window
  const firstPassResponses: StepResponse[] = [];
  for (const step of firstPassSteps) {
    firstPassResponses.push(
      computeStepResponse(
        flightData.setpoint[step.axis],
        flightData.gyro[step.axis],
        step,
        flightData.sampleRateHz
      )
    );
  }
  const adaptiveWindowMs = computeAdaptiveWindowMs(firstPassResponses);

  await yieldToEventLoop();

  // Step 2: Re-detect with adaptive window (skip if same as first pass)
  onProgress?.({ step: 'detecting', percent: 10 });
  const steps =
    adaptiveWindowMs === STEP_RESPONSE_WINDOW_MAX_MS
      ? firstPassSteps
      : detectSteps(flightData, adaptiveWindowMs);

  await yieldToEventLoop();

  // Step 3: Compute metrics for each step with adaptive window
  onProgress?.({ step: 'measuring', percent: 30 });

  const rollResponses: StepResponse[] = [];
  const pitchResponses: StepResponse[] = [];
  const yawResponses: StepResponse[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const response = computeStepResponse(
      flightData.setpoint[step.axis],
      flightData.gyro[step.axis],
      step,
      flightData.sampleRateHz
    );

    // Classify FF contribution at overshoot point when pidP/pidF available
    if (flightData.pidP[step.axis] && flightData.pidF[step.axis]) {
      const ffResult = classifyFFContribution(
        response,
        flightData.pidP[step.axis],
        flightData.pidF[step.axis],
        flightData.gyro[step.axis]
      );
      if (ffResult !== undefined) {
        response.ffDominated = ffResult;
      }
    }

    if (step.axis === 0) rollResponses.push(response);
    else if (step.axis === 1) pitchResponses.push(response);
    else yawResponses.push(response);

    // Report progress within measuring phase (30-70%)
    if (steps.length > 0) {
      const pct = 30 + ((i + 1) / steps.length) * 40;
      onProgress?.({ step: 'measuring', percent: Math.round(pct) });
    }

    // Yield periodically to avoid blocking
    if (i % 10 === 9) {
      await yieldToEventLoop();
    }
  }

  // Aggregate metrics per axis
  const roll = aggregateAxisMetrics(rollResponses);
  const pitch = aggregateAxisMetrics(pitchResponses);
  const yaw = aggregateAxisMetrics(yawResponses);

  await yieldToEventLoop();

  // Score data quality
  const qualityResult = scorePIDDataQuality({
    totalSteps: steps.length,
    axisResponses: { roll: rollResponses, pitch: pitchResponses, yaw: yawResponses },
  });

  // Detect cross-axis coupling
  const crossAxisCoupling = analyzeCrossAxisCoupling(steps, flightData);

  // Estimate transfer functions via Wiener deconvolution
  const transferFunctions = estimateTransferFunctions(flightData);

  // Extract feedforward context before recommendations (needed for FF-aware rules)
  const feedforwardContext = rawHeaders ? extractFeedforwardContext(rawHeaders) : undefined;

  // Compute D-term effectiveness when pidD data is available
  let dTermEffectiveness: DTermEffectivenessPerAxis | undefined;
  const hasPidD =
    flightData.pidD[0]?.values.length > 0 &&
    flightData.pidD[1]?.values.length > 0 &&
    flightData.pidD[2]?.values.length > 0;
  if (hasPidD) {
    const dTermResult = analyzeDTermEffectiveness(flightData.pidD, flightData.sampleRateHz);
    dTermEffectiveness = {
      roll: { ratio: dTermResult.roll.ratio, rating: dTermResult.roll.rating },
      pitch: { ratio: dTermResult.pitch.ratio, rating: dTermResult.pitch.rating },
      yaw: { ratio: dTermResult.yaw.ratio, rating: dTermResult.yaw.rating },
    };
  }

  // Step 2b: Prop wash analysis (runs on any flight with throttle data)
  const propWash = analyzePropWash(flightData);

  // Step 3: Generate recommendations
  onProgress?.({ step: 'scoring', percent: 80 });
  const rawRecommendations = recommendPID(
    roll,
    pitch,
    yaw,
    currentPIDs,
    flightPIDs,
    feedforwardContext,
    flightStyle,
    dTermEffectiveness
  );
  const recommendations = adjustPIDConfidenceByQuality(
    rawRecommendations,
    qualityResult.score.tier
  );
  const summary = generatePIDSummary(roll, pitch, yaw, recommendations, flightStyle);

  onProgress?.({ step: 'scoring', percent: 100 });

  const warnings: AnalysisWarning[] = [...qualityResult.warnings];
  if (feedforwardContext?.active) {
    warnings.push({
      code: 'feedforward_active',
      message:
        'Feedforward is active on this flight. Overshoot and rise time measurements include feedforward contribution — some overshoot may be from FF rather than P/D imbalance.',
      severity: 'info',
    });
  }

  return {
    roll,
    pitch,
    yaw,
    recommendations,
    summary,
    analysisTimeMs: Math.round(performance.now() - startTime),
    sessionIndex,
    stepsDetected: steps.length,
    currentPIDs,
    feedforwardContext,
    flightStyle,
    dataQuality: qualityResult.score,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(crossAxisCoupling ? { crossAxisCoupling } : {}),
    ...(transferFunctions ? { transferFunctions } : {}),
    ...(dTermEffectiveness ? { dTermEffectiveness } : {}),
    ...(propWash ? { propWash } : {}),
  };
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
