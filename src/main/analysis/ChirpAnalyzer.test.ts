import { describe, it, expect } from 'vitest';
import {
  detectChirpSignal,
  computeCrossSpectralTransfer,
  extractBodeMetrics,
  analyzeChirp,
} from './ChirpAnalyzer';
import type { BlackboxFlightData, TimeSeries } from '@shared/types/blackbox.types';
import type { TransferFunction } from '@shared/types/analysis.types';

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

function createFlightData(opts: {
  sampleRate?: number;
  numSamples?: number;
  rollSetpointFn?: (i: number) => number;
  rollGyroFn?: (i: number) => number;
  pitchSetpointFn?: (i: number) => number;
  pitchGyroFn?: (i: number) => number;
  yawSetpointFn?: (i: number) => number;
  yawGyroFn?: (i: number) => number;
}): BlackboxFlightData {
  const sr = opts.sampleRate ?? SAMPLE_RATE;
  const n = opts.numSamples ?? sr * 5;
  const zero = makeSeries(() => 0, n);
  const throttle = makeSeries(() => 0.5, n);

  return {
    gyro: [
      makeSeries(opts.rollGyroFn ?? (() => 0), n),
      makeSeries(opts.pitchGyroFn ?? (() => 0), n),
      makeSeries(opts.yawGyroFn ?? (() => 0), n),
    ],
    setpoint: [
      makeSeries(opts.rollSetpointFn ?? (() => 0), n),
      makeSeries(opts.pitchSetpointFn ?? (() => 0), n),
      makeSeries(opts.yawSetpointFn ?? (() => 0), n),
      throttle,
    ],
    pidP: [zero, zero, zero],
    pidI: [zero, zero, zero],
    pidD: [zero, zero, zero],
    pidF: [zero, zero, zero],
    motor: [zero, zero, zero, zero],
    debug: [],
    sampleRateHz: sr,
    durationSeconds: n / sr,
    frameCount: n,
  };
}

/**
 * Generate a linear chirp signal: amplitude * sin(2π * f(t) * t)
 * where f(t) = f0 + (f1 - f0) * t / duration (instantaneous frequency)
 * Phase: φ(t) = 2π * (f0 * t + (f1 - f0) * t² / (2 * duration))
 */
function chirpSignal(
  sampleRate: number,
  numSamples: number,
  f0: number,
  f1: number,
  amplitude: number = 100
): (i: number) => number {
  const duration = numSamples / sampleRate;
  return (i: number) => {
    const t = i / sampleRate;
    const phase = 2 * Math.PI * (f0 * t + ((f1 - f0) * t * t) / (2 * duration));
    return amplitude * Math.sin(phase);
  };
}

