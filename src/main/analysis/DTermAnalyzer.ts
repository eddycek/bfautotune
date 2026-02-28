/**
 * D-term noise-to-effectiveness ratio analyzer.
 *
 * Computes how much of the D-term output is useful damping vs noise amplification.
 * Uses FFT to split D-term energy into functional (20-150 Hz) and noise (>150 Hz) bands.
 *
 * Ratio interpretation:
 * - > 3.0: D is efficient, safe to increase
 * - 1.0-3.0: balanced, generating significant noise
 * - < 1.0: D is mostly amplifying noise, reduce D or improve filters first
 */
import type { TimeSeries } from '@shared/types/blackbox.types';
import { computePowerSpectrum } from './FFTCompute';
import {
  DTERM_FUNCTIONAL_MIN_HZ,
  DTERM_FUNCTIONAL_MAX_HZ,
  DTERM_NOISE_MIN_HZ,
  DTERM_EFFECTIVE_RATIO,
  DTERM_NOISY_RATIO,
} from './constants';

/** Result of D-term effectiveness analysis for one axis */
export interface DTermEffectivenessResult {
  /** Functional energy in the 20-150 Hz band (linear power sum) */
  functionalEnergy: number;
  /** Noise energy above 150 Hz (linear power sum) */
  noiseEnergy: number;
  /** Effectiveness ratio: functional / noise (higher = better) */
  ratio: number;
  /** Human-readable rating */
  rating: 'efficient' | 'balanced' | 'noisy';
}

/** Per-axis D-term effectiveness results */
export interface DTermAnalysisResult {
  roll: DTermEffectivenessResult;
  pitch: DTermEffectivenessResult;
  yaw: DTermEffectivenessResult;
}

/**
 * Compute D-term effectiveness ratio for a single axis.
 *
 * @param pidD - D-term time series from blackbox data
 * @param sampleRate - Sample rate in Hz
 * @returns Effectiveness result with ratio and rating
 */
export function computeDTermEffectiveness(
  pidD: TimeSeries,
  sampleRate: number
): DTermEffectivenessResult {
  // Need enough data for meaningful FFT
  if (pidD.values.length < 256) {
    return { functionalEnergy: 0, noiseEnergy: 0, ratio: 0, rating: 'noisy' };
  }

  const spectrum = computePowerSpectrum(pidD.values, sampleRate);

  let functionalEnergy = 0;
  let noiseEnergy = 0;

  for (let i = 0; i < spectrum.frequencies.length; i++) {
    const freq = spectrum.frequencies[i];
    // Convert dB back to linear power for energy summation
    const linearPower = Math.pow(10, spectrum.magnitudes[i] / 10);

    if (freq >= DTERM_FUNCTIONAL_MIN_HZ && freq <= DTERM_FUNCTIONAL_MAX_HZ) {
      functionalEnergy += linearPower;
    } else if (freq > DTERM_NOISE_MIN_HZ) {
      noiseEnergy += linearPower;
    }
  }

  // Avoid division by zero
  const ratio = noiseEnergy > 0 ? functionalEnergy / noiseEnergy : functionalEnergy > 0 ? 10 : 0;

  let rating: 'efficient' | 'balanced' | 'noisy';
  if (ratio >= DTERM_EFFECTIVE_RATIO) {
    rating = 'efficient';
  } else if (ratio >= DTERM_NOISY_RATIO) {
    rating = 'balanced';
  } else {
    rating = 'noisy';
  }

  return {
    functionalEnergy: Math.round(functionalEnergy * 1000) / 1000,
    noiseEnergy: Math.round(noiseEnergy * 1000) / 1000,
    ratio: Math.round(ratio * 100) / 100,
    rating,
  };
}

/**
 * Analyze D-term effectiveness for all three axes.
 *
 * @param pidD - D-term time series [roll, pitch, yaw]
 * @param sampleRate - Sample rate in Hz
 * @returns Per-axis D-term effectiveness results
 */
export function analyzeDTermEffectiveness(
  pidD: [TimeSeries, TimeSeries, TimeSeries],
  sampleRate: number
): DTermAnalysisResult {
  return {
    roll: computeDTermEffectiveness(pidD[0], sampleRate),
    pitch: computeDTermEffectiveness(pidD[1], sampleRate),
    yaw: computeDTermEffectiveness(pidD[2], sampleRate),
  };
}
