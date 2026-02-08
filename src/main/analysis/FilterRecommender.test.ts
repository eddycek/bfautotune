import { describe, it, expect } from 'vitest';
import { recommend, generateSummary } from './FilterRecommender';
import type {
  NoiseProfile,
  AxisNoiseProfile,
  CurrentFilterSettings,
  NoisePeak,
} from '@shared/types/analysis.types';
import { DEFAULT_FILTER_SETTINGS } from '@shared/types/analysis.types';

function makeAxisProfile(
  noiseFloorDb: number,
  peaks: NoisePeak[] = []
): AxisNoiseProfile {
  return {
    spectrum: { frequencies: new Float64Array(0), magnitudes: new Float64Array(0) },
    noiseFloorDb,
    peaks,
  };
}

function makeNoiseProfile(opts: {
  level: NoiseProfile['overallLevel'];
  rollFloor?: number;
  pitchFloor?: number;
  yawFloor?: number;
  rollPeaks?: NoisePeak[];
  pitchPeaks?: NoisePeak[];
  yawPeaks?: NoisePeak[];
}): NoiseProfile {
  return {
    roll: makeAxisProfile(opts.rollFloor ?? -50, opts.rollPeaks),
    pitch: makeAxisProfile(opts.pitchFloor ?? -50, opts.pitchPeaks),
    yaw: makeAxisProfile(opts.yawFloor ?? -50, opts.yawPeaks),
    overallLevel: opts.level,
  };
}

