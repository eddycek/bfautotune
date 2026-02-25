import { describe, it, expect } from 'vitest';
import {
  generateFilterDemoBBL,
  generatePIDDemoBBL,
  generateCombinedDemoBBL,
} from './DemoDataGenerator';
import { BlackboxParser } from '../blackbox/BlackboxParser';
import { detectSteps } from '../analysis/StepDetector';

describe('DemoDataGenerator', () => {
  describe('generateFilterDemoBBL', () => {
    it('generates a parseable BBL buffer', async () => {
      const buffer = generateFilterDemoBBL();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(1000);

      const result = await BlackboxParser.parse(buffer);
      expect(result.success).toBe(true);
      expect(result.sessions.length).toBe(1);
    });

    it('produces flight data with meaningful gyro values', async () => {
      const buffer = generateFilterDemoBBL();
      const result = await BlackboxParser.parse(buffer);
      const session = result.sessions[0];

      // Should have gyro data for all 3 axes
      expect(session.flightData.gyro).toHaveLength(3);
      for (const axis of session.flightData.gyro) {
        expect(axis.values.length).toBeGreaterThan(100);
        // Gyro values should have some variation (not all zeros)
        const maxVal = Math.max(...Array.from(axis.values).map(Math.abs));
        expect(maxVal).toBeGreaterThan(1);
      }
    });

    it('produces setpoint data (hover, no steps)', async () => {
      const buffer = generateFilterDemoBBL();
      const result = await BlackboxParser.parse(buffer);
      const session = result.sessions[0];

      expect(session.flightData.setpoint).toHaveLength(4);
      // Roll/pitch/yaw setpoints should be near zero (hover)
      for (let axis = 0; axis < 3; axis++) {
        const maxSetpoint = Math.max(
          ...Array.from(session.flightData.setpoint[axis].values).map(Math.abs)
        );
        expect(maxSetpoint).toBeLessThanOrEqual(1); // No step inputs
      }
    });

    it('produces throttle data with sweep variation', async () => {
      const buffer = generateFilterDemoBBL();
      const result = await BlackboxParser.parse(buffer);
      const session = result.sessions[0];

      const throttle = session.flightData.setpoint[3];
      const min = Math.min(...Array.from(throttle.values));
      const max = Math.max(...Array.from(throttle.values));
      // Should have throttle variation (sweeps)
      expect(max - min).toBeGreaterThan(100);
    });

    it('sets correct header metadata', async () => {
      const buffer = generateFilterDemoBBL();
      const result = await BlackboxParser.parse(buffer);
      const header = result.sessions[0].header;

      expect(header.firmwareType).toBe('Betaflight');
      expect(header.firmwareRevision).toBe('4.5.1');
      expect(header.looptime).toBe(125);
    });
  });

  describe('generatePIDDemoBBL', () => {
    it('generates a parseable BBL buffer', async () => {
      const buffer = generatePIDDemoBBL();
      const result = await BlackboxParser.parse(buffer);
      expect(result.success).toBe(true);
      expect(result.sessions.length).toBe(1);
    });

    it('produces setpoint data with step inputs', async () => {
      const buffer = generatePIDDemoBBL();
      const result = await BlackboxParser.parse(buffer);
      const session = result.sessions[0];

      // At least one axis should have non-zero setpoint (step inputs)
      let hasSteps = false;
      for (let axis = 0; axis < 3; axis++) {
        const maxSetpoint = Math.max(
          ...Array.from(session.flightData.setpoint[axis].values).map(Math.abs)
        );
        if (maxSetpoint > 50) {
          hasSteps = true;
          break;
        }
      }
      expect(hasSteps).toBe(true);
    });

    it('produces steps detectable by StepDetector', async () => {
      const buffer = generatePIDDemoBBL();
      const result = await BlackboxParser.parse(buffer);
      const session = result.sessions[0];

      const steps = detectSteps(session.flightData);
      // Should detect 10+ steps across all axes
      expect(steps.length).toBeGreaterThanOrEqual(10);

      // All 3 axes should have at least one step
      const axesWithSteps = new Set(steps.map((s) => s.axis));
      expect(axesWithSteps.size).toBe(3);
    });

    it('produces gyro response to step inputs (non-zero overshoot)', async () => {
      const buffer = generatePIDDemoBBL();
      const result = await BlackboxParser.parse(buffer);
      const session = result.sessions[0];

      const steps = detectSteps(session.flightData);
      expect(steps.length).toBeGreaterThan(0);

      // During a step, gyro should track toward setpoint (not stay at 0)
      const firstStep = steps[0];
      const gyro = session.flightData.gyro[firstStep.axis].values;
      const midIdx = Math.floor((firstStep.startIndex + firstStep.endIndex) / 2);
      // Gyro at midpoint of step should be significantly non-zero
      expect(Math.abs(gyro[midIdx])).toBeGreaterThan(20);
    });
  });

  describe('generateCombinedDemoBBL', () => {
    it('generates a multi-session BBL buffer', async () => {
      const buffer = generateCombinedDemoBBL();
      expect(buffer.length).toBeGreaterThan(2000);

      const result = await BlackboxParser.parse(buffer);
      expect(result.success).toBe(true);
      expect(result.sessions.length).toBe(2);
    });

    it('session 1 has hover data (filter-suitable)', async () => {
      const buffer = generateCombinedDemoBBL();
      const result = await BlackboxParser.parse(buffer);
      const session1 = result.sessions[0];

      // Session 1 should have no step inputs (filter flight)
      for (let axis = 0; axis < 3; axis++) {
        const maxSetpoint = Math.max(
          ...Array.from(session1.flightData.setpoint[axis].values).map(Math.abs)
        );
        expect(maxSetpoint).toBeLessThanOrEqual(1);
      }
    });

    it('session 2 has step inputs (PID-suitable)', async () => {
      const buffer = generateCombinedDemoBBL();
      const result = await BlackboxParser.parse(buffer);
      const session2 = result.sessions[1];

      // Session 2 should have step inputs
      let hasSteps = false;
      for (let axis = 0; axis < 3; axis++) {
        const maxSetpoint = Math.max(
          ...Array.from(session2.flightData.setpoint[axis].values).map(Math.abs)
        );
        if (maxSetpoint > 50) {
          hasSteps = true;
          break;
        }
      }
      expect(hasSteps).toBe(true);
    });

    it('both sessions have valid header metadata', async () => {
      const buffer = generateCombinedDemoBBL();
      const result = await BlackboxParser.parse(buffer);

      for (const session of result.sessions) {
        expect(session.header.firmwareType).toBe('Betaflight');
        expect(session.header.firmwareRevision).toBe('4.5.1');
        expect(session.header.looptime).toBe(125);
      }
    });
  });
});
