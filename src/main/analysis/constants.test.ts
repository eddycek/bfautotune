import { describe, it, expect } from 'vitest';
import {
  PID_STYLE_THRESHOLDS,
  OVERSHOOT_IDEAL_PERCENT,
  OVERSHOOT_MAX_PERCENT,
  SETTLING_MAX_MS,
  RINGING_MAX_COUNT,
  ITERM_RELAX_CUTOFF_BY_STYLE,
  ITERM_RELAX_DEVIATION_THRESHOLD,
  ANTI_GRAVITY_GAIN_DEFAULT,
  ANTI_GRAVITY_WEIGHT_THRESHOLD_G,
  ANTI_GRAVITY_HEAVY_RECOMMENDED,
  ANTI_GRAVITY_MEDIUM_RECOMMENDED,
  ANTI_GRAVITY_SSE_THRESHOLD,
  ANTI_GRAVITY_LOW_THRESHOLD,
  THRUST_LINEAR_BY_SIZE,
  THRUST_LINEAR_DEVIATION_THRESHOLD,
} from './constants';
import type { DroneSize, FlightStyle } from '@shared/types/profile.types';

describe('PID_STYLE_THRESHOLDS', () => {
  const styles: FlightStyle[] = ['smooth', 'balanced', 'aggressive'];

  it('has thresholds for all three flight styles', () => {
    for (const style of styles) {
      expect(PID_STYLE_THRESHOLDS[style]).toBeDefined();
    }
  });

  it('has all required threshold fields for each style', () => {
    const requiredKeys = [
      'overshootIdeal',
      'overshootMax',
      'settlingMax',
      'ringingMax',
      'moderateOvershoot',
      'sluggishRise',
    ];
    for (const style of styles) {
      for (const key of requiredKeys) {
        expect(PID_STYLE_THRESHOLDS[style]).toHaveProperty(key);
        expect(typeof (PID_STYLE_THRESHOLDS[style] as unknown as Record<string, number>)[key]).toBe(
          'number'
        );
      }
    }
  });

  it('balanced thresholds match existing individual constants', () => {
    const balanced = PID_STYLE_THRESHOLDS.balanced;
    expect(balanced.overshootIdeal).toBe(OVERSHOOT_IDEAL_PERCENT);
    expect(balanced.overshootMax).toBe(OVERSHOOT_MAX_PERCENT);
    expect(balanced.settlingMax).toBe(SETTLING_MAX_MS);
    expect(balanced.ringingMax).toBe(RINGING_MAX_COUNT);
  });

  it('smooth has stricter overshoot thresholds than balanced', () => {
    expect(PID_STYLE_THRESHOLDS.smooth.overshootIdeal).toBeLessThan(
      PID_STYLE_THRESHOLDS.balanced.overshootIdeal
    );
    expect(PID_STYLE_THRESHOLDS.smooth.overshootMax).toBeLessThan(
      PID_STYLE_THRESHOLDS.balanced.overshootMax
    );
  });

  it('aggressive has more permissive overshoot thresholds than balanced', () => {
    expect(PID_STYLE_THRESHOLDS.aggressive.overshootIdeal).toBeGreaterThan(
      PID_STYLE_THRESHOLDS.balanced.overshootIdeal
    );
    expect(PID_STYLE_THRESHOLDS.aggressive.overshootMax).toBeGreaterThan(
      PID_STYLE_THRESHOLDS.balanced.overshootMax
    );
  });

  it('smooth allows more settling time, aggressive demands less', () => {
    expect(PID_STYLE_THRESHOLDS.smooth.settlingMax).toBeGreaterThan(
      PID_STYLE_THRESHOLDS.balanced.settlingMax
    );
    expect(PID_STYLE_THRESHOLDS.aggressive.settlingMax).toBeLessThan(
      PID_STYLE_THRESHOLDS.balanced.settlingMax
    );
  });

  it('sluggish rise threshold scales inversely with aggression', () => {
    expect(PID_STYLE_THRESHOLDS.smooth.sluggishRise).toBeGreaterThan(
      PID_STYLE_THRESHOLDS.balanced.sluggishRise
    );
    expect(PID_STYLE_THRESHOLDS.aggressive.sluggishRise).toBeLessThan(
      PID_STYLE_THRESHOLDS.balanced.sluggishRise
    );
  });
});