describe('recommend', () => {
  it('should recommend lowering filters for high noise', () => {
    const noise = makeNoiseProfile({ level: 'high' });
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      gyro_lpf1_static_hz: 250,
      dterm_lpf1_static_hz: 150,
    };

    const recs = recommend(noise, current);
    const gyroRec = recs.find((r) => r.setting === 'gyro_lpf1_static_hz');
    const dtermRec = recs.find((r) => r.setting === 'dterm_lpf1_static_hz');

    expect(gyroRec).toBeDefined();
    expect(gyroRec!.recommendedValue).toBeLessThan(current.gyro_lpf1_static_hz);
    expect(dtermRec).toBeDefined();
    expect(dtermRec!.recommendedValue).toBeLessThan(current.dterm_lpf1_static_hz);
  });

  it('should recommend raising filters for low noise', () => {
    const noise = makeNoiseProfile({ level: 'low' });
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      gyro_lpf1_static_hz: 200,
      dterm_lpf1_static_hz: 120,
    };

    const recs = recommend(noise, current);
    const gyroRec = recs.find((r) => r.setting === 'gyro_lpf1_static_hz');
    const dtermRec = recs.find((r) => r.setting === 'dterm_lpf1_static_hz');

    expect(gyroRec).toBeDefined();
    expect(gyroRec!.recommendedValue).toBeGreaterThan(current.gyro_lpf1_static_hz);
    expect(dtermRec).toBeDefined();
    expect(dtermRec!.recommendedValue).toBeGreaterThan(current.dterm_lpf1_static_hz);
  });

  it('should not recommend changes for medium noise', () => {
    const noise = makeNoiseProfile({ level: 'medium' });
    const recs = recommend(noise, DEFAULT_FILTER_SETTINGS);

    // No noise-floor-based changes
    const gyroRec = recs.find((r) => r.setting === 'gyro_lpf1_static_hz');
    const dtermRec = recs.find((r) => r.setting === 'dterm_lpf1_static_hz');
    expect(gyroRec).toBeUndefined();
    expect(dtermRec).toBeUndefined();
  });

  it('should respect minimum safety bounds', () => {
    const noise = makeNoiseProfile({ level: 'high' });
    // Already at minimum (GYRO_LPF1_MIN_HZ=75, DTERM_LPF1_MIN_HZ=70)
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      gyro_lpf1_static_hz: 75,
      dterm_lpf1_static_hz: 70,
    };

    const recs = recommend(noise, current);
    // Should not recommend going below minimums
    const gyroRec = recs.find((r) => r.setting === 'gyro_lpf1_static_hz');
    const dtermRec = recs.find((r) => r.setting === 'dterm_lpf1_static_hz');
    expect(gyroRec).toBeUndefined(); // Already at minimum, no change
    expect(dtermRec).toBeUndefined();
  });

  it('should respect maximum safety bounds', () => {
    const noise = makeNoiseProfile({ level: 'low' });
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      gyro_lpf1_static_hz: 300,
      dterm_lpf1_static_hz: 200,
    };

    const recs = recommend(noise, current);
    const gyroRec = recs.find((r) => r.setting === 'gyro_lpf1_static_hz');
    const dtermRec = recs.find((r) => r.setting === 'dterm_lpf1_static_hz');
    // Already at maximum
    expect(gyroRec).toBeUndefined();
    expect(dtermRec).toBeUndefined();
  });

  it('should recommend lowering cutoff for resonance peak below filter', () => {
    const noise = makeNoiseProfile({
      level: 'medium',
      rollPeaks: [
        { frequency: 180, amplitude: 15, type: 'frame_resonance' },
      ],
    });

    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      gyro_lpf1_static_hz: 250, // Peak at 180 is below cutoff
    };

    const recs = recommend(noise, current);
    const gyroRec = recs.find((r) => r.setting === 'gyro_lpf1_static_hz');
    expect(gyroRec).toBeDefined();
    expect(gyroRec!.recommendedValue).toBeLessThan(180);
    expect(gyroRec!.confidence).toBe('high');
  });

  it('should not recommend changes for peaks above current cutoff', () => {
    const noise = makeNoiseProfile({
      level: 'medium',
      rollPeaks: [
        { frequency: 350, amplitude: 15, type: 'unknown' },
      ],
    });

    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      gyro_lpf1_static_hz: 200, // Peak at 350 is already filtered
    };

    const recs = recommend(noise, current);
    const gyroRec = recs.find((r) => r.setting === 'gyro_lpf1_static_hz');
    expect(gyroRec).toBeUndefined();
  });

  it('should not flag peaks with low amplitude', () => {
    const noise = makeNoiseProfile({
      level: 'medium',
      rollPeaks: [
        { frequency: 180, amplitude: 8, type: 'frame_resonance' }, // Below 12 dB threshold
      ],
    });

    const recs = recommend(noise, DEFAULT_FILTER_SETTINGS);
    // No resonance recommendation since amplitude < 12 dB
    expect(recs.length).toBe(0);
  });

  it('should recommend dynamic notch min adjustment when peak is below range', () => {
    const noise = makeNoiseProfile({
      level: 'medium',
      rollPeaks: [
        { frequency: 100, amplitude: 15, type: 'frame_resonance' },
      ],
    });

    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      dyn_notch_min_hz: 150, // Peak at 100 Hz is below
    };

    const recs = recommend(noise, current);
    const notchRec = recs.find((r) => r.setting === 'dyn_notch_min_hz');
    expect(notchRec).toBeDefined();
    expect(notchRec!.recommendedValue).toBeLessThan(100);
  });

  it('should recommend dynamic notch max adjustment when peak is above range', () => {
    const noise = makeNoiseProfile({
      level: 'medium',
      yawPeaks: [
        { frequency: 700, amplitude: 15, type: 'electrical' },
      ],
    });

    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      dyn_notch_max_hz: 600, // Peak at 700 Hz is above
    };

    const recs = recommend(noise, current);
    const notchRec = recs.find((r) => r.setting === 'dyn_notch_max_hz');
    expect(notchRec).toBeDefined();
    expect(notchRec!.recommendedValue).toBeGreaterThan(700);
  });

  it('should skip gyro LPF noise-floor adjustment when gyro_lpf1 is disabled (0)', () => {
    const noise = makeNoiseProfile({ level: 'high' });
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      gyro_lpf1_static_hz: 0, // Disabled (common with RPM filter)
    };

    const recs = recommend(noise, current);
    // Should NOT recommend gyro LPF adjustment from noise floor rule
    const gyroRec = recs.find((r) => r.setting === 'gyro_lpf1_static_hz');
    expect(gyroRec).toBeUndefined();
    // Should still recommend D-term adjustment
    const dtermRec = recs.find((r) => r.setting === 'dterm_lpf1_static_hz');
    expect(dtermRec).toBeDefined();
  });

  it('should recommend enabling gyro LPF for resonance peak when LPF is disabled', () => {
    const noise = makeNoiseProfile({
      level: 'medium',
      rollPeaks: [
        { frequency: 150, amplitude: 15, type: 'frame_resonance' },
      ],
    });
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      gyro_lpf1_static_hz: 0, // Disabled
    };

    const recs = recommend(noise, current);
    const gyroRec = recs.find((r) => r.setting === 'gyro_lpf1_static_hz');
    expect(gyroRec).toBeDefined();
    expect(gyroRec!.recommendedValue).toBeLessThan(150);
    expect(gyroRec!.reason).toContain('disabled');
  });

  it('should deduplicate recommendations for the same setting', () => {
    // High noise + resonance peak both want to lower gyro_lpf1
    const noise = makeNoiseProfile({
      level: 'high',
      rollPeaks: [
        { frequency: 180, amplitude: 15, type: 'frame_resonance' },
      ],
    });

    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      gyro_lpf1_static_hz: 250,
    };

    const recs = recommend(noise, current);
    const gyroRecs = recs.filter((r) => r.setting === 'gyro_lpf1_static_hz');
    expect(gyroRecs.length).toBe(1); // Deduplicated
  });

  it('should provide beginner-friendly reason strings', () => {
    const noise = makeNoiseProfile({ level: 'high' });
    const recs = recommend(noise, DEFAULT_FILTER_SETTINGS);

    for (const rec of recs) {
      expect(rec.reason.length).toBeGreaterThan(20);
      // Should not contain technical jargon without explanation
      expect(rec.reason).not.toContain('PSD');
      expect(rec.reason).not.toContain('Welch');
    }
  });

  it('should set appropriate impact values', () => {
    const noise = makeNoiseProfile({ level: 'high' });
    const recs = recommend(noise, DEFAULT_FILTER_SETTINGS);

    for (const rec of recs) {
      expect(['latency', 'noise', 'both']).toContain(rec.impact);
    }
  });

  it('should set appropriate confidence values', () => {
    const noise = makeNoiseProfile({ level: 'high' });
    const recs = recommend(noise, DEFAULT_FILTER_SETTINGS);

    for (const rec of recs) {
      expect(['high', 'medium', 'low']).toContain(rec.confidence);
    }
  });
});

