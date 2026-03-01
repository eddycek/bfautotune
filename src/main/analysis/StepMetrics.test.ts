import { describe, it, expect } from 'vitest';
import { computeStepResponse, aggregateAxisMetrics, classifyFFContribution } from './StepMetrics';
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

function makeStep(
  startIndex: number,
  endIndex: number,
  magnitude: number,
  axis: 0 | 1 | 2 = 0
): StepEvent {
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
      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const gyro = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
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
      const gyro = makeSeries((i) => {
        if (i < stepAt) return 0;
        const t = (i - stepAt) / SAMPLE_RATE;
        // Decaying oscillation around target
        return (
          stepMag * (1 + overshootFraction * Math.exp(-t * 30) * Math.cos(2 * Math.PI * 20 * t))
        );
      }, numSamples);
      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
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
      const gyro = makeSeries((i) => {
        if (i < stepAt) return 0;
        const t = (i - stepAt) / SAMPLE_RATE;
        return stepMag * (1 - Math.exp(-t * 10)); // Slow rise with τ = 100ms
      }, numSamples);
      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
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
      const gyro = makeSeries((i) => {
        if (i < stepAt) return 0;
        const t = (i - stepAt) / SAMPLE_RATE;
        // Damped oscillation with multiple cycles
        return stepMag + 30 * Math.exp(-t * 8) * Math.sin(2 * Math.PI * 40 * t);
      }, numSamples);
      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
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
      const gyro = makeSeries((i) => {
        if (i < stepAt + delaySamples) return 0;
        return stepMag;
      }, numSamples);
      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
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
      const gyro = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
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
      const gyro = makeSeries((i) => {
        if (i < stepAt) return 0;
        if (i < settleAt) {
          // Oscillate around target
          const t = (i - stepAt) / SAMPLE_RATE;
          return stepMag + 50 * Math.sin(2 * Math.PI * 30 * t);
        }
        return stepMag; // Settled
      }, numSamples);
      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
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

      const gyro = makeSeries((i) => {
        if (i < stepAt) return 0;
        if (i === stepAt + 50) return peakVal; // Single peak
        return stepMag;
      }, numSamples);
      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
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
      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 1200, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      // Should complete without error, with degraded metrics
      expect(result).toBeDefined();
      expect(result.overshootPercent).toBe(0);
    });

    it('should handle step starting at index 0', () => {
      const numSamples = 2000;
      const stepMag = 300;

      const gyro = makeSeries((i) => stepMag, numSamples);
      const setpoint = makeSeries((i) => stepMag, numSamples);
      const step = makeStep(0, 1200, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      expect(result).toBeDefined();
    });

    it('should handle very short response window', () => {
      const numSamples = 300;
      const stepAt = 100;
      const stepMag = 300;

      const gyro = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
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

      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const gyro = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
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
        (stepEnd - stepAt - 1) * MS_PER_SAMPLE,
        2
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
      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const gyro = makeSeries((i) => (i >= stepAt + delaySamples ? stepMag : 0), numSamples);
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
      const gyro = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 1200, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      // Rise time should be ~0 since it jumps instantly
      expect(result.riseTimeMs).toBeLessThan(2);
    });

    it('should compute near-zero trackingErrorRMS for perfect tracking', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = 300;

      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const gyro = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 1200, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      expect(result.trackingErrorRMS).toBeDefined();
      expect(result.trackingErrorRMS).toBeCloseTo(0, 1);
    });

    it('should compute non-zero trackingErrorRMS for offset response', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = 300;
      const offset = 30; // constant 30 deg/s error = 10% of magnitude

      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const gyro = makeSeries((i) => (i >= stepAt ? stepMag - offset : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 1200, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      expect(result.trackingErrorRMS).toBeDefined();
      // Error = offset/|magnitude| = 30/300 = 0.1 for all samples after step
      // Before step: setpoint=0, gyro=0 → error=0. Combined RMS should be close to 0.1
      expect(result.trackingErrorRMS!).toBeGreaterThan(0.05);
      expect(result.trackingErrorRMS!).toBeLessThan(0.15);
    });

    it('should compute near-zero steadyStateErrorPercent for perfect hold', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = 300;

      // Perfect step: gyro matches setpoint during hold
      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const gyro = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 1200, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      expect(result.steadyStateErrorPercent).toBeDefined();
      expect(result.steadyStateErrorPercent!).toBeCloseTo(0, 1);
    });

    it('should compute non-zero steadyStateErrorPercent for drifting hold', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepEnd = stepAt + 1200;
      const stepMag = 300;
      const drift = 15; // 15 deg/s constant drift during hold = 5% of magnitude

      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      // Gyro matches during rise, but drifts during hold phase (last 20%)
      const holdStart = stepAt + Math.floor((stepEnd - stepAt) * 0.8);
      const gyro = makeSeries((i) => {
        if (i < stepAt) return 0;
        if (i >= holdStart) return stepMag - drift;
        return stepMag;
      }, numSamples);
      const step = makeStep(stepAt, stepEnd, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      expect(result.steadyStateErrorPercent).toBeDefined();
      // Error ≈ drift / magnitude * 100 = 15/300*100 = 5%
      expect(result.steadyStateErrorPercent!).toBeCloseTo(5, 0);
    });

    it('should return trackingErrorRMS=1.0 for near-zero magnitude', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = 0.5; // near-zero

      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const gyro = makeSeries(() => 0, numSamples);
      const step = makeStep(stepAt, stepAt + 400, stepMag);

      const result = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      expect(result.trackingErrorRMS).toBe(1.0);
    });
  });

  describe('aggregateAxisMetrics', () => {
    function makeResponse(
      overshoot: number,
      riseTime: number,
      settling: number,
      latency: number
    ): StepResponse {
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
        makeResponse(15, 25, 60, 5), // valid
        makeResponse(20, 30, 80, 8), // valid
        makeResponse(808, 0, 300, 0), // degenerate: 0ms rise, 808% overshoot
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
      const responses = [makeResponse(600, 0, 300, 0), makeResponse(900, 0, 300, 0)];

      const profile = aggregateAxisMetrics(responses);

      // No valid responses, so fall back to all
      expect(profile.meanOvershoot).toBeCloseTo(750, 0);
      expect(profile.meanRiseTimeMs).toBeCloseTo(0, 0);
    });

    it('should aggregate meanTrackingErrorRMS from responses', () => {
      const responses = [
        { ...makeResponse(10, 20, 50, 5), trackingErrorRMS: 0.1 },
        { ...makeResponse(20, 40, 100, 10), trackingErrorRMS: 0.2 },
        { ...makeResponse(30, 60, 150, 15), trackingErrorRMS: 0.3 },
      ];

      const profile = aggregateAxisMetrics(responses);

      expect(profile.meanTrackingErrorRMS).toBeCloseTo(0.2, 2);
    });

    it('should handle missing trackingErrorRMS (treat as 0)', () => {
      const responses = [
        makeResponse(10, 20, 50, 5), // no trackingErrorRMS
        { ...makeResponse(20, 40, 100, 10), trackingErrorRMS: 0.4 },
      ];

      const profile = aggregateAxisMetrics(responses);

      // (0 + 0.4) / 2 = 0.2
      expect(profile.meanTrackingErrorRMS).toBeCloseTo(0.2, 2);
    });

    it('should aggregate meanSteadyStateError from responses', () => {
      const responses = [
        { ...makeResponse(10, 20, 50, 5), steadyStateErrorPercent: 2.0 },
        { ...makeResponse(20, 40, 100, 10), steadyStateErrorPercent: 4.0 },
        { ...makeResponse(15, 30, 75, 7), steadyStateErrorPercent: 6.0 },
      ];

      const profile = aggregateAxisMetrics(responses);

      expect(profile.meanSteadyStateError).toBeCloseTo(4.0, 1);
    });

    it('should handle missing steadyStateErrorPercent (treat as 0)', () => {
      const responses = [
        makeResponse(10, 20, 50, 5), // no steadyStateErrorPercent
        { ...makeResponse(20, 40, 100, 10), steadyStateErrorPercent: 6.0 },
      ];

      const profile = aggregateAxisMetrics(responses);

      // (0 + 6) / 2 = 3
      expect(profile.meanSteadyStateError).toBeCloseTo(3.0, 1);
    });
  });

  describe('classifyFFContribution', () => {
    it('should return true and set high ffContribution when pidF energy dominates', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = 300;
      const peakAt = stepAt + 50;

      // Gyro with overshoot
      const gyro = makeSeries((i) => {
        if (i < stepAt) return 0;
        if (i === peakAt) return stepMag * 1.3;
        if (i >= stepAt) return stepMag;
        return 0;
      }, numSamples);

      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 400, stepMag);
      const response = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      // pidF consistently high, pidP consistently low → FF energy dominates
      const pidP = makeSeries(() => 10, numSamples);
      const pidF = makeSeries(() => 50, numSamples);

      const result = classifyFFContribution(response, pidP, pidF, gyro);
      expect(result).toBe(true);
      // ffContribution should be high (50²/(50²+10²) ≈ 0.96)
      expect(response.ffContribution).toBeDefined();
      expect(response.ffContribution!).toBeGreaterThan(0.9);
    });

    it('should return false and set low ffContribution when pidP energy dominates', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = 300;
      const peakAt = stepAt + 50;

      const gyro = makeSeries((i) => {
        if (i < stepAt) return 0;
        if (i === peakAt) return stepMag * 1.3;
        if (i >= stepAt) return stepMag;
        return 0;
      }, numSamples);

      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 400, stepMag);
      const response = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      // pidP consistently high, pidF consistently low → PID energy dominates
      const pidP = makeSeries(() => 50, numSamples);
      const pidF = makeSeries(() => 10, numSamples);

      const result = classifyFFContribution(response, pidP, pidF, gyro);
      expect(result).toBe(false);
      expect(response.ffContribution).toBeDefined();
      expect(response.ffContribution!).toBeLessThan(0.1);
    });

    it('should return undefined when overshoot is below threshold', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = 300;

      // No overshoot — gyro matches setpoint exactly
      const gyro = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 400, stepMag);
      const response = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      const pidP = makeSeries(() => 10, numSamples);
      const pidF = makeSeries(() => 5, numSamples);

      const result = classifyFFContribution(response, pidP, pidF, gyro);
      expect(result).toBeUndefined();
      expect(response.ffContribution).toBeUndefined();
    });

    it('should compute mixed ratio when FF and P have similar energy', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = 300;
      const peakAt = stepAt + 50;

      const gyro = makeSeries((i) => {
        if (i < stepAt) return 0;
        if (i === peakAt) return stepMag * 1.3;
        if (i >= stepAt) return stepMag;
        return 0;
      }, numSamples);

      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 400, stepMag);
      const response = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      // Equal pidP and pidF → 50% each
      const pidP = makeSeries(() => 30, numSamples);
      const pidF = makeSeries(() => 30, numSamples);

      const result = classifyFFContribution(response, pidP, pidF, gyro);
      // With equal energy, ratio = 0.5 → not > 0.5, returns false
      expect(result).toBe(false);
      expect(response.ffContribution).toBeDefined();
      expect(response.ffContribution!).toBeCloseTo(0.5, 1);
    });

    it('ffContribution is rounded to 3 decimal places', () => {
      const numSamples = 2000;
      const stepAt = 200;
      const stepMag = 300;
      const peakAt = stepAt + 50;

      const gyro = makeSeries((i) => {
        if (i < stepAt) return 0;
        if (i === peakAt) return stepMag * 1.3;
        if (i >= stepAt) return stepMag;
        return 0;
      }, numSamples);

      const setpoint = makeSeries((i) => (i >= stepAt ? stepMag : 0), numSamples);
      const step = makeStep(stepAt, stepAt + 400, stepMag);
      const response = computeStepResponse(setpoint, gyro, step, SAMPLE_RATE);

      const pidP = makeSeries(() => 20, numSamples);
      const pidF = makeSeries(() => 35, numSamples);

      classifyFFContribution(response, pidP, pidF, gyro);
      expect(response.ffContribution).toBeDefined();
      // Check it's a clean decimal (no more than 3 places)
      const str = response.ffContribution!.toString();
      const decimalPart = str.split('.')[1] || '';
      expect(decimalPart.length).toBeLessThanOrEqual(3);
    });
  });
});
