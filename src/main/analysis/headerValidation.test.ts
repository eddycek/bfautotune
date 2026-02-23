import { describe, it, expect } from 'vitest';
import { validateBBLHeader, enrichSettingsFromBBLHeaders } from './headerValidation';
import type { BBLLogHeader } from '@shared/types/blackbox.types';
import { DEFAULT_FILTER_SETTINGS } from '@shared/types/analysis.types';

function createHeader(overrides: Partial<BBLLogHeader> = {}): BBLLogHeader {
  const defaults: BBLLogHeader = {
    product: 'Blackbox flight data recorder',
    dataVersion: 2,
    firmwareType: 'Betaflight',
    firmwareRevision: '4.4.0',
    firmwareDate: '',
    boardInformation: 'S405',
    logStartDatetime: '',
    craftName: 'Test',
    iFieldDefs: [],
    pFieldDefs: [],
    sFieldDefs: [],
    gFieldDefs: [],
    iInterval: 32,
    pInterval: 1,
    pDenom: 32,
    minthrottle: 1070,
    maxthrottle: 2000,
    motorOutputRange: 0,
    vbatref: 420,
    looptime: 500, // 2000 Hz
    gyroScale: 1,
    rawHeaders: new Map<string, string>(),
  };
  return { ...defaults, ...overrides };
}

describe('validateBBLHeader', () => {
  it('returns no warnings for good settings (2 kHz, GYRO_SCALED)', () => {
    const header = createHeader({ looptime: 500 }); // 2000 Hz
    header.rawHeaders.set('debug_mode', '6'); // GYRO_SCALED
    const warnings = validateBBLHeader(header);
    expect(warnings).toHaveLength(0);
  });

  it('returns no warnings for 4 kHz logging rate', () => {
    const header = createHeader({ looptime: 250 }); // 4000 Hz
    header.rawHeaders.set('debug_mode', '6');
    const warnings = validateBBLHeader(header);
    expect(warnings).toHaveLength(0);
  });

  it('warns about low logging rate (1 kHz)', () => {
    const header = createHeader({ looptime: 1000 }); // 1000 Hz
    header.rawHeaders.set('debug_mode', '6');
    const warnings = validateBBLHeader(header);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('low_logging_rate');
    expect(warnings[0].severity).toBe('warning');
    expect(warnings[0].message).toContain('1000 Hz');
    expect(warnings[0].message).toContain('500 Hz'); // Nyquist
  });

  it('warns about very low logging rate (500 Hz)', () => {
    const header = createHeader({ looptime: 2000 }); // 500 Hz
    header.rawHeaders.set('debug_mode', '6');
    const warnings = validateBBLHeader(header);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('low_logging_rate');
    expect(warnings[0].message).toContain('250 Hz'); // Nyquist
  });

  it('warns about wrong debug mode (NONE)', () => {
    const header = createHeader({ looptime: 500 });
    header.rawHeaders.set('debug_mode', '0'); // NONE
    const warnings = validateBBLHeader(header);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('wrong_debug_mode');
    expect(warnings[0].severity).toBe('warning');
    expect(warnings[0].message).toContain('GYRO_SCALED');
  });

  it('warns about wrong debug mode (GYRO_FILTERED)', () => {
    const header = createHeader({ looptime: 500 });
    header.rawHeaders.set('debug_mode', '3'); // GYRO_FILTERED
    const warnings = validateBBLHeader(header);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('wrong_debug_mode');
  });

  it('returns both warnings when both are bad', () => {
    const header = createHeader({ looptime: 2000 }); // 500 Hz
    header.rawHeaders.set('debug_mode', '0'); // NONE
    const warnings = validateBBLHeader(header);
    expect(warnings).toHaveLength(2);
    const codes = warnings.map((w) => w.code);
    expect(codes).toContain('low_logging_rate');
    expect(codes).toContain('wrong_debug_mode');
  });

  it('does not warn about debug mode when header has no debug_mode field', () => {
    const header = createHeader({ looptime: 500 });
    // rawHeaders has no debug_mode key
    const warnings = validateBBLHeader(header);
    expect(warnings).toHaveLength(0);
  });

  it('handles looptime = 0 gracefully (no rate warning)', () => {
    const header = createHeader({ looptime: 0 });
    header.rawHeaders.set('debug_mode', '6');
    const warnings = validateBBLHeader(header);
    expect(warnings).toHaveLength(0);
  });

  // BF 2025.12+ (4.6+) version-aware tests
  it('skips debug mode check for BF 4.6+ (2025.12) where GYRO_SCALED was removed', () => {
    const header = createHeader({ firmwareRevision: '4.6.0', looptime: 500 });
    header.rawHeaders.set('debug_mode', '0'); // NONE — should be fine on 4.6+
    const warnings = validateBBLHeader(header);
    expect(warnings).toHaveLength(0);
  });

  it('skips debug mode check for BF 4.6.1', () => {
    const header = createHeader({ firmwareRevision: '4.6.1', looptime: 500 });
    header.rawHeaders.set('debug_mode', '42'); // any value
    const warnings = validateBBLHeader(header);
    expect(warnings).toHaveLength(0);
  });

  it('still warns about debug mode for BF 4.5.x', () => {
    const header = createHeader({ firmwareRevision: '4.5.1', looptime: 500 });
    header.rawHeaders.set('debug_mode', '0');
    const warnings = validateBBLHeader(header);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('wrong_debug_mode');
  });

  it('still warns about debug mode for BF 4.4.0', () => {
    const header = createHeader({ firmwareRevision: '4.4.0', looptime: 500 });
    header.rawHeaders.set('debug_mode', '3');
    const warnings = validateBBLHeader(header);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('wrong_debug_mode');
  });

  it('handles missing firmwareRevision gracefully (assumes pre-4.6)', () => {
    const header = createHeader({ firmwareRevision: '', looptime: 500 });
    header.rawHeaders.set('debug_mode', '0');
    const warnings = validateBBLHeader(header);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('wrong_debug_mode');
  });
});