describe('generateSummary', () => {
  it('should return positive message when no changes needed and low noise', () => {
    const noise = makeNoiseProfile({ level: 'low' });
    const summary = generateSummary(noise, []);
    expect(summary).toContain('clean');
    expect(summary).toContain('no changes needed');
  });

  it('should mention high noise level', () => {
    const noise = makeNoiseProfile({ level: 'high' });
    const recs = recommend(noise, DEFAULT_FILTER_SETTINGS);
    const summary = generateSummary(noise, recs);
    expect(summary).toMatch(/vibration|noise/i);
  });

  it('should mention frame resonance when detected', () => {
    const noise = makeNoiseProfile({
      level: 'medium',
      rollPeaks: [
        { frequency: 150, amplitude: 15, type: 'frame_resonance' },
      ],
    });
    const summary = generateSummary(noise, []);
    expect(summary).toContain('Frame resonance');
  });

  it('should mention motor harmonics when detected', () => {
    const noise = makeNoiseProfile({
      level: 'medium',
      pitchPeaks: [
        { frequency: 200, amplitude: 15, type: 'motor_harmonic' },
      ],
    });
    const summary = generateSummary(noise, []);
    expect(summary).toContain('Motor harmonic');
  });

  it('should state number of recommended changes', () => {
    const noise = makeNoiseProfile({ level: 'high' });
    const recs = recommend(noise, DEFAULT_FILTER_SETTINGS);
    const summary = generateSummary(noise, recs);
    expect(summary).toMatch(/\d+ filter change/);
  });
});
