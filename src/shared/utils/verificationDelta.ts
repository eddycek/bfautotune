/**
 * Compute verification delta from before/after analysis metrics.
 * Returns a VerificationDelta summarizing improvement or regression.
 */
import type { VerificationDelta } from '../types/tuning-history.types';
import type { TuningType } from '../types/tuning.types';

interface PerAxisMetrics {
  roll: number;
  pitch: number;
  yaw: number;
}

export interface VerificationInput {
  mode: TuningType;
  before: {
    noiseFloorDb?: PerAxisMetrics;
    meanOvershootPct?: PerAxisMetrics;
    meanRiseTimeMs?: PerAxisMetrics;
    bandwidthHz?: PerAxisMetrics;
    phaseMarginDeg?: PerAxisMetrics;
  };
  after: {
    noiseFloorDb?: PerAxisMetrics;
    meanOvershootPct?: PerAxisMetrics;
    meanRiseTimeMs?: PerAxisMetrics;
    bandwidthHz?: PerAxisMetrics;
    phaseMarginDeg?: PerAxisMetrics;
  };
}

function axisAvg(m: PerAxisMetrics): number {
  return (m.roll + m.pitch + m.yaw) / 3;
}

function axisDelta(before: PerAxisMetrics, after: PerAxisMetrics): PerAxisMetrics {
  return {
    roll: after.roll - before.roll,
    pitch: after.pitch - before.pitch,
    yaw: after.yaw - before.yaw,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeVerificationDelta(input: VerificationInput): VerificationDelta {
  const { mode, before, after } = input;
  const delta: VerificationDelta = { overallImprovement: 0 };
  const improvements: number[] = [];

  // Noise floor: negative delta = improvement (less noise)
  if (before.noiseFloorDb && after.noiseFloorDb) {
    delta.noiseFloorDeltaDb = axisDelta(before.noiseFloorDb, after.noiseFloorDb);
    // For noise: negative = better, so negate for improvement score
    const avgDelta = axisAvg(delta.noiseFloorDeltaDb);
    improvements.push(clamp(-avgDelta * 5, -100, 100)); // 20 dB improvement -> +100
  }

  // Overshoot: negative delta = improvement (less overshoot)
  if (before.meanOvershootPct && after.meanOvershootPct) {
    delta.overshootDeltaPct = axisDelta(before.meanOvershootPct, after.meanOvershootPct);
    const avgDelta = axisAvg(delta.overshootDeltaPct);
    improvements.push(clamp(-avgDelta * 2, -100, 100)); // 50% reduction -> +100
  }

  // Rise time: negative delta = improvement (faster response) — only for PID mode
  if (mode === 'pid' && before.meanRiseTimeMs && after.meanRiseTimeMs) {
    delta.riseTimeDeltaMs = axisDelta(before.meanRiseTimeMs, after.meanRiseTimeMs);
    const avgDelta = axisAvg(delta.riseTimeDeltaMs);
    improvements.push(clamp(-avgDelta, -100, 100)); // 100ms faster -> +100
  }

  // Bandwidth: positive delta = improvement (more responsive)
  if (before.bandwidthHz && after.bandwidthHz) {
    delta.bandwidthDeltaHz = axisDelta(before.bandwidthHz, after.bandwidthHz);
    const avgDelta = axisAvg(delta.bandwidthDeltaHz);
    improvements.push(clamp(avgDelta * 2, -100, 100)); // 50 Hz increase -> +100
  }

  // Phase margin: positive delta = improvement (more stable)
  if (before.phaseMarginDeg && after.phaseMarginDeg) {
    delta.phaseMarginDeltaDeg = axisDelta(before.phaseMarginDeg, after.phaseMarginDeg);
    const avgDelta = axisAvg(delta.phaseMarginDeltaDeg);
    improvements.push(clamp(avgDelta * 2, -100, 100)); // 50 deg increase -> +100
  }

  // Overall improvement: average of available improvements
  if (improvements.length > 0) {
    delta.overallImprovement = Math.round(
      improvements.reduce((sum, v) => sum + v, 0) / improvements.length
    );
    delta.overallImprovement = clamp(delta.overallImprovement, -100, 100);
  }

  return delta;
}
