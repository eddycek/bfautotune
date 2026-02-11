import { describe, it, expect } from 'vitest';
import { recommend, generateSummary, computeNoiseBasedTarget, isRpmFilterActive } from './FilterRecommender';
import type {
  NoiseProfile,
  AxisNoiseProfile,
  CurrentFilterSettings,
  NoisePeak,
} from '@shared/types/analysis.types';
import { DEFAULT_FILTER_SETTINGS } from '@shared/types/analysis.types';
import {
  GYRO_LPF1_MIN_HZ,
  GYRO_LPF1_MAX_HZ,
  GYRO_LPF1_MAX_HZ_RPM,
  DTERM_LPF1_MIN_HZ,
  DTERM_LPF1_MAX_HZ,
  DTERM_LPF1_MAX_HZ_RPM,
  NOISE_FLOOR_VERY_NOISY_DB,
  NOISE_FLOOR_VERY_CLEAN_DB,
  NOISE_TARGET_DEADZONE_HZ,
  DYN_NOTCH_COUNT_WITH_RPM,
  DYN_NOTCH_Q_WITH_RPM,
} from './constants';

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

describe('computeNoiseBasedTarget', () => {
  it('should return minHz for extreme noise', () => {
    expect(computeNoiseBasedTarget(NOISE_FLOOR_VERY_NOISY_DB, 75, 300)).toBe(75);
  });

  it('should return maxHz for very clean signal', () => {
    expect(computeNoiseBasedTarget(NOISE_FLOOR_VERY_CLEAN_DB, 75, 300)).toBe(300);
  });

  it('should interpolate linearly for mid-range noise', () => {
    // Midpoint: (-10 + -70) / 2 = -40 → (75 + 300) / 2 = 187.5 → 188
    const target = computeNoiseBasedTarget(-40, 75, 300);
    expect(target).toBe(188);
  });

  it('should clamp to minHz for noise above very noisy threshold', () => {
    expect(computeNoiseBasedTarget(0, 75, 300)).toBe(75);
  });

  it('should clamp to maxHz for noise below very clean threshold', () => {
    expect(computeNoiseBasedTarget(-90, 75, 300)).toBe(300);
  });
});

