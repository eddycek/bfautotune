import { describe, it, expect } from 'vitest';
import { computeDTermEffectiveness, analyzeDTermEffectiveness } from './DTermAnalyzer';
import type { TimeSeries } from '@shared/types/blackbox.types';

const SAMPLE_RATE = 4000;

/**
 * Generate a sinusoidal time series at a given frequency.
 * Useful for creating controlled frequency-domain content.
 */
function makeSineSeries(
  frequency: number,
  amplitude: number,
  numSamples: number,
  sampleRate: number = SAMPLE_RATE
): TimeSeries {
  const time = new Float64Array(numSamples);
  const values = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    time[i] = i / sampleRate;
    values[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return { time, values };
}

/**
 * Combine two time series by summing their values.
 */
function combineSeries(a: TimeSeries, b: TimeSeries): TimeSeries {
  const len = Math.min(a.values.length, b.values.length);
  const time = new Float64Array(len);
  const values = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    time[i] = a.time[i];
    values[i] = a.values[i] + b.values[i];
  }
  return { time, values };
}

describe('DTermAnalyzer', () => {
  describe('computeDTermEffectiveness', () => {
    it('should rate as efficient when functional band dominates', () => {
      // Strong 80 Hz signal (functional band: 20-150 Hz), weak 300 Hz noise
      const functional = makeSineSeries(80, 100, 8192);
      const noise = makeSineSeries(300, 5, 8192);
      const combined = combineSeries(functional, noise);

      const result = computeDTermEffectiveness(combined, SAMPLE_RATE);

      expect(result.rating).toBe('efficient');
      expect(result.ratio).toBeGreaterThan(3);
      expect(result.functionalEnergy).toBeGreaterThan(result.noiseEnergy);
    });

    it('should rate as noisy when noise band dominates', () => {
      // Weak 80 Hz signal, strong 300 Hz noise
      const functional = makeSineSeries(80, 5, 8192);
      const noise = makeSineSeries(300, 100, 8192);
      const combined = combineSeries(functional, noise);

      const result = computeDTermEffectiveness(combined, SAMPLE_RATE);

      expect(result.rating).toBe('noisy');
      expect(result.ratio).toBeLessThan(1);
      expect(result.noiseEnergy).toBeGreaterThan(result.functionalEnergy);
    });

    it('should rate as balanced for comparable energy levels', () => {
      // Similar amplitudes in both bands → ratio near 1-3
      const functional = makeSineSeries(80, 50, 8192);
      const noise = makeSineSeries(300, 40, 8192);
      const combined = combineSeries(functional, noise);

      const result = computeDTermEffectiveness(combined, SAMPLE_RATE);

      expect(result.ratio).toBeGreaterThanOrEqual(1);
      expect(result.ratio).toBeLessThanOrEqual(3);
      expect(result.rating).toBe('balanced');
    });

    it('should return noisy for very short signals', () => {
      const shortSeries: TimeSeries = {
        time: new Float64Array(100),
        values: new Float64Array(100),
      };

      const result = computeDTermEffectiveness(shortSeries, SAMPLE_RATE);

      expect(result.ratio).toBe(0);
      expect(result.rating).toBe('noisy');
    });

    it('should handle zero signal gracefully', () => {
      const zeros: TimeSeries = {
        time: new Float64Array(8192),
        values: new Float64Array(8192), // all zeros
      };

      const result = computeDTermEffectiveness(zeros, SAMPLE_RATE);

      // Windowing artefacts may produce tiny FFT values, but ratio stays very low
      expect(result.ratio).toBeLessThan(1);
      expect(result.rating).toBe('noisy');
    });

    it('should round ratio to 2 decimal places', () => {
      const functional = makeSineSeries(80, 100, 8192);
      const noise = makeSineSeries(300, 5, 8192);
      const combined = combineSeries(functional, noise);

      const result = computeDTermEffectiveness(combined, SAMPLE_RATE);

      const str = result.ratio.toString();
      const decimalPart = str.split('.')[1] || '';
      expect(decimalPart.length).toBeLessThanOrEqual(2);
    });

    it('should handle pure functional signal (no noise) as efficient', () => {
      // Only 80 Hz — all energy in functional band, minimal in noise
      const functional = makeSineSeries(80, 100, 8192);

      const result = computeDTermEffectiveness(functional, SAMPLE_RATE);

      expect(result.rating).toBe('efficient');
      expect(result.ratio).toBeGreaterThan(3); // well above efficient threshold
    });
  });

  describe('analyzeDTermEffectiveness', () => {
    it('should return per-axis results', () => {
      const roll = makeSineSeries(80, 100, 8192);
      const pitch = makeSineSeries(80, 100, 8192);
      const yaw = makeSineSeries(300, 100, 8192); // yaw is noisy

      const result = analyzeDTermEffectiveness([roll, pitch, yaw], SAMPLE_RATE);

      expect(result.roll.rating).toBe('efficient');
      expect(result.pitch.rating).toBe('efficient');
      expect(result.yaw.rating).toBe('noisy');
    });

    it('should produce independent ratings per axis', () => {
      const efficient = makeSineSeries(80, 100, 8192);
      const noise = makeSineSeries(300, 100, 8192);
      const balanced = combineSeries(makeSineSeries(80, 50, 8192), makeSineSeries(300, 40, 8192));

      const result = analyzeDTermEffectiveness([efficient, noise, balanced], SAMPLE_RATE);

      expect(result.roll.rating).toBe('efficient');
      expect(result.pitch.rating).toBe('noisy');
      expect(result.yaw.ratio).toBeGreaterThanOrEqual(1);
      expect(result.yaw.ratio).toBeLessThanOrEqual(3);
    });
  });
});
