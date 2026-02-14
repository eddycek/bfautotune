import { describe, it, expect } from 'vitest';
import { computeTuneQualityScore } from './tuneQualityScore';
import type { FilterMetricsSummary, PIDMetricsSummary } from '../types/tuning-history.types';

const perfectFilter: FilterMetricsSummary = {
  noiseLevel: 'low',
  roll: { noiseFloorDb: -60, peakCount: 0 },
  pitch: { noiseFloorDb: -60, peakCount: 0 },
  yaw: { noiseFloorDb: -60, peakCount: 0 },
  segmentsUsed: 5,
  summary: 'Perfect',
};

const perfectPID: PIDMetricsSummary = {
  roll: {
    meanOvershoot: 0,
    meanRiseTimeMs: 5,
    meanSettlingTimeMs: 50,
    meanLatencyMs: 2,
    meanTrackingErrorRMS: 0,
  },
  pitch: {
    meanOvershoot: 0,
    meanRiseTimeMs: 5,
    meanSettlingTimeMs: 50,
    meanLatencyMs: 2,
    meanTrackingErrorRMS: 0,
  },
  yaw: {
    meanOvershoot: 0,
    meanRiseTimeMs: 5,
    meanSettlingTimeMs: 50,
    meanLatencyMs: 2,
    meanTrackingErrorRMS: 0,
  },
  stepsDetected: 30,
  currentPIDs: {
    roll: { P: 45, I: 80, D: 30 },
    pitch: { P: 47, I: 82, D: 32 },
    yaw: { P: 35, I: 90, D: 0 },
  },
  summary: 'Perfect',
};

const worstFilter: FilterMetricsSummary = {
  noiseLevel: 'high',
  roll: { noiseFloorDb: -20, peakCount: 5 },
  pitch: { noiseFloorDb: -20, peakCount: 5 },
  yaw: { noiseFloorDb: -20, peakCount: 5 },
  segmentsUsed: 1,
  summary: 'Terrible',
};

const worstPID: PIDMetricsSummary = {
  roll: {
    meanOvershoot: 50,
    meanRiseTimeMs: 100,
    meanSettlingTimeMs: 500,
    meanLatencyMs: 30,
    meanTrackingErrorRMS: 0.5,
  },
  pitch: {
    meanOvershoot: 50,
    meanRiseTimeMs: 100,
    meanSettlingTimeMs: 500,
    meanLatencyMs: 30,
    meanTrackingErrorRMS: 0.5,
  },
  yaw: {
    meanOvershoot: 50,
    meanRiseTimeMs: 100,
    meanSettlingTimeMs: 500,
    meanLatencyMs: 30,
    meanTrackingErrorRMS: 0.5,
  },
  stepsDetected: 3,
  currentPIDs: {
    roll: { P: 45, I: 80, D: 30 },
    pitch: { P: 47, I: 82, D: 32 },
    yaw: { P: 35, I: 90, D: 0 },
  },
  summary: 'Terrible',
};

