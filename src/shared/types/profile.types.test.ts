import { describe, it, expect } from 'vitest';
import type {
  FlightStyle,
  DroneProfileOptional,
  ProfileCreationInput,
  ProfileUpdateInput,
} from './profile.types';

describe('FlightStyle type', () => {
  it('accepts valid flight style values', () => {
    const styles: FlightStyle[] = ['smooth', 'balanced', 'aggressive'];
    expect(styles).toHaveLength(3);
  });

  it('is optional in DroneProfileOptional', () => {
    const withStyle: DroneProfileOptional = { flightStyle: 'aggressive' };
    const withoutStyle: DroneProfileOptional = { notes: 'test' };
    expect(withStyle.flightStyle).toBe('aggressive');
    expect(withoutStyle.flightStyle).toBeUndefined();
  });

  it('is inherited by ProfileCreationInput', () => {
    const input: ProfileCreationInput = {
      fcSerialNumber: 'abc123',
      fcInfo: {
        variant: 'BTFL',
        version: '4.5.0',
        apiVersion: { protocol: 0, major: 1, minor: 46 },
        target: 'STM32F405',
        boardName: 'Test',
      },
      name: 'Test',
      size: '5"',
      battery: '4S',
      flightStyle: 'smooth',
    };
    expect(input.flightStyle).toBe('smooth');
  });

  it('is inherited by ProfileUpdateInput', () => {
    const update: ProfileUpdateInput = { flightStyle: 'balanced' };
    expect(update.flightStyle).toBe('balanced');
  });

  it('defaults to undefined when not set', () => {
    const profile: DroneProfileOptional = {};
    expect(profile.flightStyle).toBeUndefined();
  });
});
