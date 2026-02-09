import { describe, it, expect } from 'vitest';
import { BlackboxParser } from './BlackboxParser';
import {
  buildReferenceFixture,
  EXPECTED_SESSION_1_FRAMES,
  EXPECTED_SESSION_2_FRAMES,
  EXPECTED_LOOPTIME,
  EXPECTED_MAX_GYRO,
} from './fixtures/bf45-reference';

describe('BlackboxParser integration (BF 4.5 reference fixture)', () => {
  const fixture = buildReferenceFixture();

  it('parses reference fixture with correct session count', async () => {
    const result = await BlackboxParser.parse(fixture);

    expect(result.success).toBe(true);
    expect(result.sessions).toHaveLength(2);
  });

  it('session frame counts match expected values', async () => {
    const result = await BlackboxParser.parse(fixture);

    expect(result.sessions[0].flightData.frameCount).toBe(EXPECTED_SESSION_1_FRAMES);
    expect(result.sessions[1].flightData.frameCount).toBe(EXPECTED_SESSION_2_FRAMES);
  });

  it('session durations match expected values', async () => {
    const result = await BlackboxParser.parse(fixture);

    // Session 1: 50 frames at 32*125µs intervals = 49 * 4000µs = 0.196s
    const s1 = result.sessions[0].flightData;
    expect(s1.durationSeconds).toBeGreaterThan(0.1);
    expect(s1.durationSeconds).toBeLessThan(1.0);

    // Session 2: 30 frames at 32*125µs intervals = 29 * 4000µs = 0.116s
    const s2 = result.sessions[1].flightData;
    expect(s2.durationSeconds).toBeGreaterThan(0.05);
    expect(s2.durationSeconds).toBeLessThan(0.5);
  });

  it('gyro values within physical limits', async () => {
    const result = await BlackboxParser.parse(fixture);

    for (const session of result.sessions) {
      for (let axis = 0; axis < 3; axis++) {
        const gyroValues = session.flightData.gyro[axis].values;
        for (let i = 0; i < gyroValues.length; i++) {
          expect(Math.abs(gyroValues[i])).toBeLessThan(3000);
        }
      }
    }
  });

  it('gyro values match expected fixture range', async () => {
    const result = await BlackboxParser.parse(fixture);

    for (const session of result.sessions) {
      for (let axis = 0; axis < 3; axis++) {
        const gyroValues = session.flightData.gyro[axis].values;
        for (let i = 0; i < gyroValues.length; i++) {
          expect(Math.abs(gyroValues[i])).toBeLessThanOrEqual(EXPECTED_MAX_GYRO);
        }
      }
    }
  });

  it('all axes have equal data length', async () => {
    const result = await BlackboxParser.parse(fixture);

    for (const session of result.sessions) {
      const fd = session.flightData;
      const expectedLen = fd.frameCount;

      // All 3 gyro axes
      for (let axis = 0; axis < 3; axis++) {
        expect(fd.gyro[axis].values.length).toBe(expectedLen);
        expect(fd.gyro[axis].time.length).toBe(expectedLen);
      }

      // All 4 setpoint channels
      for (let ch = 0; ch < 4; ch++) {
        expect(fd.setpoint[ch].values.length).toBe(expectedLen);
        expect(fd.setpoint[ch].time.length).toBe(expectedLen);
      }
    }
  });

  it('post-LOG_END garbage is excluded', async () => {
    const result = await BlackboxParser.parse(fixture);

    // Session 1 should have exactly EXPECTED_SESSION_1_FRAMES
    // despite 50 bytes of garbage following LOG_END
    expect(result.sessions[0].flightData.frameCount).toBe(EXPECTED_SESSION_1_FRAMES);

    // No corrupted frames should have been accepted
    expect(result.sessions[0].corruptedFrameCount).toBe(0);
  });

  it('sample rate matches looptime', async () => {
    const result = await BlackboxParser.parse(fixture);

    const expectedHz = 1_000_000 / (EXPECTED_LOOPTIME * 2); // fixture uses P interval:1/2 → pDenom=2
    expect(result.sessions[0].flightData.sampleRateHz).toBeCloseTo(expectedHz, 0);
    expect(result.sessions[1].flightData.sampleRateHz).toBeCloseTo(expectedHz, 0);
  });

  it('no corruption warnings for clean data', async () => {
    const result = await BlackboxParser.parse(fixture);

    for (const session of result.sessions) {
      const hasCorruptionWarning = session.warnings.some(
        w => w.includes('parsing error') || w.includes('corruption')
      );
      expect(hasCorruptionWarning).toBe(false);
    }
  });
});