describe('recommend', () => {
  it('should recommend noise-based targets for high noise', () => {
    const noise = makeNoiseProfile({ level: 'high', rollFloor: -25, pitchFloor: -20 });
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      gyro_lpf1_static_hz: 250,
      dterm_lpf1_static_hz: 150,
    };

    const recs = recommend(noise, current);
    const gyroRec = recs.find((r) => r.setting === 'gyro_lpf1_static_hz');
    const dtermRec = recs.find((r) => r.setting === 'dterm_lpf1_static_hz');

    expect(gyroRec).toBeDefined();
    // worstFloor = max(-25, -20) = -20, target = interpolate(-20, 75, 300) ≈ 112
    expect(gyroRec!.recommendedValue).toBeLessThan(current.gyro_lpf1_static_hz);
    expect(dtermRec).toBeDefined();
    expect(dtermRec!.recommendedValue).toBeLessThan(current.dterm_lpf1_static_hz);
  });

  it('should recommend noise-based targets for low noise', () => {
    const noise = makeNoiseProfile({ level: 'low', rollFloor: -65, pitchFloor: -60 });
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      gyro_lpf1_static_hz: 150,
      dterm_lpf1_static_hz: 100,
    };

    const recs = recommend(noise, current);
    const gyroRec = recs.find((r) => r.setting === 'gyro_lpf1_static_hz');
    const dtermRec = recs.find((r) => r.setting === 'dterm_lpf1_static_hz');

    expect(gyroRec).toBeDefined();
    // worstFloor = max(-65, -60) = -60, target = interpolate(-60, 75, 300) ≈ 262
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
    // Very noisy noise floor → target will be at min
    const noise = makeNoiseProfile({ level: 'high', rollFloor: -5, pitchFloor: -5 });
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      gyro_lpf1_static_hz: GYRO_LPF1_MIN_HZ,
      dterm_lpf1_static_hz: DTERM_LPF1_MIN_HZ,
    };

    const recs = recommend(noise, current);
    // Target is already at/near minimum → no recommendation within deadzone
    const gyroRec = recs.find((r) => r.setting === 'gyro_lpf1_static_hz');
    const dtermRec = recs.find((r) => r.setting === 'dterm_lpf1_static_hz');
    expect(gyroRec).toBeUndefined();
    expect(dtermRec).toBeUndefined();
  });

  it('should respect maximum safety bounds', () => {
    // Very clean noise floor → target will be at max
    const noise = makeNoiseProfile({ level: 'low', rollFloor: -75, pitchFloor: -75 });
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      gyro_lpf1_static_hz: GYRO_LPF1_MAX_HZ,
      dterm_lpf1_static_hz: DTERM_LPF1_MAX_HZ,
    };

    const recs = recommend(noise, current);
    const gyroRec = recs.find((r) => r.setting === 'gyro_lpf1_static_hz');
    const dtermRec = recs.find((r) => r.setting === 'dterm_lpf1_static_hz');
    // Already at maximum
    expect(gyroRec).toBeUndefined();
    expect(dtermRec).toBeUndefined();
  });

  it('should not recommend when target is within deadzone of current', () => {
    // Noise floor that produces a target close to the current setting
    // Target for gyro with floor -50: t = (-50 - (-10)) / (-60) = 0.667, target = 75 + 0.667 * 225 = 225
    const noise = makeNoiseProfile({ level: 'high', rollFloor: -50, pitchFloor: -50 });
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      gyro_lpf1_static_hz: 225, // Exactly at target
      dterm_lpf1_static_hz: 157, // Close to target (70 + 0.667 * 130 ≈ 157)
    };

    const recs = recommend(noise, current);
    const gyroRec = recs.find((r) => r.setting === 'gyro_lpf1_static_hz');
    const dtermRec = recs.find((r) => r.setting === 'dterm_lpf1_static_hz');
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
    const noise = makeNoiseProfile({ level: 'high', rollFloor: -25, pitchFloor: -25 });
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
      rollFloor: -25,
      pitchFloor: -25,
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
    const noise = makeNoiseProfile({ level: 'high', rollFloor: -25, pitchFloor: -25 });
    const recs = recommend(noise, DEFAULT_FILTER_SETTINGS);

    for (const rec of recs) {
      expect(rec.reason.length).toBeGreaterThan(20);
      // Should not contain technical jargon without explanation
      expect(rec.reason).not.toContain('PSD');
      expect(rec.reason).not.toContain('Welch');
    }
  });

  it('should set appropriate impact values', () => {
    const noise = makeNoiseProfile({ level: 'high', rollFloor: -25, pitchFloor: -25 });
    const recs = recommend(noise, DEFAULT_FILTER_SETTINGS);

    for (const rec of recs) {
      expect(['latency', 'noise', 'both']).toContain(rec.impact);
    }
  });

  it('should set appropriate confidence values', () => {
    const noise = makeNoiseProfile({ level: 'high', rollFloor: -25, pitchFloor: -25 });
    const recs = recommend(noise, DEFAULT_FILTER_SETTINGS);

    for (const rec of recs) {
      expect(['high', 'medium', 'low']).toContain(rec.confidence);
    }
  });

  it('should converge: applying recommendations and re-running produces no further changes', () => {
    const noise = makeNoiseProfile({ level: 'high', rollFloor: -25, pitchFloor: -20 });
    const initial: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      gyro_lpf1_static_hz: 250,
      dterm_lpf1_static_hz: 150,
    };

    // First run: get recommendations
    const recs1 = recommend(noise, initial);
    expect(recs1.length).toBeGreaterThan(0);

    // Apply recommendations to create "after" settings
    const applied: CurrentFilterSettings = { ...initial };
    for (const rec of recs1) {
      (applied as any)[rec.setting] = rec.recommendedValue;
    }

    // Second run with same noise data but applied settings → should produce no changes
    const recs2 = recommend(noise, applied);
    const noiseFloorRecs = recs2.filter(
      (r) => r.setting === 'gyro_lpf1_static_hz' || r.setting === 'dterm_lpf1_static_hz'
    );
    expect(noiseFloorRecs.length).toBe(0);
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
    const noise = makeNoiseProfile({ level: 'high', rollFloor: -25, pitchFloor: -25 });
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
    const noise = makeNoiseProfile({ level: 'high', rollFloor: -25, pitchFloor: -25 });
    const recs = recommend(noise, DEFAULT_FILTER_SETTINGS);
    const summary = generateSummary(noise, recs);
    expect(summary).toMatch(/\d+ filter change/);
  });

  it('should mention RPM filter in summary when active', () => {
    const noise = makeNoiseProfile({ level: 'low' });
    const summary = generateSummary(noise, [], true);
    expect(summary).toContain('RPM filter is active');
  });
});

