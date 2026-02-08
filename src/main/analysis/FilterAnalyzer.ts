/**
 * Top-level filter analysis orchestrator.
 *
 * Coordinates the full pipeline: segment selection → FFT → noise analysis → recommendations.
 * This is the main entry point for the analysis module.
 */
import type { BlackboxFlightData } from '@shared/types/blackbox.types';
import type {
  FilterAnalysisResult,
  AnalysisProgress,
  CurrentFilterSettings,
  PowerSpectrum,
} from '@shared/types/analysis.types';
import { DEFAULT_FILTER_SETTINGS } from '@shared/types/analysis.types';
import { findSteadySegments } from './SegmentSelector';
import { computePowerSpectrum, trimSpectrum } from './FFTCompute';
import { analyzeAxisNoise, buildNoiseProfile } from './NoiseAnalyzer';
import { recommend, generateSummary } from './FilterRecommender';
import { FFT_WINDOW_SIZE, FREQUENCY_MIN_HZ, FREQUENCY_MAX_HZ } from './constants';

/** Maximum number of segments to use (more = slower but more accurate) */
const MAX_SEGMENTS = 5;

/**
 * Run the full filter analysis pipeline on parsed flight data.
 *
 * @param flightData - Parsed Blackbox flight data for one session
 * @param sessionIndex - Which session is being analyzed
 * @param currentSettings - Current filter settings from the FC
 * @param onProgress - Optional progress callback
 * @returns Complete analysis result with noise profile and recommendations
 */
export async function analyze(
  flightData: BlackboxFlightData,
  sessionIndex: number = 0,
  currentSettings: CurrentFilterSettings = DEFAULT_FILTER_SETTINGS,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<FilterAnalysisResult> {
  const startTime = performance.now();

  // Step 1: Find steady hover segments
  onProgress?.({ step: 'segmenting', percent: 5 });
  const segments = findSteadySegments(flightData);

  // Use up to MAX_SEGMENTS
  const usedSegments = segments.slice(0, MAX_SEGMENTS);

  if (usedSegments.length === 0) {
    // No steady segments found — analyze the entire flight as one segment
    return analyzeEntireFlight(flightData, sessionIndex, currentSettings, startTime, onProgress);
  }

  // Yield to event loop
  await yieldToEventLoop();

  // Step 2: Compute FFT for each segment per axis
  onProgress?.({ step: 'fft', percent: 20 });

  const rollSpectra: PowerSpectrum[] = [];
  const pitchSpectra: PowerSpectrum[] = [];
  const yawSpectra: PowerSpectrum[] = [];

  for (let s = 0; s < usedSegments.length; s++) {
    const seg = usedSegments[s];

    for (let axis = 0; axis < 3; axis++) {
      const gyroValues = flightData.gyro[axis].values.subarray(seg.startIndex, seg.endIndex);
      const spectrum = computePowerSpectrum(gyroValues, flightData.sampleRateHz, FFT_WINDOW_SIZE);
      const trimmed = trimSpectrum(spectrum, FREQUENCY_MIN_HZ, FREQUENCY_MAX_HZ);

      if (axis === 0) rollSpectra.push(trimmed);
      else if (axis === 1) pitchSpectra.push(trimmed);
      else yawSpectra.push(trimmed);
    }

    const fftPercent = 20 + ((s + 1) / usedSegments.length) * 40;
    onProgress?.({ step: 'fft', percent: Math.round(fftPercent) });

    await yieldToEventLoop();
  }

  // Step 3: Noise analysis
  onProgress?.({ step: 'analyzing', percent: 65 });
  const rollNoise = analyzeAxisNoise(rollSpectra);
  const pitchNoise = analyzeAxisNoise(pitchSpectra);
  const yawNoise = analyzeAxisNoise(yawSpectra);
  const noiseProfile = buildNoiseProfile(rollNoise, pitchNoise, yawNoise);

  await yieldToEventLoop();

  // Step 4: Generate recommendations
  onProgress?.({ step: 'recommending', percent: 85 });
  const recommendations = recommend(noiseProfile, currentSettings);
  const summary = generateSummary(noiseProfile, recommendations);

  onProgress?.({ step: 'recommending', percent: 100 });

  return {
    noise: noiseProfile,
    recommendations,
    summary,
    analysisTimeMs: Math.round(performance.now() - startTime),
    sessionIndex,
    segmentsUsed: usedSegments.length,
  };
}

/**
 * Fallback: analyze the entire flight when no steady segments are found.
 */
async function analyzeEntireFlight(
  flightData: BlackboxFlightData,
  sessionIndex: number,
  currentSettings: CurrentFilterSettings,
  startTime: number,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<FilterAnalysisResult> {
  onProgress?.({ step: 'fft', percent: 30 });

  const spectraByAxis: PowerSpectrum[][] = [[], [], []];

  for (let axis = 0; axis < 3; axis++) {
    const gyroValues = flightData.gyro[axis].values;
    if (gyroValues.length < 16) continue;

    const spectrum = computePowerSpectrum(gyroValues, flightData.sampleRateHz, FFT_WINDOW_SIZE);
    spectraByAxis[axis].push(trimSpectrum(spectrum, FREQUENCY_MIN_HZ, FREQUENCY_MAX_HZ));
  }

  await yieldToEventLoop();

  onProgress?.({ step: 'analyzing', percent: 65 });
  const rollNoise = analyzeAxisNoise(spectraByAxis[0]);
  const pitchNoise = analyzeAxisNoise(spectraByAxis[1]);
  const yawNoise = analyzeAxisNoise(spectraByAxis[2]);
  const noiseProfile = buildNoiseProfile(rollNoise, pitchNoise, yawNoise);

  onProgress?.({ step: 'recommending', percent: 85 });
  const recommendations = recommend(noiseProfile, currentSettings);
  const summary = generateSummary(noiseProfile, recommendations);

  onProgress?.({ step: 'recommending', percent: 100 });

  return {
    noise: noiseProfile,
    recommendations,
    summary,
    analysisTimeMs: Math.round(performance.now() - startTime),
    sessionIndex,
    segmentsUsed: 0,
  };
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