describe('enrichSettingsFromBBLHeaders', () => {
  it('enriches settings with RPM harmonics from BBL headers', () => {
    const headers = new Map<string, string>([
      ['rpm_filter_harmonics', '3'],
      ['rpm_filter_min_hz', '100'],
    ]);

    const result = enrichSettingsFromBBLHeaders(DEFAULT_FILTER_SETTINGS, headers);
    expect(result).not.toBeNull();
    expect(result!.rpm_filter_harmonics).toBe(3);
    expect(result!.rpm_filter_min_hz).toBe(100);
  });

  it('enriches settings with dynamic notch count and Q', () => {
    const headers = new Map<string, string>([
      ['rpm_filter_harmonics', '3'],
      ['dyn_notch_count', '1'],
      ['dyn_notch_q', '500'],
    ]);

    const result = enrichSettingsFromBBLHeaders(DEFAULT_FILTER_SETTINGS, headers);
    expect(result).not.toBeNull();
    expect(result!.dyn_notch_count).toBe(1);
    expect(result!.dyn_notch_q).toBe(500);
  });

  it('returns null when rpm_filter_harmonics not in headers', () => {
    const headers = new Map<string, string>([['dshot_bidir', '1']]);

    const result = enrichSettingsFromBBLHeaders(DEFAULT_FILTER_SETTINGS, headers);
    expect(result).toBeNull();
  });

  it('returns null when rpm_filter_harmonics is not a number', () => {
    const headers = new Map<string, string>([['rpm_filter_harmonics', 'invalid']]);

    const result = enrichSettingsFromBBLHeaders(DEFAULT_FILTER_SETTINGS, headers);
    expect(result).toBeNull();
  });

  it('preserves existing settings while adding RPM data', () => {
    const headers = new Map<string, string>([['rpm_filter_harmonics', '2']]);

    const settings = { ...DEFAULT_FILTER_SETTINGS, gyro_lpf1_static_hz: 100 };
    const result = enrichSettingsFromBBLHeaders(settings, headers);
    expect(result).not.toBeNull();
    expect(result!.gyro_lpf1_static_hz).toBe(100);
    expect(result!.rpm_filter_harmonics).toBe(2);
  });

  it('handles rpm_filter_harmonics = 0 (RPM disabled)', () => {
    const headers = new Map<string, string>([['rpm_filter_harmonics', '0']]);

    const result = enrichSettingsFromBBLHeaders(DEFAULT_FILTER_SETTINGS, headers);
    expect(result).not.toBeNull();
    expect(result!.rpm_filter_harmonics).toBe(0);
  });

  it('enriches only dyn_notch_count when RPM is already set from MSP', () => {
    const headers = new Map<string, string>([['dyn_notch_count', '3']]);
    const settings = { ...DEFAULT_FILTER_SETTINGS, rpm_filter_harmonics: 3 };

    const result = enrichSettingsFromBBLHeaders(settings, headers);
    expect(result).not.toBeNull();
    expect(result!.rpm_filter_harmonics).toBe(3); // preserved
    expect(result!.dyn_notch_count).toBe(3);
  });

  it('does not overwrite existing dyn_notch_count from MSP', () => {
    const headers = new Map<string, string>([['dyn_notch_count', '5']]);
    const settings = { ...DEFAULT_FILTER_SETTINGS, rpm_filter_harmonics: 3, dyn_notch_count: 1 };

    const result = enrichSettingsFromBBLHeaders(settings, headers);
    // dyn_notch_count already defined → not overwritten → no change → null
    expect(result).toBeNull();
  });

  it('enriches dyn_notch_q from headers when missing from MSP', () => {
    const headers = new Map<string, string>([['dyn_notch_q', '400']]);
    const settings = { ...DEFAULT_FILTER_SETTINGS, rpm_filter_harmonics: 3, dyn_notch_count: 1 };

    const result = enrichSettingsFromBBLHeaders(settings, headers);
    expect(result).not.toBeNull();
    expect(result!.dyn_notch_q).toBe(400);
  });

  it('returns null when all fields already defined (nothing to enrich)', () => {
    const headers = new Map<string, string>([
      ['rpm_filter_harmonics', '99'],
      ['dyn_notch_count', '99'],
    ]);
    const settings = {
      ...DEFAULT_FILTER_SETTINGS,
      rpm_filter_harmonics: 3,
      rpm_filter_min_hz: 100,
      dyn_notch_count: 1,
      dyn_notch_q: 500,
    };

    const result = enrichSettingsFromBBLHeaders(settings, headers);
    expect(result).toBeNull(); // nothing to fill
  });
});