describe('isRpmFilterActive', () => {
  it('returns true when rpm_filter_harmonics > 0', () => {
    expect(isRpmFilterActive({ ...DEFAULT_FILTER_SETTINGS, rpm_filter_harmonics: 3 })).toBe(true);
  });

  it('returns false when rpm_filter_harmonics is 0', () => {
    expect(isRpmFilterActive({ ...DEFAULT_FILTER_SETTINGS, rpm_filter_harmonics: 0 })).toBe(false);
  });

  it('returns false when rpm_filter_harmonics is undefined', () => {
    expect(isRpmFilterActive(DEFAULT_FILTER_SETTINGS)).toBe(false);
  });
});

describe('RPM-aware recommendations', () => {
  it('should use wider bounds (RPM max) for low noise with RPM active', () => {
    const noise = makeNoiseProfile({ level: 'low', rollFloor: -75, pitchFloor: -75 });
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      gyro_lpf1_static_hz: GYRO_LPF1_MAX_HZ, // At non-RPM max (300)
      dterm_lpf1_static_hz: DTERM_LPF1_MAX_HZ, // At non-RPM max (200)
      rpm_filter_harmonics: 3,
    };

    const recs = recommend(noise, current);
    // With RPM, max is 500/300, so clean signal should recommend higher cutoffs
    const gyroRec = recs.find((r) => r.setting === 'gyro_lpf1_static_hz');
    const dtermRec = recs.find((r) => r.setting === 'dterm_lpf1_static_hz');
    expect(gyroRec).toBeDefined();
    expect(gyroRec!.recommendedValue).toBeGreaterThan(GYRO_LPF1_MAX_HZ);
    expect(gyroRec!.recommendedValue).toBeLessThanOrEqual(GYRO_LPF1_MAX_HZ_RPM);
    expect(dtermRec).toBeDefined();
    expect(dtermRec!.recommendedValue).toBeGreaterThan(DTERM_LPF1_MAX_HZ);
    expect(dtermRec!.recommendedValue).toBeLessThanOrEqual(DTERM_LPF1_MAX_HZ_RPM);
  });

  it('should recommend dyn_notch_count reduction when RPM active', () => {
    const noise = makeNoiseProfile({ level: 'medium' });
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      rpm_filter_harmonics: 3,
      dyn_notch_count: 3, // Non-RPM default
      dyn_notch_q: 300,   // Non-RPM default
    };

    const recs = recommend(noise, current);
    const countRec = recs.find((r) => r.setting === 'dyn_notch_count');
    expect(countRec).toBeDefined();
    expect(countRec!.recommendedValue).toBe(DYN_NOTCH_COUNT_WITH_RPM);
  });

  it('should recommend dyn_notch_q increase when RPM active', () => {
    const noise = makeNoiseProfile({ level: 'medium' });
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      rpm_filter_harmonics: 3,
      dyn_notch_count: 3,
      dyn_notch_q: 300,
    };

    const recs = recommend(noise, current);
    const qRec = recs.find((r) => r.setting === 'dyn_notch_q');
    expect(qRec).toBeDefined();
    expect(qRec!.recommendedValue).toBe(DYN_NOTCH_Q_WITH_RPM);
  });

  it('should NOT recommend dyn_notch changes when RPM is inactive', () => {
    const noise = makeNoiseProfile({ level: 'medium' });
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      rpm_filter_harmonics: 0,
      dyn_notch_count: 3,
      dyn_notch_q: 300,
    };

    const recs = recommend(noise, current);
    expect(recs.find((r) => r.setting === 'dyn_notch_count')).toBeUndefined();
    expect(recs.find((r) => r.setting === 'dyn_notch_q')).toBeUndefined();
  });

  it('should NOT recommend dyn_notch changes when RPM data is undefined', () => {
    const noise = makeNoiseProfile({ level: 'medium' });
    const recs = recommend(noise, DEFAULT_FILTER_SETTINGS);
    expect(recs.find((r) => r.setting === 'dyn_notch_count')).toBeUndefined();
    expect(recs.find((r) => r.setting === 'dyn_notch_q')).toBeUndefined();
  });

  it('should produce unchanged behavior (regression) when RPM state is unknown', () => {
    // Without RPM fields, should behave exactly as before
    const noise = makeNoiseProfile({ level: 'high', rollFloor: -25, pitchFloor: -20 });
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      gyro_lpf1_static_hz: 250,
      dterm_lpf1_static_hz: 150,
    };

    const recs = recommend(noise, current);
    const gyroRec = recs.find((r) => r.setting === 'gyro_lpf1_static_hz');
    expect(gyroRec).toBeDefined();
    // Without RPM, max is 300 — should NOT exceed it
    expect(gyroRec!.recommendedValue).toBeLessThanOrEqual(GYRO_LPF1_MAX_HZ);
  });

  it('should add motor harmonic diagnostic when RPM active and motor peaks present', () => {
    const noise = makeNoiseProfile({
      level: 'medium',
      rollPeaks: [
        { frequency: 200, amplitude: 15, type: 'motor_harmonic' },
      ],
    });
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      rpm_filter_harmonics: 3,
    };

    const recs = recommend(noise, current);
    const diagnostic = recs.find((r) => r.setting === 'rpm_filter_diagnostic');
    expect(diagnostic).toBeDefined();
    expect(diagnostic!.reason).toContain('motor_poles');
    expect(diagnostic!.reason).toContain('ESC telemetry');
  });

  it('should NOT add motor harmonic diagnostic when RPM is inactive', () => {
    const noise = makeNoiseProfile({
      level: 'medium',
      rollPeaks: [
        { frequency: 200, amplitude: 15, type: 'motor_harmonic' },
      ],
    });
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      rpm_filter_harmonics: 0,
    };

    const recs = recommend(noise, current);
    expect(recs.find((r) => r.setting === 'rpm_filter_diagnostic')).toBeUndefined();
  });

  it('should include RPM note in reason strings when RPM active', () => {
    const noise = makeNoiseProfile({ level: 'low', rollFloor: -65, pitchFloor: -60 });
    const current: CurrentFilterSettings = {
      ...DEFAULT_FILTER_SETTINGS,
      gyro_lpf1_static_hz: 150,
      dterm_lpf1_static_hz: 100,
      rpm_filter_harmonics: 3,
    };

    const recs = recommend(noise, current);
    const gyroRec = recs.find((r) => r.setting === 'gyro_lpf1_static_hz');
    expect(gyroRec).toBeDefined();
    expect(gyroRec!.reason).toContain('RPM filter active');
  });
});
