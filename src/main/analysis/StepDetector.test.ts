import { describe, it, expect } from 'vitest';
import { detectSteps } from './StepDetector';
import type { BlackboxFlightData, TimeSeries } from '@shared/types/blackbox.types';

const SAMPLE_RATE = 4000;

function makeSeries(fn: (i: number) => number, numSamples: number): TimeSeries {
  const time = new Float64Array(numSamples);
  const values = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    time[i] = i / SAMPLE_RATE;
    values[i] = fn(i);
  }
  return { time, values };
}

function zeroSeries(numSamples: number): TimeSeries {
  return makeSeries(() => 0, numSamples);
}

/**
 * Create flight data with custom setpoint per axis.
 */
function createFlightData(
  setpointFns: Array<(i: number) => number>,
  numSamples: number,
  sampleRate: number = SAMPLE_RATE
): BlackboxFlightData {
  const zero = zeroSeries(numSamples);
  return {
    gyro: [zero, zero, zero],
    setpoint: [
      makeSeries(setpointFns[0] || (() => 0), numSamples),
      makeSeries(setpointFns[1] || (() => 0), numSamples),
      makeSeries(setpointFns[2] || (() => 0), numSamples),
      makeSeries(() => 0.5, numSamples), // throttle
    ],
    pidP: [zero, zero, zero],
    pidI: [zero, zero, zero],
    pidD: [zero, zero, zero],
    pidF: [zero, zero, zero],
    motor: [zero, zero, zero, zero],
    debug: [],
    sampleRateHz: sampleRate,
    durationSeconds: numSamples / sampleRate,
    frameCount: numSamples,
  };
}

/**
 * Create a step function: starts at 0, jumps to `magnitude` at sample `stepAt`.
 */
function stepFn(stepAt: number, magnitude: number): (i: number) => number {
  return (i: number) => (i >= stepAt ? magnitude : 0);
}

/**
 * Create a two-step function: 0 → mag1 at step1, mag1 → mag2 at step2.
 */
function twoStepFn(step1: number, mag1: number, step2: number, mag2: number): (i: number) => number {
  return (i: number) => {
    if (i >= step2) return mag2;
    if (i >= step1) return mag1;
    return 0;
  };
}

