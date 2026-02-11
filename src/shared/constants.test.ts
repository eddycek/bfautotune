import { describe, it, expect } from 'vitest';
import { PRESET_PROFILES } from './constants';

describe('PRESET_PROFILES', () => {
  const presetIds = Object.keys(PRESET_PROFILES);

  it('every preset has a valid flightStyle', () => {
    const validStyles = ['smooth', 'balanced', 'aggressive'];
    for (const id of presetIds) {
      const preset = PRESET_PROFILES[id as keyof typeof PRESET_PROFILES];
      expect(validStyles).toContain(preset.flightStyle);
    }
  });

  it('maps racing preset to aggressive', () => {
    expect(PRESET_PROFILES['5inch-race'].flightStyle).toBe('aggressive');
  });

  it('maps cinematic preset to smooth', () => {
    expect(PRESET_PROFILES['5inch-cinematic'].flightStyle).toBe('smooth');
  });

  it('maps cinewhoop preset to smooth', () => {
    expect(PRESET_PROFILES['3inch-cinewhoop'].flightStyle).toBe('smooth');
  });

  it('maps long-range presets to smooth', () => {
    expect(PRESET_PROFILES['6inch-longrange'].flightStyle).toBe('smooth');
    expect(PRESET_PROFILES['7inch-longrange'].flightStyle).toBe('smooth');
    expect(PRESET_PROFILES['10inch-ultra-longrange'].flightStyle).toBe('smooth');
  });

  it('maps freestyle preset to balanced', () => {
    expect(PRESET_PROFILES['5inch-freestyle'].flightStyle).toBe('balanced');
  });

  it('maps whoop presets to balanced', () => {
    expect(PRESET_PROFILES['tiny-whoop'].flightStyle).toBe('balanced');
    expect(PRESET_PROFILES['micro-whoop'].flightStyle).toBe('balanced');
  });
});
