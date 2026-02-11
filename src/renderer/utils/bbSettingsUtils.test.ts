import { describe, it, expect } from 'vitest';
import { isGyroScaledNotNeeded, computeBBSettingsStatus } from './bbSettingsUtils';

describe('isGyroScaledNotNeeded', () => {
  it('returns false for BF 4.4', () => {
    expect(isGyroScaledNotNeeded('4.4.0')).toBe(false);
  });

  it('returns false for BF 4.5.1', () => {
    expect(isGyroScaledNotNeeded('4.5.1')).toBe(false);
  });

  it('returns true for BF 4.6.0', () => {
    expect(isGyroScaledNotNeeded('4.6.0')).toBe(true);
  });

  it('returns true for BF 5.0.0', () => {
    expect(isGyroScaledNotNeeded('5.0.0')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isGyroScaledNotNeeded('')).toBe(false);
  });

  it('returns false for invalid version', () => {
    expect(isGyroScaledNotNeeded('abc')).toBe(false);
  });
});

describe('computeBBSettingsStatus', () => {
  it('returns allOk when settings are null', () => {
    const result = computeBBSettingsStatus(null, '4.5.0');
    expect(result.allOk).toBe(true);
    expect(result.fixCommands).toEqual([]);
  });

  it('returns allOk when debug mode is GYRO_SCALED and rate is good', () => {
    const result = computeBBSettingsStatus(
      { debugMode: 'GYRO_SCALED', sampleRate: 1, loggingRateHz: 4000 },
      '4.5.0'
    );
    expect(result.allOk).toBe(true);
    expect(result.debugModeOk).toBe(true);
    expect(result.loggingRateOk).toBe(true);
    expect(result.fixCommands).toEqual([]);
  });

  it('detects wrong debug mode on BF 4.5', () => {
    const result = computeBBSettingsStatus(
      { debugMode: 'NONE', sampleRate: 0, loggingRateHz: 4000 },
      '4.5.0'
    );
    expect(result.allOk).toBe(false);
    expect(result.debugModeOk).toBe(false);
    expect(result.fixCommands).toContain('set debug_mode = GYRO_SCALED');
  });

  it('ignores debug mode on BF 4.6+', () => {
    const result = computeBBSettingsStatus(
      { debugMode: 'NONE', sampleRate: 0, loggingRateHz: 4000 },
      '4.6.0'
    );
    expect(result.allOk).toBe(true);
    expect(result.debugModeOk).toBe(true);
    expect(result.gyroScaledNotNeeded).toBe(true);
    expect(result.fixCommands).toEqual([]);
  });

  it('detects low logging rate', () => {
    const result = computeBBSettingsStatus(
      { debugMode: 'GYRO_SCALED', sampleRate: 3, loggingRateHz: 1000 },
      '4.5.0'
    );
    expect(result.allOk).toBe(false);
    expect(result.loggingRateOk).toBe(false);
    expect(result.fixCommands).toContain('set blackbox_sample_rate = 1');
  });

  it('detects both issues at once', () => {
    const result = computeBBSettingsStatus(
      { debugMode: 'NONE', sampleRate: 3, loggingRateHz: 500 },
      '4.4.0'
    );
    expect(result.allOk).toBe(false);
    expect(result.fixCommands).toHaveLength(2);
    expect(result.fixCommands).toContain('set debug_mode = GYRO_SCALED');
    expect(result.fixCommands).toContain('set blackbox_sample_rate = 1');
  });

  it('treats 2000 Hz as ok (boundary)', () => {
    const result = computeBBSettingsStatus(
      { debugMode: 'GYRO_SCALED', sampleRate: 2, loggingRateHz: 2000 },
      '4.5.0'
    );
    expect(result.loggingRateOk).toBe(true);
    expect(result.allOk).toBe(true);
  });

  it('treats 1999 Hz as not ok (boundary)', () => {
    const result = computeBBSettingsStatus(
      { debugMode: 'GYRO_SCALED', sampleRate: 2, loggingRateHz: 1999 },
      '4.5.0'
    );
    expect(result.loggingRateOk).toBe(false);
  });
});
