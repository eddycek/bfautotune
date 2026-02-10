import { describe, it, expect } from 'vitest';
import { validateBBLHeader } from './headerValidation';
import type { BBLLogHeader } from '@shared/types/blackbox.types';

function createHeader(overrides: Partial<BBLLogHeader> = {}): BBLLogHeader {
  const defaults: BBLLogHeader = {
    productName: 'Blackbox flight data recorder',
    dataVersion: 2,
    firmwareType: 'Betaflight',
    firmwareVersion: '4.4.0',
    firmwareDate: '',
    boardIdentifier: 'S405',
    craftName: 'Test',
    iFrameFields: [],
    pFrameFields: [],
    sFrameFields: [],
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
    expect(warnings[0].severity).toBe('info');
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
    const codes = warnings.map(w => w.code);
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
});