describe('ITERM_RELAX_CUTOFF_BY_STYLE', () => {
  const styles: FlightStyle[] = ['smooth', 'balanced', 'aggressive'];

  it('has ranges for all three flight styles', () => {
    for (const style of styles) {
      const range = ITERM_RELAX_CUTOFF_BY_STYLE[style];
      expect(range).toBeDefined();
      expect(range.min).toBeLessThan(range.max);
      expect(range.typical).toBeGreaterThanOrEqual(range.min);
      expect(range.typical).toBeLessThanOrEqual(range.max);
    }
  });

  it('aggressive has higher cutoff than balanced, balanced higher than smooth', () => {
    expect(ITERM_RELAX_CUTOFF_BY_STYLE.aggressive.typical).toBeGreaterThan(
      ITERM_RELAX_CUTOFF_BY_STYLE.balanced.typical
    );
    expect(ITERM_RELAX_CUTOFF_BY_STYLE.balanced.typical).toBeGreaterThan(
      ITERM_RELAX_CUTOFF_BY_STYLE.smooth.typical
    );
  });

  it('ranges do not overlap between styles', () => {
    expect(ITERM_RELAX_CUTOFF_BY_STYLE.smooth.max).toBeLessThanOrEqual(
      ITERM_RELAX_CUTOFF_BY_STYLE.balanced.min
    );
    expect(ITERM_RELAX_CUTOFF_BY_STYLE.balanced.max).toBeLessThanOrEqual(
      ITERM_RELAX_CUTOFF_BY_STYLE.aggressive.min
    );
  });

  it('deviation threshold is between 0 and 1', () => {
    expect(ITERM_RELAX_DEVIATION_THRESHOLD).toBeGreaterThan(0);
    expect(ITERM_RELAX_DEVIATION_THRESHOLD).toBeLessThanOrEqual(1);
  });
});

describe('Anti-Gravity constants', () => {
  it('default matches BF 4.5 default (80)', () => {
    expect(ANTI_GRAVITY_GAIN_DEFAULT).toBe(80);
  });

  it('weight threshold is 400g', () => {
    expect(ANTI_GRAVITY_WEIGHT_THRESHOLD_G).toBe(400);
  });

  it('heavy recommended (120) > medium recommended (110) > default (80)', () => {
    expect(ANTI_GRAVITY_HEAVY_RECOMMENDED).toBeGreaterThan(ANTI_GRAVITY_MEDIUM_RECOMMENDED);
    expect(ANTI_GRAVITY_MEDIUM_RECOMMENDED).toBeGreaterThan(ANTI_GRAVITY_GAIN_DEFAULT);
  });

  it('SSE threshold is positive', () => {
    expect(ANTI_GRAVITY_SSE_THRESHOLD).toBeGreaterThan(0);
  });

  it('low threshold is between default and heavy recommended', () => {
    expect(ANTI_GRAVITY_LOW_THRESHOLD).toBeGreaterThan(ANTI_GRAVITY_GAIN_DEFAULT);
    expect(ANTI_GRAVITY_LOW_THRESHOLD).toBeLessThanOrEqual(ANTI_GRAVITY_MEDIUM_RECOMMENDED);
  });
});

describe('THRUST_LINEAR_BY_SIZE', () => {
  it('has values for 3" through 7" sizes', () => {
    const expectedSizes: DroneSize[] = ['3"', '4"', '5"', '6"', '7"'];
    for (const size of expectedSizes) {
      expect(THRUST_LINEAR_BY_SIZE[size]).toBeDefined();
      expect(THRUST_LINEAR_BY_SIZE[size]).toBeGreaterThan(0);
    }
  });

  it('does not have values for 1" and 2.5" (too small for linearization)', () => {
    expect(THRUST_LINEAR_BY_SIZE['1"']).toBeUndefined();
    expect(THRUST_LINEAR_BY_SIZE['2.5"']).toBeUndefined();
  });

  it('values decrease with size (larger props = more linear thrust)', () => {
    expect(THRUST_LINEAR_BY_SIZE['3"']!).toBeGreaterThanOrEqual(THRUST_LINEAR_BY_SIZE['5"']!);
    expect(THRUST_LINEAR_BY_SIZE['5"']!).toBeGreaterThanOrEqual(THRUST_LINEAR_BY_SIZE['6"']!);
    expect(THRUST_LINEAR_BY_SIZE['6"']!).toBeGreaterThanOrEqual(THRUST_LINEAR_BY_SIZE['7"']!);
  });

  it('deviation threshold is between 0 and 1', () => {
    expect(THRUST_LINEAR_DEVIATION_THRESHOLD).toBeGreaterThan(0);
    expect(THRUST_LINEAR_DEVIATION_THRESHOLD).toBeLessThanOrEqual(1);
  });
});