describe('ChirpAnalyzer', () => {
  describe('detectChirpSignal', () => {
    it('should detect chirp from debug_mode=CHIRP header', () => {
      const data = createFlightData({});
      const headers = new Map<string, string>();
      headers.set('debug_mode', 'CHIRP');

      const result = detectChirpSignal(data, headers);

      expect(result.detected).toBe(true);
      expect(result.source).toBe('header');
      expect(result.axis).toBe(0);
    });

    it('should detect chirp from debug_mode=SYS_ID header', () => {
      const data = createFlightData({});
      const headers = new Map<string, string>();
      headers.set('debug_mode', 'SYS_ID');
      headers.set('chirp_axis', '1');

      const result = detectChirpSignal(data, headers);

      expect(result.detected).toBe(true);
      expect(result.source).toBe('header');
      expect(result.axis).toBe(1);
    });

    it('should handle case-insensitive debug_mode', () => {
      const data = createFlightData({});
      const headers = new Map<string, string>();
      headers.set('debug_mode', 'chirp');

      const result = detectChirpSignal(data, headers);

      expect(result.detected).toBe(true);
      expect(result.source).toBe('header');
    });

    it('should default to axis 0 when chirp_axis not provided', () => {
      const data = createFlightData({});
      const headers = new Map<string, string>();
      headers.set('debug_mode', 'CHIRP');

      const result = detectChirpSignal(data, headers);

      expect(result.axis).toBe(0);
    });

    it('should clamp invalid chirp_axis to 0', () => {
      const data = createFlightData({});
      const headers = new Map<string, string>();
      headers.set('debug_mode', 'CHIRP');
      headers.set('chirp_axis', '5');

      const result = detectChirpSignal(data, headers);

      expect(result.axis).toBe(0);
    });

    it('should detect swept-sine pattern in setpoint', () => {
      // 5 seconds of chirp from 10 Hz to 200 Hz on roll
      const n = SAMPLE_RATE * 5;
      const chirpFn = chirpSignal(SAMPLE_RATE, n, 10, 200, 150);
      const data = createFlightData({
        numSamples: n,
        rollSetpointFn: chirpFn,
        rollGyroFn: chirpFn,
      });

      const result = detectChirpSignal(data);

      expect(result.detected).toBe(true);
      expect(result.source).toBe('pattern');
      expect(result.axis).toBe(0);
      expect(result.durationSeconds).toBeGreaterThan(2);
    });

    it('should detect chirp on pitch axis', () => {
      const n = SAMPLE_RATE * 5;
      const chirpFn = chirpSignal(SAMPLE_RATE, n, 10, 200, 150);
      const data = createFlightData({
        numSamples: n,
        pitchSetpointFn: chirpFn,
        pitchGyroFn: chirpFn,
      });

      const result = detectChirpSignal(data);

      expect(result.detected).toBe(true);
      expect(result.axis).toBe(1);
    });

    it('should not detect chirp in constant signal', () => {
      const data = createFlightData({
        rollSetpointFn: () => 100,
        rollGyroFn: () => 100,
      });

      const result = detectChirpSignal(data);

      expect(result.detected).toBe(false);
      expect(result.source).toBe('none');
    });

    it('should not detect chirp in pure sine wave', () => {
      const n = SAMPLE_RATE * 5;
      const data = createFlightData({
        numSamples: n,
        rollSetpointFn: (i) => 100 * Math.sin((2 * Math.PI * 50 * i) / SAMPLE_RATE),
        rollGyroFn: (i) => 100 * Math.sin((2 * Math.PI * 50 * i) / SAMPLE_RATE),
      });

      const result = detectChirpSignal(data);

      expect(result.detected).toBe(false);
    });

    it('should not detect chirp in silent signal', () => {
      const data = createFlightData({});

      const result = detectChirpSignal(data);

      expect(result.detected).toBe(false);
      expect(result.source).toBe('none');
    });

    it('should prefer header detection over pattern detection', () => {
      const n = SAMPLE_RATE * 5;
      const chirpFn = chirpSignal(SAMPLE_RATE, n, 10, 200, 150);
      const data = createFlightData({
        numSamples: n,
        rollSetpointFn: chirpFn,
        rollGyroFn: chirpFn,
      });
      const headers = new Map<string, string>();
      headers.set('debug_mode', 'CHIRP');
      headers.set('chirp_axis', '2');

      const result = detectChirpSignal(data, headers);

      expect(result.source).toBe('header');
      expect(result.axis).toBe(2);
    });
  });

  describe('computeCrossSpectralTransfer', () => {
    it('should return magnitude near 1 for identical input/output', () => {
      const n = 32768;
      // Use broadband chirp as input — provides energy at all frequencies
      const inputFn = chirpSignal(SAMPLE_RATE, n, 5, 500, 100);
      const input = new Float64Array(n);
      const output = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const val = inputFn(i);
        input[i] = val;
        output[i] = val;
      }

      const result = computeCrossSpectralTransfer(input, output, SAMPLE_RATE);

      expect(result).toBeDefined();
      // Check magnitude near 1 in the chirp frequency range
      let nearOne = 0;
      let total = 0;
      for (let i = 0; i < result!.transferFunction.frequencies.length; i++) {
        const f = result!.transferFunction.frequencies[i];
        if (f >= 10 && f <= 400) {
          total++;
          if (Math.abs(result!.transferFunction.magnitude[i] - 1) < 0.15) nearOne++;
        }
      }
      expect(nearOne / total).toBeGreaterThan(0.7);
    });

    it('should return coherence near 1 for identical signals', () => {
      const n = 32768;
      const inputFn = chirpSignal(SAMPLE_RATE, n, 5, 500, 100);
      const input = new Float64Array(n);
      const output = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const val = inputFn(i);
        input[i] = val;
        output[i] = val;
      }

      const result = computeCrossSpectralTransfer(input, output, SAMPLE_RATE);

      expect(result).toBeDefined();
      let highCoherence = 0;
      let total = 0;
      for (let i = 0; i < result!.coherence.frequencies.length; i++) {
        const f = result!.coherence.frequencies[i];
        if (f >= 10 && f <= 400) {
          total++;
          if (result!.coherence.coherence[i] > 0.9) highCoherence++;
        }
      }
      expect(highCoherence / total).toBeGreaterThan(0.8);
    });

    it('should return magnitude near gain for scaled output', () => {
      const n = 32768;
      const gain = 0.5;
      const inputFn = chirpSignal(SAMPLE_RATE, n, 5, 500, 100);
      const input = new Float64Array(n);
      const output = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const val = inputFn(i);
        input[i] = val;
        output[i] = val * gain;
      }

      const result = computeCrossSpectralTransfer(input, output, SAMPLE_RATE);

      expect(result).toBeDefined();
      let nearGain = 0;
      let total = 0;
      for (let i = 0; i < result!.transferFunction.frequencies.length; i++) {
        const f = result!.transferFunction.frequencies[i];
        if (f >= 10 && f <= 400) {
          total++;
          if (Math.abs(result!.transferFunction.magnitude[i] - gain) < 0.1) nearGain++;
        }
      }
      expect(nearGain / total).toBeGreaterThan(0.7);
    });

    it('should detect phase shift in delayed output', () => {
      const n = 32768;
      const freq = 50;
      const delaySamples = 2;
      const input = new Float64Array(n);
      const output = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        input[i] = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) * 100;
        output[i] =
          i >= delaySamples
            ? Math.sin((2 * Math.PI * freq * (i - delaySamples)) / SAMPLE_RATE) * 100
            : 0;
      }

      const result = computeCrossSpectralTransfer(input, output, SAMPLE_RATE);

      expect(result).toBeDefined();
      // At 50 Hz, 2 samples at 4000 Hz = 0.5ms delay = 9° phase shift
      const freqBin = Math.round((freq * 8192) / SAMPLE_RATE);
      const measuredPhase = result!.transferFunction.phase[freqBin];
      // Phase should be negative (delay)
      expect(measuredPhase).toBeLessThan(0);
    });

    it('should return undefined for signal shorter than window', () => {
      const input = new Float64Array(100);
      const output = new Float64Array(100);

      const result = computeCrossSpectralTransfer(input, output, SAMPLE_RATE);

      expect(result).toBeUndefined();
    });

    it('should handle uncorrelated signals with low coherence', () => {
      const n = 65536;
      const input = new Float64Array(n);
      const output = new Float64Array(n);
      // Use structurally uncorrelated deterministic signals:
      // input = sum of sines at prime frequencies, output = different primes
      for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE;
        input[i] =
          50 * Math.sin(2 * Math.PI * 37 * t) +
          40 * Math.sin(2 * Math.PI * 89 * t + 1.3) +
          30 * Math.sin(2 * Math.PI * 173 * t + 2.7);
        output[i] =
          50 * Math.sin(2 * Math.PI * 53 * t + 0.5) +
          40 * Math.sin(2 * Math.PI * 127 * t + 1.8) +
          30 * Math.sin(2 * Math.PI * 211 * t + 3.1);
      }

      const result = computeCrossSpectralTransfer(input, output, SAMPLE_RATE);

      expect(result).toBeDefined();
      // Mean coherence should be low for uncorrelated signals
      let cohSum = 0;
      let count = 0;
      for (let i = 0; i < result!.coherence.coherence.length; i++) {
        const f = result!.coherence.frequencies[i];
        if (f >= 10 && f <= 500) {
          cohSum += result!.coherence.coherence[i];
          count++;
        }
      }
      expect(cohSum / count).toBeLessThan(0.3);
    });
  });

  describe('extractBodeMetrics', () => {
    it('should compute bandwidth for ideal lowpass system', () => {
      const numBins = 513;
      const freqRes = SAMPLE_RATE / ((numBins - 1) * 2);
      const frequencies = new Float64Array(numBins);
      const magnitude = new Float64Array(numBins);
      const phase = new Float64Array(numBins);

      const cutoff = 100; // Hz
      for (let i = 0; i < numBins; i++) {
        frequencies[i] = i * freqRes;
        // First-order lowpass: H(f) = 1 / sqrt(1 + (f/fc)²)
        const fRatio = frequencies[i] / cutoff;
        magnitude[i] = 1 / Math.sqrt(1 + fRatio * fRatio);
        phase[i] = -Math.atan(fRatio) * (180 / Math.PI);
      }

      const tf: TransferFunction = { frequencies, magnitude, phase };
      const metrics = extractBodeMetrics(tf, SAMPLE_RATE);

      // -3dB bandwidth should be near cutoff frequency
      expect(metrics.bandwidth3dB).toBeGreaterThan(cutoff * 0.8);
      expect(metrics.bandwidth3dB).toBeLessThan(cutoff * 1.2);
    });

    it('should detect peak resonance', () => {
      const numBins = 513;
      const freqRes = SAMPLE_RATE / ((numBins - 1) * 2);
      const frequencies = new Float64Array(numBins);
      const magnitude = new Float64Array(numBins);
      const phase = new Float64Array(numBins);

      const resonanceFreq = 80;
      const resonancePeak = 1.5;
      for (let i = 0; i < numBins; i++) {
        frequencies[i] = i * freqRes;
        magnitude[i] = 1.0;
        // Add a resonance peak
        const dist = Math.abs(frequencies[i] - resonanceFreq);
        if (dist < 20) {
          magnitude[i] = 1 + (resonancePeak - 1) * (1 - dist / 20);
        }
        phase[i] = 0;
      }

      const tf: TransferFunction = { frequencies, magnitude, phase };
      const metrics = extractBodeMetrics(tf, SAMPLE_RATE);

      expect(metrics.peakResonance).toBeGreaterThan(1.3);
      expect(metrics.peakResonanceFrequency).toBeGreaterThan(60);
      expect(metrics.peakResonanceFrequency).toBeLessThan(100);
    });

    it('should compute phase margin', () => {
      const numBins = 513;
      const freqRes = SAMPLE_RATE / ((numBins - 1) * 2);
      const frequencies = new Float64Array(numBins);
      const magnitude = new Float64Array(numBins);
      const phase = new Float64Array(numBins);

      // System with unity gain crossover at ~100 Hz and -135° phase there
      const cutoff = 100;
      for (let i = 0; i < numBins; i++) {
        frequencies[i] = i * freqRes;
        const fRatio = frequencies[i] / cutoff;
        // Second-order system: magnitude rolls off faster
        magnitude[i] = 1 / (1 + fRatio * fRatio);
        // Phase drops from 0 to -180
        phase[i] = -2 * Math.atan(fRatio) * (180 / Math.PI);
      }

      const tf: TransferFunction = { frequencies, magnitude, phase };
      const metrics = extractBodeMetrics(tf, SAMPLE_RATE);

      // Phase margin should be positive (stable system)
      expect(metrics.phaseMargin).toBeGreaterThan(0);
      expect(metrics.phaseMargin).toBeLessThan(180);
    });

    it('should return default margins when no crossover found', () => {
      const numBins = 513;
      const freqRes = SAMPLE_RATE / ((numBins - 1) * 2);
      const frequencies = new Float64Array(numBins);
      const magnitude = new Float64Array(numBins);
      const phase = new Float64Array(numBins);

      // Constant unity gain, zero phase (no crossovers)
      for (let i = 0; i < numBins; i++) {
        frequencies[i] = i * freqRes;
        magnitude[i] = 1.0;
        phase[i] = 0;
      }

      const tf: TransferFunction = { frequencies, magnitude, phase };
      const metrics = extractBodeMetrics(tf, SAMPLE_RATE);

      // Should return safe defaults
      expect(metrics.phaseMargin).toBe(90);
      expect(metrics.gainMargin).toBe(20);
    });
  });

  describe('analyzeChirp', () => {
    it('should return undefined when no chirp detected', () => {
      const data = createFlightData({});

      const result = analyzeChirp(data);

      expect(result).toBeUndefined();
    });

    it('should analyze chirp detected from headers', () => {
      const n = SAMPLE_RATE * 5;
      const chirpFn = chirpSignal(SAMPLE_RATE, n, 10, 200, 100);
      const data = createFlightData({
        numSamples: n,
        rollSetpointFn: chirpFn,
        rollGyroFn: chirpFn,
      });
      const headers = new Map<string, string>();
      headers.set('debug_mode', 'CHIRP');

      const result = analyzeChirp(data, headers);

      expect(result).toBeDefined();
      expect(result!.metadata.detected).toBe(true);
      expect(result!.metadata.source).toBe('header');
      expect(result!.axes.length).toBe(1);
      expect(result!.axes[0].axis).toBe('roll');
      expect(result!.axes[0].metrics.bandwidth3dB).toBeGreaterThan(0);
      expect(result!.axes[0].meanCoherence).toBeGreaterThan(0.5);
    });

    it('should analyze chirp detected from pattern', () => {
      const n = SAMPLE_RATE * 5;
      const chirpFn = chirpSignal(SAMPLE_RATE, n, 10, 200, 150);
      const data = createFlightData({
        numSamples: n,
        rollSetpointFn: chirpFn,
        rollGyroFn: chirpFn,
      });

      const result = analyzeChirp(data);

      expect(result).toBeDefined();
      expect(result!.metadata.source).toBe('pattern');
      expect(result!.axes.length).toBe(1);
    });

    it('should report transfer function with correct structure', () => {
      const n = SAMPLE_RATE * 5;
      const chirpFn = chirpSignal(SAMPLE_RATE, n, 10, 200, 100);
      const data = createFlightData({
        numSamples: n,
        rollSetpointFn: chirpFn,
        rollGyroFn: chirpFn,
      });
      const headers = new Map<string, string>();
      headers.set('debug_mode', 'CHIRP');

      const result = analyzeChirp(data, headers);

      expect(result).toBeDefined();
      const axis = result!.axes[0];
      expect(axis.transferFunction.frequencies).toBeInstanceOf(Float64Array);
      expect(axis.transferFunction.magnitude).toBeInstanceOf(Float64Array);
      expect(axis.transferFunction.phase).toBeInstanceOf(Float64Array);
      expect(axis.coherence.frequencies).toBeInstanceOf(Float64Array);
      expect(axis.coherence.coherence).toBeInstanceOf(Float64Array);
      expect(axis.transferFunction.frequencies.length).toBe(axis.transferFunction.magnitude.length);
    });

    it('should detect reduced gain in attenuated system', () => {
      const n = SAMPLE_RATE * 5;
      const chirpFn = chirpSignal(SAMPLE_RATE, n, 10, 200, 100);
      const data = createFlightData({
        numSamples: n,
        rollSetpointFn: chirpFn,
        rollGyroFn: (i) => chirpFn(i) * 0.5, // 50% attenuation
      });
      const headers = new Map<string, string>();
      headers.set('debug_mode', 'CHIRP');

      const result = analyzeChirp(data, headers);

      expect(result).toBeDefined();
      // Peak resonance should be around 0.5
      expect(result!.axes[0].metrics.peakResonance).toBeLessThan(0.8);
    });

    it('should return undefined for very short chirp data', () => {
      const n = 100; // Too short for FFT
      const data = createFlightData({
        numSamples: n,
        rollSetpointFn: (i) => Math.sin(i * 0.1) * 100,
        rollGyroFn: (i) => Math.sin(i * 0.1) * 100,
      });
      const headers = new Map<string, string>();
      headers.set('debug_mode', 'CHIRP');

      const result = analyzeChirp(data, headers);

      expect(result).toBeUndefined();
    });
  });
});
