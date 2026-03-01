import { describe, it, expect } from 'vitest';
import {
  computeAxisTransferFunction,
  estimateTransferFunctions,
  extractFrequencyMetrics,
  computeSyntheticStepResponse,
} from './TransferFunctionEstimator';
import type { BlackboxFlightData, TimeSeries } from '@shared/types/blackbox.types';

const SAMPLE_RATE = 4000;

function makeSeries(fn: (i: number) => number, numSamples: number): TimeSeries {
  const time = new Float64Array(numSamples);
  const values = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    time[i] = i / SAMPLE_RATE;
    values[i] = fn(i);
  }
  return { time, values };
}

function createFlightData(
  setpointFns: [(i: number) => number, (i: number) => number, (i: number) => number],
  gyroFns: [(i: number) => number, (i: number) => number, (i: number) => number],
  numSamples: number = SAMPLE_RATE * 3 // 3 seconds
): BlackboxFlightData {
  const zero = makeSeries(() => 0, numSamples);
  const throttle = makeSeries(() => 0.5, numSamples);

  return {
    gyro: [
      makeSeries(gyroFns[0], numSamples),
      makeSeries(gyroFns[1], numSamples),
      makeSeries(gyroFns[2], numSamples),
    ],
    setpoint: [
      makeSeries(setpointFns[0], numSamples),
      makeSeries(setpointFns[1], numSamples),
      makeSeries(setpointFns[2], numSamples),
      throttle,
    ],
    pidP: [zero, zero, zero],
    pidI: [zero, zero, zero],
    pidD: [zero, zero, zero],
    pidF: [zero, zero, zero],
    motor: [zero, zero, zero, zero],
    debug: [],
    sampleRateHz: SAMPLE_RATE,
    durationSeconds: numSamples / SAMPLE_RATE,
    frameCount: numSamples,
  };
}

