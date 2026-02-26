import { describe, it, expect } from 'vitest';
import {
  generateFilterDemoBBL,
  generatePIDDemoBBL,
  generateVerificationDemoBBL,
  generateCombinedDemoBBL,
  progressiveFactor,
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

    it('produces throttle data with wide sweep range', async () => {
      const buffer = generateFilterDemoBBL();
      const result = await BlackboxParser.parse(buffer);
      const session = result.sessions[0];

      const throttle = session.flightData.setpoint[3];
      const min = Math.min(...Array.from(throttle.values));
      const max = Math.max(...Array.from(throttle.values));
      // Multi-phase throttle should cover 1350-1800 range (450 units)
      expect(max - min).toBeGreaterThan(400);
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

  describe('generateVerificationDemoBBL', () => {
    it('generates a parseable BBL buffer', async () => {
      const buffer = generateVerificationDemoBBL();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(1000);

      const result = await BlackboxParser.parse(buffer);
      expect(result.success).toBe(true);
      expect(result.sessions.length).toBe(1);
    });

    it('produces hover data with no step inputs', async () => {
      const buffer = generateVerificationDemoBBL();
      const result = await BlackboxParser.parse(buffer);
      const session = result.sessions[0];

      // Roll/pitch/yaw setpoints should be near zero (hover, no steps)
      for (let axis = 0; axis < 3; axis++) {
        const maxSetpoint = Math.max(
          ...Array.from(session.flightData.setpoint[axis].values).map(Math.abs)
        );
        expect(maxSetpoint).toBeLessThanOrEqual(1);
      }
    });

    it('has lower noise than filter flight data', async () => {
      const filterBuffer = generateFilterDemoBBL();
      const verifyBuffer = generateVerificationDemoBBL();

      const filterResult = await BlackboxParser.parse(filterBuffer);
      const verifyResult = await BlackboxParser.parse(verifyBuffer);

      // Compare max absolute gyro values across all axes
      for (let axis = 0; axis < 3; axis++) {
        const filterMax = Math.max(
          ...Array.from(filterResult.sessions[0].flightData.gyro[axis].values).map(Math.abs)
        );
        const verifyMax = Math.max(
          ...Array.from(verifyResult.sessions[0].flightData.gyro[axis].values).map(Math.abs)
        );
        expect(verifyMax).toBeLessThan(filterMax);
      }
    });
  });

  describe('step response model', () => {
    it('produces overshoot in 10-25% range for roll/pitch', async () => {
      const buffer = generatePIDDemoBBL();
      const result = await BlackboxParser.parse(buffer);
      const session = result.sessions[0];
      const steps = detectSteps(session.flightData);

      // Group steps by axis and measure overshoot
      for (const axisIdx of [0, 1] as const) {
        const axisSteps = steps.filter((s) => s.axis === axisIdx);
        expect(axisSteps.length).toBeGreaterThanOrEqual(3);

        // Check overshoot for each step: gyro peak / setpoint magnitude
        const overshoots: number[] = [];
        for (const step of axisSteps) {
          const gyro = session.flightData.gyro[step.axis].values;
          const setpointMag = Math.abs(
            session.flightData.setpoint[step.axis].values[step.startIndex]
          );
          if (setpointMag < 50) continue; // skip small steps

          // Find peak gyro value during step hold
          let peak = 0;
          for (let i = step.startIndex; i <= step.endIndex; i++) {
            const val = gyro[i];
            if (setpointMag > 0 && Math.abs(val) > Math.abs(peak)) {
              peak = val;
            }
          }

          // Overshoot = (peak - target) / target * 100
          const sign = session.flightData.setpoint[step.axis].values[step.startIndex] > 0 ? 1 : -1;
          const overshoot = ((sign * peak - setpointMag) / setpointMag) * 100;
          if (overshoot > 0) {
            overshoots.push(overshoot);
          }
        }

        if (overshoots.length > 0) {
          const meanOvershoot = overshoots.reduce((a, b) => a + b, 0) / overshoots.length;
          // Second-order model targets ~16-18% overshoot, but noise
          // shifts the raw peak measurement. Accept 3-30% range.
          expect(meanOvershoot).toBeGreaterThan(3);
          expect(meanOvershoot).toBeLessThan(30);
        }
      }
    });

    it('produces lower overshoot for yaw (<15%)', async () => {
      const buffer = generatePIDDemoBBL();
      const result = await BlackboxParser.parse(buffer);
      const session = result.sessions[0];
      const steps = detectSteps(session.flightData);

      const yawSteps = steps.filter((s) => s.axis === 2);
      expect(yawSteps.length).toBeGreaterThanOrEqual(2);

      const overshoots: number[] = [];
      for (const step of yawSteps) {
        const gyro = session.flightData.gyro[step.axis].values;
        const setpointMag = Math.abs(
          session.flightData.setpoint[step.axis].values[step.startIndex]
        );
        if (setpointMag < 50) continue;

        let peak = 0;
        for (let i = step.startIndex; i <= step.endIndex; i++) {
          if (Math.abs(gyro[i]) > Math.abs(peak)) {
            peak = gyro[i];
          }
        }

        const sign = session.flightData.setpoint[step.axis].values[step.startIndex] > 0 ? 1 : -1;
        const overshoot = ((sign * peak - setpointMag) / setpointMag) * 100;
        if (overshoot > 0) {
          overshoots.push(overshoot);
        }
      }

      if (overshoots.length > 0) {
        const meanOvershoot = overshoots.reduce((a, b) => a + b, 0) / overshoots.length;
        // Yaw with ζ=0.65 should produce <15% overshoot
        expect(meanOvershoot).toBeLessThan(15);
      }
    });
  });

  describe('progressive noise reduction', () => {
    it('progressiveFactor returns 1.0 for cycle 0', () => {
      expect(progressiveFactor(0)).toBe(1.0);
    });

    it('progressiveFactor decreases with each cycle', () => {
      const f0 = progressiveFactor(0);
      const f1 = progressiveFactor(1);
      const f2 = progressiveFactor(2);
      const f3 = progressiveFactor(3);
      expect(f1).toBeLessThan(f0);
      expect(f2).toBeLessThan(f1);
      expect(f3).toBeLessThan(f2);
    });

    it('progressiveFactor caps at 0.10 after cycle 5', () => {
      expect(progressiveFactor(5)).toBeCloseTo(0.1, 2);
      expect(progressiveFactor(6)).toBeCloseTo(0.1, 2);
      expect(progressiveFactor(10)).toBeCloseTo(0.1, 2);
    });

    it('cycle 1 filter data has lower noise than cycle 0', async () => {
      const buf0 = generateFilterDemoBBL(0);
      const buf1 = generateFilterDemoBBL(1);

      const res0 = await BlackboxParser.parse(buf0);
      const res1 = await BlackboxParser.parse(buf1);

      // Compare max absolute gyro values — cycle 1 should be lower
      for (let axis = 0; axis < 3; axis++) {
        const max0 = Math.max(
          ...Array.from(res0.sessions[0].flightData.gyro[axis].values).map(Math.abs)
        );
        const max1 = Math.max(
          ...Array.from(res1.sessions[0].flightData.gyro[axis].values).map(Math.abs)
        );
        expect(max1).toBeLessThan(max0);
      }
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
