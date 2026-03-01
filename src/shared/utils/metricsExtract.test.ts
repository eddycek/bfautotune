import { describe, it, expect } from 'vitest';
import { downsampleSpectrum, extractFilterMetrics, extractPIDMetrics } from './metricsExtract';
import type { FilterAnalysisResult, PIDAnalysisResult } from '../types/analysis.types';

describe('downsampleSpectrum', () => {
  it('returns correct number of bins', () => {
    const freqs = Float64Array.from({ length: 1000 }, (_, i) => i * 4); // 0-3996 Hz
    const mags = Float64Array.from({ length: 1000 }, (_, i) => -60 + i * 0.01);
    const result = downsampleSpectrum(freqs, { roll: mags, pitch: mags, yaw: mags });
    expect(result.frequencies).toHaveLength(128);
    expect(result.roll).toHaveLength(128);
    expect(result.pitch).toHaveLength(128);
    expect(result.yaw).toHaveLength(128);
  });

  it('respects custom targetBins parameter', () => {
    const freqs = Float64Array.from({ length: 500 }, (_, i) => i * 8);
    const mags = Float64Array.from({ length: 500 }, () => -40);
    const result = downsampleSpectrum(freqs, { roll: mags, pitch: mags, yaw: mags }, 64);
    expect(result.frequencies).toHaveLength(64);
  });

  it('handles empty input', () => {
    const empty = new Float64Array(0);
    const result = downsampleSpectrum(empty, { roll: empty, pitch: empty, yaw: empty });
    expect(result.frequencies).toHaveLength(0);
    expect(result.roll).toHaveLength(0);
  });

  it('interpolates values accurately', () => {
    // Linear ramp: 0 Hz = -80 dB, 4000 Hz = 0 dB → slope = 0.02 dB/Hz
    const freqs = Float64Array.from({ length: 401 }, (_, i) => i * 10); // 0-4000 Hz, step 10
    const mags = Float64Array.from({ length: 401 }, (_, i) => -80 + i * 0.2);
    const result = downsampleSpectrum(freqs, { roll: mags, pitch: mags, yaw: mags }, 8, 4000);

    // Bin 0: center = 250 Hz → -80 + 250*0.02 = -75 dB
    expect(result.frequencies[0]).toBeCloseTo(250, 0);
    expect(result.roll[0]).toBeCloseTo(-75, 1);
  });

  it('rounds frequencies to 0.1 Hz and values to 2 decimal places', () => {
    const freqs = Float64Array.from([0, 100, 200, 300, 400]);
    const mags = Float64Array.from([-60.1234, -55.5678, -50.9999, -45.0001, -40.5555]);
    const result = downsampleSpectrum(freqs, { roll: mags, pitch: mags, yaw: mags }, 4, 400);

    for (const f of result.frequencies) {
      expect(Math.round(f * 10) / 10).toBe(f);
    }
    for (const v of result.roll) {
      expect(Math.round(v * 100) / 100).toBe(v);
    }
  });

  it('clamps to actual data range when maxFreqHz exceeds data', () => {
    const freqs = Float64Array.from([0, 500, 1000]);
    const mags = Float64Array.from([-60, -40, -20]);
    const result = downsampleSpectrum(freqs, { roll: mags, pitch: mags, yaw: mags }, 4, 8000);

    // maxFreqHz clamped to 1000, so bins span 0-1000
    expect(result.frequencies[3]).toBeLessThanOrEqual(1000);
  });

  it('preserves per-axis differences', () => {
    const freqs = Float64Array.from([0, 1000, 2000, 3000, 4000]);
    const rollMags = Float64Array.from([-60, -50, -40, -30, -20]);
    const pitchMags = Float64Array.from([-70, -60, -50, -40, -30]);
    const yawMags = Float64Array.from([-80, -70, -60, -50, -40]);
    const result = downsampleSpectrum(freqs, { roll: rollMags, pitch: pitchMags, yaw: yawMags }, 4);

    // Each axis should have different values
    expect(result.roll[0]).not.toBe(result.pitch[0]);
    expect(result.pitch[0]).not.toBe(result.yaw[0]);
    // Roll should be higher (less negative) than pitch, pitch higher than yaw
    expect(result.roll[0]).toBeGreaterThan(result.pitch[0]);
    expect(result.pitch[0]).toBeGreaterThan(result.yaw[0]);
  });
});

function makeFilterResult(overrides?: Partial<FilterAnalysisResult>): FilterAnalysisResult {
  const freqs = Float64Array.from([0, 500, 1000, 1500, 2000]);
  const mags = Float64Array.from([-60, -50, -45, -40, -35]);
  return {
    noise: {
      roll: {
        spectrum: { frequencies: freqs, magnitudes: mags },
        noiseFloorDb: -55.123,
        peaks: [{ frequency: 150, amplitude: 10, type: 'frame_resonance' }],
      },
      pitch: {
        spectrum: { frequencies: freqs, magnitudes: Float64Array.from([-62, -52, -47, -42, -37]) },
        noiseFloorDb: -57.456,
        peaks: [],
      },
      yaw: {
        spectrum: { frequencies: freqs, magnitudes: Float64Array.from([-65, -55, -50, -45, -40]) },
        noiseFloorDb: -60.789,
        peaks: [
          { frequency: 100, amplitude: 8, type: 'motor_harmonic' },
          { frequency: 300, amplitude: 5, type: 'unknown' },
        ],
      },
      overallLevel: 'medium',
    },
    recommendations: [],
    summary: 'Moderate noise detected.',
    analysisTimeMs: 250,
    sessionIndex: 0,
    segmentsUsed: 3,
    rpmFilterActive: true,
    ...overrides,
  };
}

