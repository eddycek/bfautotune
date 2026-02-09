import { describe, it, expect } from 'vitest';
import { parseCLIDiff, computeDiff, groupDiffByCommand } from './snapshotDiffUtils';

describe('parseCLIDiff', () => {
  it('parses set commands', () => {
    const result = parseCLIDiff('set gyro_lpf1_static_hz = 150\nset dterm_lpf1_static_hz = 100');
    expect(result.get('set gyro_lpf1_static_hz')).toBe('150');
    expect(result.get('set dterm_lpf1_static_hz')).toBe('100');
    expect(result.size).toBe(2);
  });

  it('parses feature commands', () => {
    const result = parseCLIDiff('feature TELEMETRY\nfeature -GPS');
    expect(result.get('feature TELEMETRY')).toBe('(enabled)');
    expect(result.get('feature -GPS')).toBe('(enabled)');
  });

  it('parses serial commands', () => {
    const result = parseCLIDiff('serial 0 64 115200 57600 0 115200');
    expect(result.get('serial 0')).toBe('64 115200 57600 0 115200');
  });

  it('parses aux commands', () => {
    const result = parseCLIDiff('aux 0 0 0 1700 2100 0 0');
    expect(result.get('aux 0')).toBe('0 0 1700 2100 0 0');
  });

  it('skips empty lines', () => {
    const result = parseCLIDiff('\n\n  \n');
    expect(result.size).toBe(0);
  });

  it('skips comment lines', () => {
    const result = parseCLIDiff('# version\n# Betaflight / MATEKF405');
    expect(result.size).toBe(0);
  });

  it('skips metadata commands', () => {
    const input = [
      'diff all',
      'batch start',
      'defaults nosave',
      'board_name MATEKF405',
      'manufacturer_id MTKS',
      'mcu_id 0042001d',
      'signature abc',
      'profile 0',
      'rateprofile 0',
      'save',
    ].join('\n');
    const result = parseCLIDiff(input);
    expect(result.size).toBe(0);
  });

  it('handles \\r\\n line endings', () => {
    const result = parseCLIDiff('set gyro_lpf1_static_hz = 150\r\nset dterm_lpf1_static_hz = 100\r\n');
    expect(result.size).toBe(2);
    expect(result.get('set gyro_lpf1_static_hz')).toBe('150');
  });

  it('handles empty input', () => {
    expect(parseCLIDiff('').size).toBe(0);
  });

  it('trims whitespace from values', () => {
    const result = parseCLIDiff('set motor_pwm_protocol =  DSHOT600  ');
    expect(result.get('set motor_pwm_protocol')).toBe('DSHOT600');
  });

  it('handles set with equals in value', () => {
    const result = parseCLIDiff('set osd_item_0 = 2048');
    expect(result.get('set osd_item_0')).toBe('2048');
  });

  it('handles generic commands as key-value', () => {
    const result = parseCLIDiff('beacon RX_LOST');
    expect(result.get('beacon')).toBe('RX_LOST');
  });

  it('handles mixed command types', () => {
    const input = [
      '# header',
      'set gyro_lpf1_static_hz = 150',
      'feature TELEMETRY',
      'serial 0 64 115200 57600 0 115200',
      'aux 0 0 0 1700 2100 0 0',
      'save',
    ].join('\n');
    const result = parseCLIDiff(input);
    expect(result.size).toBe(4);
  });
});