describe('TransferFunctionEstimator', () => {
  describe('computeAxisTransferFunction', () => {
    it('should return transfer function for valid input', () => {
      const n = 8192;
      // Setpoint = white noise, gyro = same (perfect tracking)
      const sp = new Float64Array(n);
      const gyro = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        sp[i] = (Math.random() - 0.5) * 200;
        gyro[i] = sp[i]; // Perfect tracking
      }

      const tf = computeAxisTransferFunction(sp, gyro, SAMPLE_RATE);
      expect(tf).toBeDefined();
      expect(tf!.frequencies.length).toBeGreaterThan(0);
      expect(tf!.magnitude.length).toBe(tf!.frequencies.length);
      expect(tf!.phase.length).toBe(tf!.frequencies.length);
    });

    it('should return magnitude near 1 for perfect broadband tracking', () => {
      const n = 16384;
      const sp = new Float64Array(n);
      const gyro = new Float64Array(n);
      // Broadband input ensures energy at all frequencies → regularization negligible
      let seed = 42;
      for (let i = 0; i < n; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        sp[i] = (seed / 0x7fffffff - 0.5) * 400;
        gyro[i] = sp[i]; // Perfect tracking
      }

      const tf = computeAxisTransferFunction(sp, gyro, SAMPLE_RATE);
      expect(tf).toBeDefined();

      // For broadband input, most bins should have magnitude near 1
      let count = 0;
      let nearOne = 0;
      for (let i = 0; i < tf!.frequencies.length; i++) {
        if (tf!.frequencies[i] >= 10 && tf!.frequencies[i] <= 200) {
          count++;
          if (tf!.magnitude[i] > 0.7 && tf!.magnitude[i] < 1.3) nearOne++;
        }
      }
      expect(nearOne / count).toBeGreaterThan(0.8);
    });

    it('should return undefined for signal shorter than window', () => {
      const sp = new Float64Array(100);
      const gyro = new Float64Array(100);
      const tf = computeAxisTransferFunction(sp, gyro, SAMPLE_RATE);
      expect(tf).toBeUndefined();
    });

    it('should return undefined for zero setpoint (no energy)', () => {
      const n = 8192;
      const sp = new Float64Array(n); // All zeros
      const gyro = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        gyro[i] = Math.sin(i * 0.1);
      }

      const tf = computeAxisTransferFunction(sp, gyro, SAMPLE_RATE);
      expect(tf).toBeUndefined();
    });

    it('should detect low-pass behavior when gyro lags setpoint', () => {
      const n = 16384;
      const sp = new Float64Array(n);
      const gyro = new Float64Array(n);

      // Multi-frequency setpoint; gyro tracks low freq but attenuates high freq
      for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE;
        sp[i] = Math.sin(2 * Math.PI * 10 * t) * 200 + Math.sin(2 * Math.PI * 100 * t) * 200;
        // Gyro tracks 10 Hz well but attenuates 100 Hz
        gyro[i] = Math.sin(2 * Math.PI * 10 * t) * 200 + Math.sin(2 * Math.PI * 100 * t) * 50;
      }

      const tf = computeAxisTransferFunction(sp, gyro, SAMPLE_RATE);
      expect(tf).toBeDefined();

      // Find magnitude near 10 Hz and 100 Hz
      let mag10 = 0;
      let mag100 = 0;
      for (let i = 0; i < tf!.frequencies.length; i++) {
        if (Math.abs(tf!.frequencies[i] - 10) < 2) mag10 = tf!.magnitude[i];
        if (Math.abs(tf!.frequencies[i] - 100) < 2) mag100 = tf!.magnitude[i];
      }

      // Magnitude at 100 Hz should be lower than at 10 Hz
      expect(mag10).toBeGreaterThan(mag100);
    });

    it('should handle large datasets without error', () => {
      const n = 32768;
      const sp = new Float64Array(n);
      const gyro = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        sp[i] = (Math.random() - 0.5) * 200;
        gyro[i] = sp[i] * 0.9;
      }

      const tf = computeAxisTransferFunction(sp, gyro, SAMPLE_RATE);
      expect(tf).toBeDefined();
    });
  });

  describe('extractFrequencyMetrics', () => {
    it('should extract valid metrics from a transfer function', () => {
      const n = 8192;
      const sp = new Float64Array(n);
      const gyro = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        sp[i] = (Math.random() - 0.5) * 200;
        gyro[i] = sp[i] * 0.95;
      }

      const tf = computeAxisTransferFunction(sp, gyro, SAMPLE_RATE)!;
      const metrics = extractFrequencyMetrics(tf, SAMPLE_RATE);

      expect(metrics.bandwidth3dB).toBeGreaterThan(0);
      expect(metrics.phaseMargin).toBeGreaterThanOrEqual(0);
      expect(metrics.peakResonance).toBeGreaterThan(0);
      expect(metrics.peakResonanceFrequency).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.estimatedOvershoot).toBe('number');
      expect(typeof metrics.estimatedRiseTimeMs).toBe('number');
    });

    it('should report high bandwidth for perfect broadband tracking', () => {
      const n = 16384;
      const sp = new Float64Array(n);
      const gyro = new Float64Array(n);
      // Use seeded PRNG for determinism
      let seed = 12345;
      for (let i = 0; i < n; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        sp[i] = (seed / 0x7fffffff - 0.5) * 400;
        gyro[i] = sp[i];
      }

      const tf = computeAxisTransferFunction(sp, gyro, SAMPLE_RATE)!;
      const metrics = extractFrequencyMetrics(tf, SAMPLE_RATE);

      // Perfect broadband tracking should have wide bandwidth
      expect(metrics.bandwidth3dB).toBeGreaterThan(50);
    });

    it('should report peak resonance >= 1 for underdamped response', () => {
      const n = 16384;
      const sp = new Float64Array(n);
      const gyro = new Float64Array(n);

      // Create an underdamped system: gyro amplifies near 60 Hz
      for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE;
        sp[i] = Math.sin(2 * Math.PI * 60 * t) * 200 + Math.sin(2 * Math.PI * 10 * t) * 100;
        gyro[i] =
          Math.sin(2 * Math.PI * 60 * t) * 400 + // 2x amplification at 60 Hz
          Math.sin(2 * Math.PI * 10 * t) * 100;
      }

      const tf = computeAxisTransferFunction(sp, gyro, SAMPLE_RATE)!;
      const metrics = extractFrequencyMetrics(tf, SAMPLE_RATE);

      // Should see peak resonance > 1 due to the amplification at 60 Hz
      expect(metrics.peakResonance).toBeGreaterThan(1);
    });

    it('should return rounded values', () => {
      const n = 8192;
      const sp = new Float64Array(n);
      const gyro = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        sp[i] = (Math.random() - 0.5) * 200;
        gyro[i] = sp[i] * 0.9;
      }

      const tf = computeAxisTransferFunction(sp, gyro, SAMPLE_RATE)!;
      const metrics = extractFrequencyMetrics(tf, SAMPLE_RATE);

      // bandwidth3dB should be rounded to 1 decimal
      expect(metrics.bandwidth3dB).toBe(Math.round(metrics.bandwidth3dB * 10) / 10);
      expect(metrics.peakResonance).toBe(Math.round(metrics.peakResonance * 1000) / 1000);
    });
  });

  describe('computeSyntheticStepResponse', () => {
    it('should return zero overshoot for flat transfer function', () => {
      // A flat |H|=1, phase=0 transfer function → unit impulse → step = ramp to 1
      const numBins = 2049; // (4096/2 + 1)
      const frequencies = new Float64Array(numBins);
      const magnitude = new Float64Array(numBins);
      const phase = new Float64Array(numBins);

      for (let i = 0; i < numBins; i++) {
        frequencies[i] = (i * SAMPLE_RATE) / 4096;
        magnitude[i] = 1.0;
        phase[i] = 0;
      }

      const { overshoot } = computeSyntheticStepResponse(
        { frequencies, magnitude, phase },
        SAMPLE_RATE
      );

      // Flat TF has no overshoot (it's a delta → step = constant)
      expect(overshoot).toBeLessThan(5);
    });

    it('should return non-negative overshoot', () => {
      const n = 8192;
      const sp = new Float64Array(n);
      const gyro = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        sp[i] = (Math.random() - 0.5) * 200;
        gyro[i] = sp[i] * 0.8;
      }

      const tf = computeAxisTransferFunction(sp, gyro, SAMPLE_RATE)!;
      const { overshoot, riseTimeMs } = computeSyntheticStepResponse(tf, SAMPLE_RATE);

      expect(overshoot).toBeGreaterThanOrEqual(0);
      expect(riseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty transfer function gracefully', () => {
      const tf = {
        frequencies: new Float64Array(0),
        magnitude: new Float64Array(0),
        phase: new Float64Array(0),
      };
      const { overshoot, riseTimeMs } = computeSyntheticStepResponse(tf, SAMPLE_RATE);
      expect(overshoot).toBe(0);
      expect(riseTimeMs).toBe(0);
    });
  });

  describe('estimateTransferFunctions', () => {
    it('should return results for flight data with setpoint activity', () => {
      const data = createFlightData(
        [
          (i) => Math.sin((2 * Math.PI * 30 * i) / SAMPLE_RATE) * 200,
          (i) => Math.sin((2 * Math.PI * 20 * i) / SAMPLE_RATE) * 150,
          () => 0,
        ],
        [
          (i) => Math.sin((2 * Math.PI * 30 * i) / SAMPLE_RATE) * 190,
          (i) => Math.sin((2 * Math.PI * 20 * i) / SAMPLE_RATE) * 140,
          () => 0,
        ]
      );

      const result = estimateTransferFunctions(data);
      expect(result).toBeDefined();
      // Roll and pitch should have results (they have setpoint activity)
      expect(result!.roll).toBeDefined();
      expect(result!.pitch).toBeDefined();
      // Yaw has no setpoint → no result
      expect(result!.yaw).toBeUndefined();
    });

    it('should return undefined for too-short data', () => {
      const data = createFlightData(
        [(i) => i * 10, (i) => i * 10, () => 0],
        [(i) => i * 10, (i) => i * 10, () => 0],
        100 // Only 100 samples
      );

      const result = estimateTransferFunctions(data);
      expect(result).toBeUndefined();
    });

    it('should return undefined when all setpoints are zero', () => {
      const data = createFlightData(
        [() => 0, () => 0, () => 0],
        [(i) => Math.sin(i * 0.1), (i) => Math.sin(i * 0.1), (i) => Math.sin(i * 0.1)]
      );

      const result = estimateTransferFunctions(data);
      expect(result).toBeUndefined();
    });

    it('should include metrics in axis results', () => {
      const data = createFlightData(
        [(i) => (Math.random() - 0.5) * 300, () => 0, () => 0],
        [(i) => (Math.random() - 0.5) * 250, () => 0, () => 0]
      );

      const result = estimateTransferFunctions(data);
      if (result?.roll) {
        expect(result.roll.metrics).toBeDefined();
        expect(result.roll.metrics.bandwidth3dB).toBeGreaterThan(0);
        expect(result.roll.transferFunction.frequencies.length).toBeGreaterThan(0);
        expect(result.roll.axis).toBe('roll');
      }
    });

    it('should produce frequency bins up to Nyquist', () => {
      const data = createFlightData(
        [(i) => Math.sin((2 * Math.PI * 50 * i) / SAMPLE_RATE) * 200, () => 0, () => 0],
        [(i) => Math.sin((2 * Math.PI * 50 * i) / SAMPLE_RATE) * 180, () => 0, () => 0]
      );

      const result = estimateTransferFunctions(data);
      if (result?.roll) {
        const maxFreq =
          result.roll.transferFunction.frequencies[
            result.roll.transferFunction.frequencies.length - 1
          ];
        expect(maxFreq).toBe(SAMPLE_RATE / 2);
      }
    });

    it('should return phase values in degrees', () => {
      const data = createFlightData(
        [(i) => (Math.random() - 0.5) * 300, () => 0, () => 0],
        [(i) => (Math.random() - 0.5) * 250, () => 0, () => 0]
      );

      const result = estimateTransferFunctions(data);
      if (result?.roll) {
        for (let i = 0; i < result.roll.transferFunction.phase.length; i++) {
          const p = result.roll.transferFunction.phase[i];
          expect(p).toBeGreaterThanOrEqual(-180);
          expect(p).toBeLessThanOrEqual(180);
        }
      }
    });
  });
});