describe('extractFilterMetrics', () => {
  it('extracts all fields correctly', () => {
    const result = makeFilterResult();
    const metrics = extractFilterMetrics(result);

    expect(metrics.noiseLevel).toBe('medium');
    expect(metrics.roll.noiseFloorDb).toBe(-55.12);
    expect(metrics.roll.peakCount).toBe(1);
    expect(metrics.pitch.noiseFloorDb).toBe(-57.46);
    expect(metrics.pitch.peakCount).toBe(0);
    expect(metrics.yaw.noiseFloorDb).toBe(-60.79);
    expect(metrics.yaw.peakCount).toBe(2);
    expect(metrics.segmentsUsed).toBe(3);
    expect(metrics.rpmFilterActive).toBe(true);
    expect(metrics.summary).toBe('Moderate noise detected.');
  });

  it('includes downsampled spectrum', () => {
    const result = makeFilterResult();
    const metrics = extractFilterMetrics(result);

    expect(metrics.spectrum).toBeDefined();
    expect(metrics.spectrum!.frequencies.length).toBeGreaterThan(0);
    expect(metrics.spectrum!.roll.length).toBe(metrics.spectrum!.frequencies.length);
  });

  it('handles undefined rpmFilterActive', () => {
    const result = makeFilterResult({ rpmFilterActive: undefined });
    const metrics = extractFilterMetrics(result);
    expect(metrics.rpmFilterActive).toBeUndefined();
  });
});

function makePIDResult(overrides?: Partial<PIDAnalysisResult>): PIDAnalysisResult {
  return {
    roll: {
      responses: [],
      meanOvershoot: 12.345,
      meanRiseTimeMs: 8.567,
      meanSettlingTimeMs: 25.123,
      meanLatencyMs: 3.789,
      meanTrackingErrorRMS: 0.1234,
      meanSteadyStateError: 0,
    },
    pitch: {
      responses: [],
      meanOvershoot: 10.111,
      meanRiseTimeMs: 9.222,
      meanSettlingTimeMs: 22.333,
      meanLatencyMs: 4.444,
      meanTrackingErrorRMS: 0.0987,
      meanSteadyStateError: 0,
    },
    yaw: {
      responses: [],
      meanOvershoot: 15.555,
      meanRiseTimeMs: 11.666,
      meanSettlingTimeMs: 30.777,
      meanLatencyMs: 5.888,
      meanTrackingErrorRMS: 0.1567,
      meanSteadyStateError: 0,
    },
    recommendations: [],
    summary: 'Good PID response.',
    analysisTimeMs: 150,
    sessionIndex: 0,
    stepsDetected: 42,
    currentPIDs: {
      roll: { P: 45, I: 80, D: 30 },
      pitch: { P: 47, I: 82, D: 32 },
      yaw: { P: 35, I: 90, D: 0 },
    },
    ...overrides,
  };
}

describe('extractPIDMetrics', () => {
  it('extracts all fields correctly', () => {
    const result = makePIDResult();
    const metrics = extractPIDMetrics(result);

    expect(metrics.roll.meanOvershoot).toBe(12.35);
    expect(metrics.roll.meanRiseTimeMs).toBe(8.57);
    expect(metrics.roll.meanSettlingTimeMs).toBe(25.12);
    expect(metrics.roll.meanLatencyMs).toBe(3.79);

    expect(metrics.pitch.meanOvershoot).toBe(10.11);
    expect(metrics.yaw.meanOvershoot).toBe(15.56);

    expect(metrics.stepsDetected).toBe(42);
    expect(metrics.currentPIDs.roll.P).toBe(45);
    expect(metrics.summary).toBe('Good PID response.');
  });

  it('handles zero steps detected', () => {
    const result = makePIDResult({
      stepsDetected: 0,
      roll: {
        responses: [],
        meanOvershoot: 0,
        meanRiseTimeMs: 0,
        meanSettlingTimeMs: 0,
        meanLatencyMs: 0,
        meanTrackingErrorRMS: 0,
        meanSteadyStateError: 0,
      },
      pitch: {
        responses: [],
        meanOvershoot: 0,
        meanRiseTimeMs: 0,
        meanSettlingTimeMs: 0,
        meanLatencyMs: 0,
        meanTrackingErrorRMS: 0,
        meanSteadyStateError: 0,
      },
      yaw: {
        responses: [],
        meanOvershoot: 0,
        meanRiseTimeMs: 0,
        meanSettlingTimeMs: 0,
        meanLatencyMs: 0,
        meanTrackingErrorRMS: 0,
        meanSteadyStateError: 0,
      },
    });
    const metrics = extractPIDMetrics(result);
    expect(metrics.stepsDetected).toBe(0);
    expect(metrics.roll.meanOvershoot).toBe(0);
  });

  it('extracts meanTrackingErrorRMS per axis', () => {
    const result = makePIDResult();
    const metrics = extractPIDMetrics(result);
    expect(metrics.roll.meanTrackingErrorRMS).toBeDefined();
    expect(metrics.pitch.meanTrackingErrorRMS).toBeDefined();
    expect(metrics.yaw.meanTrackingErrorRMS).toBeDefined();
  });
});