describe('computeTuneQualityScore', () => {
  it('returns null when both metrics are null', () => {
    expect(computeTuneQualityScore({ filterMetrics: null, pidMetrics: null })).toBeNull();
  });

  it('returns null when both metrics are undefined', () => {
    expect(computeTuneQualityScore({ filterMetrics: undefined, pidMetrics: undefined })).toBeNull();
  });

  it('returns 100 / excellent for perfect metrics', () => {
    const result = computeTuneQualityScore({
      filterMetrics: perfectFilter,
      pidMetrics: perfectPID,
    });
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(100);
    expect(result!.tier).toBe('excellent');
    expect(result!.components).toHaveLength(4);
  });

  it('returns 0 / poor for worst metrics', () => {
    const result = computeTuneQualityScore({ filterMetrics: worstFilter, pidMetrics: worstPID });
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(0);
    expect(result!.tier).toBe('poor');
  });

  it('returns mid-range score for mid-range metrics', () => {
    const midFilter: FilterMetricsSummary = {
      ...perfectFilter,
      roll: { noiseFloorDb: -40, peakCount: 2 },
      pitch: { noiseFloorDb: -40, peakCount: 2 },
      yaw: { noiseFloorDb: -40, peakCount: 2 },
    };
    const midPID: PIDMetricsSummary = {
      ...perfectPID,
      roll: {
        ...perfectPID.roll,
        meanOvershoot: 25,
        meanSettlingTimeMs: 275,
        meanTrackingErrorRMS: 0.25,
      },
      pitch: {
        ...perfectPID.pitch,
        meanOvershoot: 25,
        meanSettlingTimeMs: 275,
        meanTrackingErrorRMS: 0.25,
      },
      yaw: {
        ...perfectPID.yaw,
        meanOvershoot: 25,
        meanSettlingTimeMs: 275,
        meanTrackingErrorRMS: 0.25,
      },
    };
    const result = computeTuneQualityScore({ filterMetrics: midFilter, pidMetrics: midPID });
    expect(result).not.toBeNull();
    expect(result!.overall).toBeGreaterThanOrEqual(40);
    expect(result!.overall).toBeLessThanOrEqual(60);
  });

  it('redistributes to noise floor only when only filter metrics present', () => {
    const result = computeTuneQualityScore({ filterMetrics: perfectFilter, pidMetrics: null });
    expect(result).not.toBeNull();
    expect(result!.components).toHaveLength(1);
    expect(result!.components[0].label).toBe('Noise Floor');
    expect(result!.components[0].maxPoints).toBe(100);
    expect(result!.overall).toBe(100);
    expect(result!.tier).toBe('excellent');
  });

  it('redistributes to 3 PID components when only PID metrics present', () => {
    const result = computeTuneQualityScore({ filterMetrics: null, pidMetrics: perfectPID });
    expect(result).not.toBeNull();
    expect(result!.components).toHaveLength(3);
    expect(result!.components.every((c) => c.label !== 'Noise Floor')).toBe(true);
    expect(result!.overall).toBeGreaterThanOrEqual(99); // rounding: 33*3=99
  });

  it('handles old records without trackingErrorRMS (3-component score)', () => {
    const oldPID: PIDMetricsSummary = {
      roll: { meanOvershoot: 0, meanRiseTimeMs: 5, meanSettlingTimeMs: 50, meanLatencyMs: 2 },
      pitch: { meanOvershoot: 0, meanRiseTimeMs: 5, meanSettlingTimeMs: 50, meanLatencyMs: 2 },
      yaw: { meanOvershoot: 0, meanRiseTimeMs: 5, meanSettlingTimeMs: 50, meanLatencyMs: 2 },
      stepsDetected: 30,
      currentPIDs: {
        roll: { P: 45, I: 80, D: 30 },
        pitch: { P: 47, I: 82, D: 32 },
        yaw: { P: 35, I: 90, D: 0 },
      },
      summary: 'Old record',
    };
    const result = computeTuneQualityScore({ filterMetrics: perfectFilter, pidMetrics: oldPID });
    expect(result).not.toBeNull();
    // Noise Floor + Overshoot + Settling = 3 components (tracking RMS skipped)
    expect(result!.components).toHaveLength(3);
    expect(result!.components.find((c) => c.label === 'Tracking RMS')).toBeUndefined();
  });

  it('tier boundary: 80 → excellent', () => {
    // Craft metrics that produce score of 80
    // With 4 components × 25 pts, we need exactly 20 per component → 80%
    const filter: FilterMetricsSummary = {
      ...perfectFilter,
      roll: { noiseFloorDb: -52, peakCount: 0 }, // (52-20)/(60-20) = 0.8 → 20 pts
      pitch: { noiseFloorDb: -52, peakCount: 0 },
      yaw: { noiseFloorDb: -52, peakCount: 0 },
    };
    const pid: PIDMetricsSummary = {
      ...perfectPID,
      roll: {
        ...perfectPID.roll,
        meanOvershoot: 10,
        meanSettlingTimeMs: 140,
        meanTrackingErrorRMS: 0.1,
      },
      pitch: {
        ...perfectPID.pitch,
        meanOvershoot: 10,
        meanSettlingTimeMs: 140,
        meanTrackingErrorRMS: 0.1,
      },
      yaw: {
        ...perfectPID.yaw,
        meanOvershoot: 10,
        meanSettlingTimeMs: 140,
        meanTrackingErrorRMS: 0.1,
      },
    };
    const result = computeTuneQualityScore({ filterMetrics: filter, pidMetrics: pid });
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(80);
    expect(result!.tier).toBe('excellent');
  });

  it('tier boundary: 79 → good', () => {
    const filter: FilterMetricsSummary = {
      ...perfectFilter,
      roll: { noiseFloorDb: -51, peakCount: 0 },
      pitch: { noiseFloorDb: -51, peakCount: 0 },
      yaw: { noiseFloorDb: -51, peakCount: 0 },
    };
    const pid: PIDMetricsSummary = {
      ...perfectPID,
      roll: {
        ...perfectPID.roll,
        meanOvershoot: 10,
        meanSettlingTimeMs: 140,
        meanTrackingErrorRMS: 0.1,
      },
      pitch: {
        ...perfectPID.pitch,
        meanOvershoot: 10,
        meanSettlingTimeMs: 140,
        meanTrackingErrorRMS: 0.1,
      },
      yaw: {
        ...perfectPID.yaw,
        meanOvershoot: 10,
        meanSettlingTimeMs: 140,
        meanTrackingErrorRMS: 0.1,
      },
    };
    const result = computeTuneQualityScore({ filterMetrics: filter, pidMetrics: pid });
    expect(result).not.toBeNull();
    // noise floor score drops slightly → overall < 80
    expect(result!.overall).toBeLessThan(80);
    expect(result!.tier).toBe('good');
  });

  it('tier boundary: 60/59', () => {
    // Score ~60
    const filter60: FilterMetricsSummary = {
      ...perfectFilter,
      roll: { noiseFloorDb: -44, peakCount: 0 },
      pitch: { noiseFloorDb: -44, peakCount: 0 },
      yaw: { noiseFloorDb: -44, peakCount: 0 },
    };
    const pid60: PIDMetricsSummary = {
      ...perfectPID,
      roll: {
        ...perfectPID.roll,
        meanOvershoot: 20,
        meanSettlingTimeMs: 230,
        meanTrackingErrorRMS: 0.2,
      },
      pitch: {
        ...perfectPID.pitch,
        meanOvershoot: 20,
        meanSettlingTimeMs: 230,
        meanTrackingErrorRMS: 0.2,
      },
      yaw: {
        ...perfectPID.yaw,
        meanOvershoot: 20,
        meanSettlingTimeMs: 230,
        meanTrackingErrorRMS: 0.2,
      },
    };
    const result = computeTuneQualityScore({ filterMetrics: filter60, pidMetrics: pid60 });
    expect(result).not.toBeNull();
    expect(result!.overall).toBeGreaterThanOrEqual(58);
    expect(result!.overall).toBeLessThanOrEqual(62);
  });

  it('clamps values beyond range (better than best)', () => {
    const superFilter: FilterMetricsSummary = {
      ...perfectFilter,
      roll: { noiseFloorDb: -80, peakCount: 0 },
      pitch: { noiseFloorDb: -80, peakCount: 0 },
      yaw: { noiseFloorDb: -80, peakCount: 0 },
    };
    const result = computeTuneQualityScore({ filterMetrics: superFilter, pidMetrics: perfectPID });
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(100);
  });

  it('clamps values beyond range (worse than worst)', () => {
    const terribleFilter: FilterMetricsSummary = {
      ...perfectFilter,
      roll: { noiseFloorDb: 0, peakCount: 10 },
      pitch: { noiseFloorDb: 0, peakCount: 10 },
      yaw: { noiseFloorDb: 0, peakCount: 10 },
    };
    const terriblePID: PIDMetricsSummary = {
      ...worstPID,
      roll: {
        ...worstPID.roll,
        meanOvershoot: 100,
        meanSettlingTimeMs: 1000,
        meanTrackingErrorRMS: 1.0,
      },
      pitch: {
        ...worstPID.pitch,
        meanOvershoot: 100,
        meanSettlingTimeMs: 1000,
        meanTrackingErrorRMS: 1.0,
      },
      yaw: {
        ...worstPID.yaw,
        meanOvershoot: 100,
        meanSettlingTimeMs: 1000,
        meanTrackingErrorRMS: 1.0,
      },
    };
    const result = computeTuneQualityScore({
      filterMetrics: terribleFilter,
      pidMetrics: terriblePID,
    });
    expect(result).not.toBeNull();
    expect(result!.overall).toBe(0);
  });

  it('components have correct structure', () => {
    const result = computeTuneQualityScore({
      filterMetrics: perfectFilter,
      pidMetrics: perfectPID,
    });
    expect(result).not.toBeNull();
    for (const c of result!.components) {
      expect(c).toHaveProperty('label');
      expect(c).toHaveProperty('score');
      expect(c).toHaveProperty('maxPoints');
      expect(c).toHaveProperty('rawValue');
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(c.maxPoints);
    }
  });

  it('tier boundary: 40/39', () => {
    const filter: FilterMetricsSummary = {
      ...perfectFilter,
      roll: { noiseFloorDb: -36, peakCount: 0 },
      pitch: { noiseFloorDb: -36, peakCount: 0 },
      yaw: { noiseFloorDb: -36, peakCount: 0 },
    };
    const pid: PIDMetricsSummary = {
      ...perfectPID,
      roll: {
        ...perfectPID.roll,
        meanOvershoot: 30,
        meanSettlingTimeMs: 320,
        meanTrackingErrorRMS: 0.3,
      },
      pitch: {
        ...perfectPID.pitch,
        meanOvershoot: 30,
        meanSettlingTimeMs: 320,
        meanTrackingErrorRMS: 0.3,
      },
      yaw: {
        ...perfectPID.yaw,
        meanOvershoot: 30,
        meanSettlingTimeMs: 320,
        meanTrackingErrorRMS: 0.3,
      },
    };
    const result = computeTuneQualityScore({ filterMetrics: filter, pidMetrics: pid });
    expect(result).not.toBeNull();
    expect(result!.overall).toBeGreaterThanOrEqual(38);
    expect(result!.overall).toBeLessThanOrEqual(42);
  });
});
