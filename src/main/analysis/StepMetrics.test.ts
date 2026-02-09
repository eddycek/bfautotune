import { describe, it, expect } from 'vitest';
import { computeStepResponse, aggregateAxisMetrics } from './StepMetrics';
import type { TimeSeries } from '@shared/types/blackbox.types';
import type { StepEvent, StepResponse } from '@shared/types/analysis.types';

const SAMPLE_RATE = 4000;
const MS_PER_SAMPLE = 1000 / SAMPLE_RATE;

function makeSeries(fn: (i: number) => number, numSamples: number): TimeSeries {
  const time = new Float64Array(numSamples);
  const values = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    time[i] = i / SAMPLE_RATE;
    values[i] = fn(i);
  }
  return { time, values };
}

function makeStep(startIndex: number, endIndex: number, magnitude: number, axis: 0 | 1 | 2 = 0): StepEvent {
  return {
    axis,
    startIndex,
    endIndex,
    magnitude,
    direction: magnitude > 0 ? 'positive' : 'negative',
  };
}

describe('StepMetrics', () => {
  describe('computeStepResponse', () => {
    it('should compute 0% overshoot for a perfect step response', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = 300;

      // Perfect step: gyro matches setpoint exactly after the step
      const setpoint = makeSeries(i => (i >= stepAt ? stepMag : 0), numSamples);
      const gyro = makeSeries(i => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 1200, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      expect(result.overshootPercent).toBeCloseTo(0, 0);
      expect(result.steadyStateValue).toBeCloseTo(stepMag, 0);
    });

    it('should detect correct overshoot for underdamped response', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = 300;
      const overshootFraction = 0.2; // 20% overshoot

      // Underdamped: overshoots then settles
      const gyro = makeSeries(i => {
        if (i < stepAt) return 0;
        const t = (i - stepAt) / SAMPLE_RATE;
        // Decaying oscillation around target
        return stepMag * (1 + overshootFraction * Math.exp(-t * 30) * Math.cos(2 * Math.PI * 20 * t));
      }, numSamples);
      const setpoint = makeSeries(i => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 1200, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      // Should detect overshoot around 20% (decaying oscillation with initial peak)
      expect(result.overshootPercent).toBeGreaterThan(10);
      expect(result.overshootPercent).toBeLessThan(30);
    });

    it('should detect slow rise time for overdamped response', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = 300;

      // Overdamped: slow exponential approach, no overshoot
      const gyro = makeSeries(i => {
        if (i < stepAt) return 0;
        const t = (i - stepAt) / SAMPLE_RATE;
        return stepMag * (1 - Math.exp(-t * 10)); // Slow rise with τ = 100ms
      }, numSamples);
      const setpoint = makeSeries(i => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 1200, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      // Rise time should be significant (exponential rise with τ = 100ms)
      expect(result.riseTimeMs).toBeGreaterThan(10);
      expect(result.overshootPercent).toBeLessThan(5);
      expect(result.ringingCount).toBe(0);
    });

    it('should count ringing correctly for oscillating response', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = 300;

      // Oscillating response: sustained oscillation around target
      const gyro = makeSeries(i => {
        if (i < stepAt) return 0;
        const t = (i - stepAt) / SAMPLE_RATE;
        // Damped oscillation with multiple cycles
        return stepMag + 30 * Math.exp(-t * 8) * Math.sin(2 * Math.PI * 40 * t);
      }, numSamples);
      const setpoint = makeSeries(i => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 1200, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      // Should detect multiple oscillation cycles
      expect(result.ringingCount).toBeGreaterThanOrEqual(2);
    });

    it('should detect latency when gyro is delayed', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = 300;
      const delayMs = 10; // 10ms delay
      const delaySamples = Math.round((delayMs / 1000) * SAMPLE_RATE);

      // Delayed response
      const gyro = makeSeries(i => {
        if (i < stepAt + delaySamples) return 0;
        return stepMag;
      }, numSamples);
      const setpoint = makeSeries(i => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 1200, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      // Latency should be around 10ms
      expect(result.latencyMs).toBeGreaterThanOrEqual(delayMs - 2);
      expect(result.latencyMs).toBeLessThanOrEqual(delayMs + 2);
    });

    it('should handle negative step correctly', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = -300;

      // Perfect negative step
      const gyro = makeSeries(i => (i >= stepAt ? stepMag : 0), numSamples);
      const setpoint = makeSeries(i => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 1200, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      expect(result.overshootPercent).toBeCloseTo(0, 0);
      expect(result.steadyStateValue).toBeCloseTo(stepMag, 0);
    });

    it('should compute settling time correctly', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = 300;

      // Response that oscillates then settles at sample ~600
      const settleAt = 600;
      const gyro = makeSeries(i => {
        if (i < stepAt) return 0;
        if (i < settleAt) {
          // Oscillate around target
          const t = (i - stepAt) / SAMPLE_RATE;
          return stepMag + 50 * Math.sin(2 * Math.PI * 30 * t);
        }
        return stepMag; // Settled
      }, numSamples);
      const setpoint = makeSeries(i => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 1200, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      // Settling time should be around (settleAt - stepAt) * msPerSample = 100ms
      const expectedSettleMs = (settleAt - stepAt) * MS_PER_SAMPLE;
      expect(result.settlingTimeMs).toBeGreaterThan(expectedSettleMs * 0.5);
      expect(result.settlingTimeMs).toBeLessThan(expectedSettleMs * 1.5);
    });

    it('should return peak value correctly', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = 300;
      const peakVal = 380;

      const gyro = makeSeries(i => {
        if (i < stepAt) return 0;
        if (i === stepAt + 50) return peakVal; // Single peak
        return stepMag;
      }, numSamples);
      const setpoint = makeSeries(i => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 1200, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      expect(result.peakValue).toBeCloseTo(peakVal, 0);
    });

    it('should handle zero gyro response (no movement)', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = 300;

      // Gyro doesn't respond at all
      const gyro = makeSeries(() => 0, numSamples);
      const setpoint = makeSeries(i => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 1200, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      // Should complete without error, with degraded metrics
      expect(result).toBeDefined();
      expect(result.overshootPercent).toBe(0);
    });

    it('should handle step starting at index 0', () => {
      const numSamples = 2000;
      const stepMag = 300;

      const gyro = makeSeries(i => stepMag, numSamples);
      const setpoint = makeSeries(i => stepMag, numSamples);
      const step = makeStep(0, 1200, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      expect(result).toBeDefined();
    });

    it('should handle very short response window', () => {
      const numSamples = 300;
      const stepAt = 100;
      const stepMag = 300;

      const gyro = makeSeries(i => (i >= stepAt ? stepMag : 0), numSamples);
      const setpoint = makeSeries(i => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, 250, stepMag); // Only 150 samples

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      expect(result).toBeDefined();
      expect(result.riseTimeMs).toBeLessThan(1000);
    });

    it('should populate trace data with correct time, setpoint, and gyro arrays', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepEnd = stepAt + 400;
      const stepMag = 300;

      const setpoint = makeSeries(i => (i >= stepAt ? stepMag : 0), numSamples);
      const gyro = makeSeries(i => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepEnd, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      expect(result.trace).toBeDefined();
      expect(result.trace!.timeMs.length).toBe(stepEnd - stepAt);
      expect(result.trace!.setpoint.length).toBe(stepEnd - stepAt);
      expect(result.trace!.gyro.length).toBe(stepEnd - stepAt);

      // First sample time should be 0
      expect(result.trace!.timeMs[0]).toBe(0);
      // Last sample time should be (windowLen - 1) * msPerSample
      expect(result.trace!.timeMs[result.trace!.timeMs.length - 1]).toBeCloseTo(
        (stepEnd - stepAt - 1) * MS_PER_SAMPLE, 2
      );

      // Setpoint should be stepMag for all samples (step started at stepAt)
      expect(result.trace!.setpoint[0]).toBe(stepMag);
      // Gyro should match
      expect(result.trace!.gyro[0]).toBe(stepMag);
    });

    it('should populate trace with pre-step baseline values at start', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepEnd = stepAt + 400;
      const stepMag = 300;
      const delaySamples = 20;

      // Gyro responds after a delay
      const setpoint = makeSeries(i => (i >= stepAt ? stepMag : 0), numSamples);
      const gyro = makeSeries(i => (i >= stepAt + delaySamples ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepEnd, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      // First few gyro trace samples should be 0 (before response)
      expect(result.trace!.gyro[0]).toBe(0);
      expect(result.trace!.gyro[delaySamples - 1]).toBe(0);
      // After delay, gyro should be at target
      expect(result.trace!.gyro[delaySamples]).toBe(stepMag);
    });

    it('should measure fast rise time for instant response', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = 300;

      // Instant response — gyro jumps to target immediately
      const gyro = makeSeries(i => (i >= stepAt ? stepMag : 0), numSamples);
      const setpoint = makeSeries(i => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 1200, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      // Rise time should be ~0 since it jumps instantly
      expect(result.riseTimeMs).toBeLessThan(2);
    });
  });

  describe('aggregateAxisMetrics', () => {
    function makeResponse(overshoot: number, riseTime: number, settling: number, latency: number): StepResponse {
      return {
        step: makeStep(0, 100, 300),
        riseTimeMs: riseTime,
        overshootPercent: overshoot,
        settlingTimeMs: settling,
        latencyMs: latency,
        ringingCount: 0,
        peakValue: 300,
        steadyStateValue: 300,
      };
    }

    it('should compute correct means from multiple responses', () => {
      const responses = [
        makeResponse(10, 20, 50, 5),
        makeResponse(20, 40, 100, 10),
        makeResponse(30, 60, 150, 15),
      ];

      const profile = aggregateAxisMetrics(responses);

      expect(profile.responses.length).toBe(3);
      expect(profile.meanOvershoot).toBeCloseTo(20, 0);
      expect(profile.meanRiseTimeMs).toBeCloseTo(40, 0);
      expect(profile.meanSettlingTimeMs).toBeCloseTo(100, 0);
      expect(profile.meanLatencyMs).toBeCloseTo(10, 0);
    });

    it('should return zeros for empty responses', () => {
      const profile = aggregateAxisMetrics([]);

      expect(profile.responses.length).toBe(0);
      expect(profile.meanOvershoot).toBe(0);
      expect(profile.meanRiseTimeMs).toBe(0);
      expect(profile.meanSettlingTimeMs).toBe(0);
      expect(profile.meanLatencyMs).toBe(0);
    });

    it('should handle single response', () => {
      const responses = [makeResponse(15, 30, 80, 7)];

      const profile = aggregateAxisMetrics(responses);

      expect(profile.responses.length).toBe(1);
      expect(profile.meanOvershoot).toBeCloseTo(15, 0);
      expect(profile.meanRiseTimeMs).toBeCloseTo(30, 0);
    });

    it('should exclude degenerate steps from mean computation', () => {
      const responses = [
        makeResponse(15, 25, 60, 5),   // valid
        makeResponse(20, 30, 80, 8),   // valid
        makeResponse(808, 0, 300, 0),  // degenerate: 0ms rise, 808% overshoot
      ];

      const profile = aggregateAxisMetrics(responses);

      // All responses preserved for chart display
      expect(profile.responses.length).toBe(3);
      // Means computed only from the 2 valid responses
      expect(profile.meanOvershoot).toBeCloseTo(17.5, 0);
      expect(profile.meanRiseTimeMs).toBeCloseTo(27.5, 0);
      expect(profile.meanSettlingTimeMs).toBeCloseTo(70, 0);
      expect(profile.meanLatencyMs).toBeCloseTo(6.5, 0);
    });

    it('should fall back to all responses if all are degenerate', () => {
      const responses = [
        makeResponse(600, 0, 300, 0),
        makeResponse(900, 0, 300, 0),
      ];

      const profile = aggregateAxisMetrics(responses);

      // No valid responses, so fall back to all
      expect(profile.meanOvershoot).toBeCloseTo(750, 0);
      expect(profile.meanRiseTimeMs).toBeCloseTo(0, 0);
    });
  });
});