describe('computeDiff', () => {
  it('detects added entries', () => {
    const before = new Map<string, string>();
    const after = new Map([['set gyro_lpf1_static_hz', '150']]);
    const diff = computeDiff(before, after);

    expect(diff).toEqual([
      { key: 'set gyro_lpf1_static_hz', newValue: '150', status: 'added' },
    ]);
  });

  it('detects removed entries', () => {
    const before = new Map([['set gyro_lpf1_static_hz', '150']]);
    const after = new Map<string, string>();
    const diff = computeDiff(before, after);

    expect(diff).toEqual([
      { key: 'set gyro_lpf1_static_hz', oldValue: '150', status: 'removed' },
    ]);
  });

  it('detects changed entries', () => {
    const before = new Map([['set gyro_lpf1_static_hz', '150']]);
    const after = new Map([['set gyro_lpf1_static_hz', '200']]);
    const diff = computeDiff(before, after);

    expect(diff).toEqual([
      { key: 'set gyro_lpf1_static_hz', oldValue: '150', newValue: '200', status: 'changed' },
    ]);
  });

  it('ignores identical entries', () => {
    const before = new Map([['set gyro_lpf1_static_hz', '150']]);
    const after = new Map([['set gyro_lpf1_static_hz', '150']]);
    const diff = computeDiff(before, after);

    expect(diff).toEqual([]);
  });

  it('handles empty maps', () => {
    expect(computeDiff(new Map(), new Map())).toEqual([]);
  });

  it('handles mixed add/remove/change', () => {
    const before = new Map([
      ['set dterm_lpf1_static_hz', '100'],
      ['set gyro_lpf1_static_hz', '150'],
      ['feature GPS', '(enabled)'],
    ]);
    const after = new Map([
      ['set dterm_lpf1_static_hz', '120'],
      ['set gyro_lpf1_static_hz', '150'],
      ['feature TELEMETRY', '(enabled)'],
    ]);
    const diff = computeDiff(before, after);

    expect(diff).toHaveLength(3);
    expect(diff.find(d => d.key === 'set dterm_lpf1_static_hz')?.status).toBe('changed');
    expect(diff.find(d => d.key === 'feature TELEMETRY')?.status).toBe('added');
    expect(diff.find(d => d.key === 'feature GPS')?.status).toBe('removed');
  });

  it('returns sorted entries by key', () => {
    const before = new Map<string, string>();
    const after = new Map([
      ['set z_value', '1'],
      ['set a_value', '2'],
      ['set m_value', '3'],
    ]);
    const diff = computeDiff(before, after);
    expect(diff.map(d => d.key)).toEqual(['set a_value', 'set m_value', 'set z_value']);
  });
});

describe('groupDiffByCommand', () => {
  it('groups entries by command prefix', () => {
    const entries = [
      { key: 'set gyro_lpf1_static_hz', newValue: '150', status: 'added' as const },
      { key: 'set dterm_lpf1_static_hz', newValue: '100', status: 'added' as const },
      { key: 'feature TELEMETRY', newValue: '(enabled)', status: 'added' as const },
    ];
    const groups = groupDiffByCommand(entries);

    expect(groups.size).toBe(2);
    expect(groups.get('set')).toHaveLength(2);
    expect(groups.get('feature')).toHaveLength(1);
  });

  it('handles empty entries', () => {
    const groups = groupDiffByCommand([]);
    expect(groups.size).toBe(0);
  });

  it('preserves entry ordering within groups', () => {
    const entries = [
      { key: 'set a_value', newValue: '1', status: 'added' as const },
      { key: 'set b_value', newValue: '2', status: 'added' as const },
    ];
    const groups = groupDiffByCommand(entries);
    const setGroup = groups.get('set')!;
    expect(setGroup[0].key).toBe('set a_value');
    expect(setGroup[1].key).toBe('set b_value');
  });

  it('handles multiple command types', () => {
    const entries = [
      { key: 'aux 0', newValue: '0 0 1700 2100', status: 'added' as const },
      { key: 'feature GPS', oldValue: '(enabled)', status: 'removed' as const },
      { key: 'serial 0', oldValue: '64', newValue: '128', status: 'changed' as const },
      { key: 'set gyro_lpf1_static_hz', newValue: '150', status: 'added' as const },
    ];
    const groups = groupDiffByCommand(entries);

    expect(groups.size).toBe(4);
    expect(groups.has('aux')).toBe(true);
    expect(groups.has('feature')).toBe(true);
    expect(groups.has('serial')).toBe(true);
    expect(groups.has('set')).toBe(true);
  });
});