describe('StepDetector', () => {
  describe('detectSteps', () => {
    it('should detect a single positive step', () => {
      const numSamples = 4000; // 1 second
      const data = createFlightData([stepFn(1000, 300)], numSamples);

      const steps = detectSteps(data);

      expect(steps.length).toBeGreaterThanOrEqual(1);
      const rollStep = steps.find(s => s.axis === 0);
      expect(rollStep).toBeDefined();
      expect(rollStep!.direction).toBe('positive');
      expect(rollStep!.magnitude).toBeGreaterThan(0);
      // Step should be detected near sample 1000
      expect(rollStep!.startIndex).toBeGreaterThanOrEqual(990);
      expect(rollStep!.startIndex).toBeLessThanOrEqual(1010);
    });

    it('should detect a single negative step', () => {
      const numSamples = 4000;
      const data = createFlightData([stepFn(1000, -250)], numSamples);

      const steps = detectSteps(data);

      const rollStep = steps.find(s => s.axis === 0);
      expect(rollStep).toBeDefined();
      expect(rollStep!.direction).toBe('negative');
      expect(rollStep!.magnitude).toBeLessThan(0);
    });

    it('should detect multiple steps on the same axis', () => {
      const numSamples = 8000; // 2 seconds
      // Two steps well separated
      const data = createFlightData([twoStepFn(1000, 300, 4000, -200)], numSamples);

      const steps = detectSteps(data);
      const rollSteps = steps.filter(s => s.axis === 0);

      expect(rollSteps.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect steps on different axes', () => {
      const numSamples = 4000;
      const data = createFlightData([
        stepFn(500, 300),   // roll step
        stepFn(1500, -250), // pitch step
        stepFn(2500, 200),  // yaw step
      ], numSamples);

      const steps = detectSteps(data);

      const axes = new Set(steps.map(s => s.axis));
      expect(axes.size).toBeGreaterThanOrEqual(2); // At least 2 axes detected
    });

    it('should ignore small setpoint changes below magnitude threshold', () => {
      const numSamples = 4000;
      // Small step of only 50 deg/s (below STEP_MIN_MAGNITUDE_DEG_S = 100)
      const data = createFlightData([stepFn(1000, 50)], numSamples);

      const steps = detectSteps(data);
      const rollSteps = steps.filter(s => s.axis === 0);

      expect(rollSteps.length).toBe(0);
    });

    it('should ignore constant setpoint (no steps)', () => {
      const numSamples = 4000;
      const data = createFlightData([() => 200], numSamples); // Constant value

      const steps = detectSteps(data);

      expect(steps.length).toBe(0);
    });

    it('should filter rapid stick oscillations by cooldown', () => {
      const numSamples = 4000;
      // Rapid oscillation: step every 20ms (80 samples at 4kHz) — below cooldown of 100ms
      const fn = (i: number) => {
        const period = 80;
        return ((Math.floor(i / period) % 2) === 0) ? 0 : 300;
      };
      const data = createFlightData([fn], numSamples);

      const steps = detectSteps(data);
      const rollSteps = steps.filter(s => s.axis === 0);

      // Should detect fewer steps than the raw oscillation count
      // With 4000 samples / 80 period = 50 transitions, but cooldown should limit this
      expect(rollSteps.length).toBeLessThan(25);
    });

    it('should return steps sorted by magnitude (largest first)', () => {
      const numSamples = 8000;
      const fn = (i: number) => {
        if (i >= 4000) return 150; // Small step at sample 4000
        if (i >= 1000) return 400; // Large step at sample 1000
        return 0;
      };
      const data = createFlightData([fn], numSamples);

      const steps = detectSteps(data);

      if (steps.length >= 2) {
        for (let i = 1; i < steps.length; i++) {
          expect(Math.abs(steps[i].magnitude)).toBeLessThanOrEqual(Math.abs(steps[i - 1].magnitude));
        }
      }
    });

    it('should set response window end correctly', () => {
      const numSamples = 4000;
      const data = createFlightData([stepFn(1000, 300)], numSamples);

      const steps = detectSteps(data);
      const rollStep = steps.find(s => s.axis === 0);
      expect(rollStep).toBeDefined();

      // Response window should be STEP_RESPONSE_WINDOW_MS (300ms) = 1200 samples at 4kHz
      const expectedWindowSamples = Math.ceil((300 / 1000) * SAMPLE_RATE);
      expect(rollStep!.endIndex).toBeLessThanOrEqual(rollStep!.startIndex + expectedWindowSamples);
      expect(rollStep!.endIndex).toBeGreaterThan(rollStep!.startIndex);
    });

    it('should handle step near end of data (truncated window)', () => {
      const numSamples = 1500; // Very short, 0.375s
      // Step at sample 1200 — only 300 samples left for response
      const data = createFlightData([stepFn(1200, 300)], numSamples);

      const steps = detectSteps(data);
      const rollStep = steps.find(s => s.axis === 0);

      if (rollStep) {
        expect(rollStep.endIndex).toBeLessThanOrEqual(numSamples);
      }
    });

    it('should handle empty flight data', () => {
      const data = createFlightData([() => 0], 0);
      const steps = detectSteps(data);
      expect(steps.length).toBe(0);
    });

    it('should handle very short flight data (1 sample)', () => {
      const data = createFlightData([() => 0], 1);
      const steps = detectSteps(data);
      expect(steps.length).toBe(0);
    });

    it('should detect steps at different sample rates', () => {
      const sampleRate = 8000;
      const numSamples = sampleRate; // 1 second
      const data = createFlightData([stepFn(2000, 300)], numSamples, sampleRate);

      const steps = detectSteps(data);
      const rollStep = steps.find(s => s.axis === 0);

      expect(rollStep).toBeDefined();
      expect(rollStep!.startIndex).toBeGreaterThanOrEqual(1990);
      expect(rollStep!.startIndex).toBeLessThanOrEqual(2010);
    });

    it('should not detect steps when hold time is too short', () => {
      const numSamples = 4000;
      // Very brief spike: up for only 2 samples then immediately reverses
      // This creates a step up then immediate step back — hold time validation
      // should reject both because neither holds at the new value long enough
      const fn = (i: number) => {
        if (i >= 1000 && i < 1002) return 300;
        if (i >= 1002 && i < 1004) return -300;
        return 0;
      };
      const data = createFlightData([fn], numSamples);

      const steps = detectSteps(data);
      const rollSteps = steps.filter(s => s.axis === 0);

      // Spikes that don't hold should be rejected or heavily limited
      // At minimum, such short spikes shouldn't produce valid steps
      expect(rollSteps.length).toBeLessThanOrEqual(1);
    });

    it('should compute correct magnitude for the step', () => {
      const numSamples = 4000;
      const stepMag = 350;
      const data = createFlightData([stepFn(1000, stepMag)], numSamples);

      const steps = detectSteps(data);
      const rollStep = steps.find(s => s.axis === 0);

      expect(rollStep).toBeDefined();
      // Magnitude should be close to the actual step size
      expect(Math.abs(rollStep!.magnitude - stepMag)).toBeLessThan(50);
    });

    it('should handle gradual ramp (not a step)', () => {
      const numSamples = 4000;
      // Linear ramp from 0 to 200 over 1 second — derivative = 200 deg/s/s
      // Below STEP_DERIVATIVE_THRESHOLD = 500
      const fn = (i: number) => (i / numSamples) * 200;
      const data = createFlightData([fn], numSamples);

      const steps = detectSteps(data);
      const rollSteps = steps.filter(s => s.axis === 0);

      expect(rollSteps.length).toBe(0);
    });
  });
});
