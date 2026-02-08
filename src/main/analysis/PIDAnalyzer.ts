/**
 * Top-level PID analysis orchestrator.
 *
 * Coordinates the full pipeline: step detection → metrics → recommendation.
 * This is the main entry point for PID step-response analysis.
 */
import type { BlackboxFlightData } from '@shared/types/blackbox.types';
import type { PIDConfiguration } from '@shared/types/pid.types';
import type {
  AnalysisProgress,
  PIDAnalysisResult,
  StepResponse,
} from '@shared/types/analysis.types';
import { detectSteps } from './StepDetector';
import { computeStepResponse, aggregateAxisMetrics } from './StepMetrics';
import { recommendPID, generatePIDSummary } from './PIDRecommender';

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
 * @returns Complete PID analysis result with recommendations
 */
export async function analyzePID(
  flightData: BlackboxFlightData,
  sessionIndex: number = 0,
  currentPIDs: PIDConfiguration = DEFAULT_PIDS,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<PIDAnalysisResult> {
  const startTime = performance.now();

  // Step 1: Detect step inputs
  onProgress?.({ step: 'detecting', percent: 10 });
  const steps = detectSteps(flightData);

  await yieldToEventLoop();

  // Step 2: Compute metrics for each step
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

  // Step 3: Generate recommendations
  onProgress?.({ step: 'scoring', percent: 80 });
  const recommendations = recommendPID(roll, pitch, yaw, currentPIDs);
  const summary = generatePIDSummary(roll, pitch, yaw, recommendations);

  onProgress?.({ step: 'scoring', percent: 100 });

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
  };
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
