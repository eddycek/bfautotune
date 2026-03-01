import { describe, it, expect, vi } from 'vitest';
import { analyzePID } from './PIDAnalyzer';
import type { BlackboxFlightData, TimeSeries } from '@shared/types/blackbox.types';
import type { AnalysisProgress } from '@shared/types/analysis.types';
import type { PIDConfiguration } from '@shared/types/pid.types';

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

function createFlightData(opts: {
  sampleRate?: number;
  numSamples?: number;
  rollSetpointFn?: (i: number) => number;
  rollGyroFn?: (i: number) => number;
  pitchSetpointFn?: (i: number) => number;
  pitchGyroFn?: (i: number) => number;
}): BlackboxFlightData {
  const sr = opts.sampleRate ?? SAMPLE_RATE;
  const n = opts.numSamples ?? sr * 2; // 2 seconds default
  const zero = makeSeries(() => 0, n);
  const throttle = makeSeries(() => 0.5, n);

  return {
    gyro: [
      makeSeries(opts.rollGyroFn ?? (() => 0), n),
      makeSeries(opts.pitchGyroFn ?? (() => 0), n),
      zero,
    ],
    setpoint: [
      makeSeries(opts.rollSetpointFn ?? (() => 0), n),
      makeSeries(opts.pitchSetpointFn ?? (() => 0), n),
      zero,
      throttle,
    ],
    pidP: [zero, zero, zero],
    pidI: [zero, zero, zero],
    pidD: [zero, zero, zero],
    pidF: [zero, zero, zero],
    motor: [zero, zero, zero, zero],
    debug: [],
    sampleRateHz: sr,
    durationSeconds: n / sr,
    frameCount: n,
  };
}

const PIDS: PIDConfiguration = {
  roll: { P: 45, I: 80, D: 30 },
  pitch: { P: 47, I: 84, D: 32 },
  yaw: { P: 45, I: 80, D: 0 },
};

describe('PIDAnalyzer', () => {
  describe('analyzePID', () => {
    it('should return complete PIDAnalysisResult', async () => {
      const stepAt = 1000;
      const mag = 300;
      const data = createFlightData({
        rollSetpointFn: (i) => (i >= stepAt ? mag : 0),
        rollGyroFn: (i) => (i >= stepAt ? mag : 0),
      });

      const result = await analyzePID(data, 0, PIDS);

      expect(result.roll).toBeDefined();
      expect(result.pitch).toBeDefined();
      expect(result.yaw).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.analysisTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.sessionIndex).toBe(0);
      expect(result.stepsDetected).toBeGreaterThanOrEqual(1);
      expect(result.currentPIDs).toEqual(PIDS);
    });

    it('should report progress during analysis', async () => {
      const stepAt = 1000;
      const data = createFlightData({
        rollSetpointFn: (i) => (i >= stepAt ? 300 : 0),
        rollGyroFn: (i) => (i >= stepAt ? 300 : 0),
      });

      const progressUpdates: AnalysisProgress[] = [];
      await analyzePID(data, 0, PIDS, (progress) => {
        progressUpdates.push({ ...progress });
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      // Should start with detecting
      expect(progressUpdates[0].step).toBe('detecting');
      // Should end at 100%
      expect(progressUpdates[progressUpdates.length - 1].percent).toBe(100);
      // Should cover all PID-specific steps
      const steps = new Set(progressUpdates.map((p) => p.step));
      expect(steps.has('detecting')).toBe(true);
      expect(steps.has('measuring')).toBe(true);
      expect(steps.has('scoring')).toBe(true);
    });

    it('should handle flight with no steps', async () => {
      const data = createFlightData({
        rollSetpointFn: () => 0,
      });

      const result = await analyzePID(data, 0, PIDS);

      expect(result.stepsDetected).toBe(0);
      expect(result.roll.responses.length).toBe(0);
      expect(result.summary).toContain('No step inputs');
    });

    it('should use correct session index', async () => {
      const data = createFlightData({});

      const result = await analyzePID(data, 5, PIDS);

      expect(result.sessionIndex).toBe(5);
    });

    it('should detect overshoot and recommend changes', async () => {
      const stepAt = 1000;
      const mag = 300;
      const data = createFlightData({
        rollSetpointFn: (i) => (i >= stepAt ? mag : 0),
        rollGyroFn: (i) => {
          if (i < stepAt) return 0;
          const t = (i - stepAt) / SAMPLE_RATE;
          // Significant overshoot
          return mag * (1 + 0.4 * Math.exp(-t * 20) * Math.cos(2 * Math.PI * 15 * t));
        },
      });

      const result = await analyzePID(data, 0, PIDS);

      // Should detect overshoot on roll
      if (result.roll.responses.length > 0) {
        expect(result.roll.meanOvershoot).toBeGreaterThan(10);
      }
    });

    it('should complete in reasonable time', async () => {
      const data = createFlightData({ numSamples: 32000 });

      const start = performance.now();
      const result = await analyzePID(data, 0, PIDS);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(5000);
      expect(result.analysisTimeMs).toBeGreaterThan(0);
    });

    it('should use default PIDs when none provided', async () => {
      const data = createFlightData({});

      const result = await analyzePID(data);

      expect(result.currentPIDs).toBeDefined();
      expect(result.sessionIndex).toBe(0);
    });

    it('should handle multiple steps on same axis', async () => {
      const mag = 300;
      const data = createFlightData({
        rollSetpointFn: (i) => {
          if (i >= 5000) return -mag; // Second step
          if (i >= 1000) return mag; // First step
          return 0;
        },
        rollGyroFn: (i) => {
          if (i >= 5000) return -mag;
          if (i >= 1000) return mag;
          return 0;
        },
      });

      const result = await analyzePID(data, 0, PIDS);

      // Should detect steps on roll
      expect(result.roll.responses.length).toBeGreaterThanOrEqual(1);
    });

    it('should analyze pitch and roll independently', async () => {
      const stepAt = 1000;
      const mag = 300;
      const data = createFlightData({
        rollSetpointFn: (i) => (i >= stepAt ? mag : 0),
        rollGyroFn: (i) => (i >= stepAt ? mag : 0),
        pitchSetpointFn: (i) => (i >= 3000 ? -mag : 0),
        pitchGyroFn: (i) => (i >= 3000 ? -mag : 0),
      });

      const result = await analyzePID(data, 0, PIDS);

      // Both axes should have at least been analyzed
      expect(result.roll).toBeDefined();
      expect(result.pitch).toBeDefined();
    });

    it('should attach feedforward context when rawHeaders provided', async () => {
      const data = createFlightData({
        rollSetpointFn: (i) => (i >= 1000 ? 300 : 0),
        rollGyroFn: (i) => (i >= 1000 ? 300 : 0),
      });
      const headers = new Map<string, string>();
      headers.set('feedforward_boost', '15');

      const result = await analyzePID(data, 0, PIDS, undefined, undefined, headers);

      expect(result.feedforwardContext).toBeDefined();
      expect(result.feedforwardContext!.active).toBe(true);
      expect(result.feedforwardContext!.boost).toBe(15);
    });

    it('should emit feedforward_active warning when FF is active', async () => {
      const data = createFlightData({});
      const headers = new Map<string, string>();
      headers.set('feedforward_boost', '15');

      const result = await analyzePID(data, 0, PIDS, undefined, undefined, headers);

      expect(result.warnings).toBeDefined();
      const ffWarning = result.warnings!.find((w) => w.code === 'feedforward_active');
      expect(ffWarning).toBeDefined();
      expect(ffWarning!.severity).toBe('info');
      expect(ffWarning!.message).toContain('Feedforward');
    });

    it('should not emit feedforward warning when FF is inactive', async () => {
      const data = createFlightData({});
      const headers = new Map<string, string>();
      headers.set('feedforward_boost', '0');

      const result = await analyzePID(data, 0, PIDS, undefined, undefined, headers);

      expect(result.feedforwardContext).toBeDefined();
      expect(result.feedforwardContext!.active).toBe(false);
      const ffWarning = (result.warnings ?? []).find((w) => w.code === 'feedforward_active');
      expect(ffWarning).toBeUndefined();
    });

    it('should not set feedforwardContext when rawHeaders not provided', async () => {
      const data = createFlightData({});

      const result = await analyzePID(data, 0, PIDS);

      expect(result.feedforwardContext).toBeUndefined();
    });

    it('should include stepsDetected count', async () => {
      const data = createFlightData({
        rollSetpointFn: (i) => (i >= 1000 ? 300 : 0),
        rollGyroFn: (i) => (i >= 1000 ? 300 : 0),
      });

      const result = await analyzePID(data, 0, PIDS);

      expect(typeof result.stepsDetected).toBe('number');
      expect(result.stepsDetected).toBeGreaterThanOrEqual(0);
    });

    it('should pass flightStyle through to result', async () => {
      const data = createFlightData({
        rollSetpointFn: (i) => (i >= 1000 ? 300 : 0),
        rollGyroFn: (i) => (i >= 1000 ? 300 : 0),
      });

      const result = await analyzePID(data, 0, PIDS, undefined, undefined, undefined, 'aggressive');

      expect(result.flightStyle).toBe('aggressive');
    });

    it('should default flightStyle to balanced', async () => {
      const data = createFlightData({
        rollSetpointFn: (i) => (i >= 1000 ? 300 : 0),
        rollGyroFn: (i) => (i >= 1000 ? 300 : 0),
      });

      const result = await analyzePID(data, 0, PIDS);

      expect(result.flightStyle).toBe('balanced');
    });

    it('should include dataQuality score in result', async () => {
      const stepAt = 1000;
      const mag = 300;
      const data = createFlightData({
        rollSetpointFn: (i) => (i >= stepAt ? mag : 0),
        rollGyroFn: (i) => (i >= stepAt ? mag : 0),
      });

      const result = await analyzePID(data, 0, PIDS);

      expect(result.dataQuality).toBeDefined();
      expect(result.dataQuality!.overall).toBeGreaterThanOrEqual(0);
      expect(result.dataQuality!.overall).toBeLessThanOrEqual(100);
      expect(['excellent', 'good', 'fair', 'poor']).toContain(result.dataQuality!.tier);
      expect(result.dataQuality!.subScores.length).toBeGreaterThan(0);
    });

    it('should produce poor dataQuality for flights with no steps', async () => {
      const data = createFlightData({});

      const result = await analyzePID(data, 0, PIDS);

      expect(result.dataQuality).toBeDefined();
      expect(result.dataQuality!.tier).toBe('poor');
    });

    it('should use flightStyle thresholds in recommendations', async () => {
      // Create a step with moderate overshoot (~15%)
      const stepAt = 1000;
      const mag = 300;
      const overshootFactor = 1.15;
      const data = createFlightData({
        rollSetpointFn: (i) => (i >= stepAt ? mag : 0),
        rollGyroFn: (i) => {
          if (i < stepAt) return 0;
          // Initial overshoot then settle
          const elapsed = (i - stepAt) / SAMPLE_RATE;
          if (elapsed < 0.02) return mag * overshootFactor; // 15% overshoot
          return mag;
        },
      });

      // With aggressive style (moderateOvershoot=25), 15% shouldn't trigger
      const aggressive = await analyzePID(
        data,
        0,
        PIDS,
        undefined,
        undefined,
        undefined,
        'aggressive'
      );
      const aggressiveOvershootRecs = aggressive.recommendations.filter(
        (r) => r.reason.includes('overshoot') || r.reason.includes('Overshoot')
      );

      // With smooth style (moderateOvershoot=8), 15% should trigger
      const smooth = await analyzePID(data, 0, PIDS, undefined, undefined, undefined, 'smooth');
      const smoothOvershootRecs = smooth.recommendations.filter(
        (r) => r.reason.includes('overshoot') || r.reason.includes('Overshoot')
      );

      // Smooth should be at least as strict as aggressive
      expect(smoothOvershootRecs.length).toBeGreaterThanOrEqual(aggressiveOvershootRecs.length);
    });

    it('should include bayesianSuggestions when tuning history is provided', async () => {
      const data = createFlightData({});

      const history = [
        {
          id: 'r1',
          profileId: 'p1',
          startedAt: '',
          completedAt: '',
          baselineSnapshotId: null,
          postFilterSnapshotId: null,
          postTuningSnapshotId: null,
          filterLogId: null,
          pidLogId: null,
          verificationLogId: null,
          appliedFilterChanges: [],
          appliedPIDChanges: [],
          appliedFeedforwardChanges: [],
          filterMetrics: null,
          verificationMetrics: null,
          pidMetrics: {
            roll: {
              meanOvershoot: 25,
              meanRiseTimeMs: 60,
              meanSettlingTimeMs: 180,
              meanLatencyMs: 5,
            },
            pitch: {
              meanOvershoot: 25,
              meanRiseTimeMs: 60,
              meanSettlingTimeMs: 180,
              meanLatencyMs: 5,
            },
            yaw: {
              meanOvershoot: 5,
              meanRiseTimeMs: 40,
              meanSettlingTimeMs: 100,
              meanLatencyMs: 5,
            },
            stepsDetected: 10,
            currentPIDs: {
              roll: { P: 40, I: 80, D: 25 },
              pitch: { P: 42, I: 84, D: 27 },
              yaw: { P: 40, I: 80, D: 0 },
            },
            summary: 'test',
          },
        },
        {
          id: 'r2',
          profileId: 'p1',
          startedAt: '',
          completedAt: '',
          baselineSnapshotId: null,
          postFilterSnapshotId: null,
          postTuningSnapshotId: null,
          filterLogId: null,
          pidLogId: null,
          verificationLogId: null,
          appliedFilterChanges: [],
          appliedPIDChanges: [],
          appliedFeedforwardChanges: [],
          filterMetrics: null,
          verificationMetrics: null,
          pidMetrics: {
            roll: {
              meanOvershoot: 15,
              meanRiseTimeMs: 40,
              meanSettlingTimeMs: 100,
              meanLatencyMs: 5,
            },
            pitch: {
              meanOvershoot: 15,
              meanRiseTimeMs: 40,
              meanSettlingTimeMs: 100,
              meanLatencyMs: 5,
            },
            yaw: {
              meanOvershoot: 5,
              meanRiseTimeMs: 40,
              meanSettlingTimeMs: 100,
              meanLatencyMs: 5,
            },
            stepsDetected: 10,
            currentPIDs: {
              roll: { P: 45, I: 80, D: 30 },
              pitch: { P: 47, I: 84, D: 32 },
              yaw: { P: 45, I: 80, D: 0 },
            },
            summary: 'test',
          },
        },
        {
          id: 'r3',
          profileId: 'p1',
          startedAt: '',
          completedAt: '',
          baselineSnapshotId: null,
          postFilterSnapshotId: null,
          postTuningSnapshotId: null,
          filterLogId: null,
          pidLogId: null,
          verificationLogId: null,
          appliedFilterChanges: [],
          appliedPIDChanges: [],
          appliedFeedforwardChanges: [],
          filterMetrics: null,
          verificationMetrics: null,
          pidMetrics: {
            roll: {
              meanOvershoot: 10,
              meanRiseTimeMs: 30,
              meanSettlingTimeMs: 80,
              meanLatencyMs: 5,
            },
            pitch: {
              meanOvershoot: 10,
              meanRiseTimeMs: 30,
              meanSettlingTimeMs: 80,
              meanLatencyMs: 5,
            },
            yaw: { meanOvershoot: 5, meanRiseTimeMs: 30, meanSettlingTimeMs: 70, meanLatencyMs: 5 },
            stepsDetected: 10,
            currentPIDs: {
              roll: { P: 50, I: 80, D: 35 },
              pitch: { P: 52, I: 84, D: 37 },
              yaw: { P: 50, I: 80, D: 0 },
            },
            summary: 'test',
          },
        },
      ];

      const result = await analyzePID(
        data,
        0,
        PIDS,
        undefined,
        undefined,
        undefined,
        'balanced',
        history
      );

      expect(result.bayesianSuggestions).toBeDefined();
      expect(result.bayesianSuggestions!.usedBayesian).toBe(true);
      expect(result.bayesianSuggestions!.historySessionsUsed).toBe(3);
    });

    it('should not include bayesianSuggestions when no history', async () => {
      const data = createFlightData({});

      const result = await analyzePID(data, 0, PIDS);

      expect(result.bayesianSuggestions).toBeUndefined();
    });

    it('should not include bayesianSuggestions when insufficient history', async () => {
      const data = createFlightData({});
      const history = [
        {
          id: 'r1',
          profileId: 'p1',
          startedAt: '',
          completedAt: '',
          baselineSnapshotId: null,
          postFilterSnapshotId: null,
          postTuningSnapshotId: null,
          filterLogId: null,
          pidLogId: null,
          verificationLogId: null,
          appliedFilterChanges: [],
          appliedPIDChanges: [],
          appliedFeedforwardChanges: [],
          filterMetrics: null,
          verificationMetrics: null,
          pidMetrics: {
            roll: {
              meanOvershoot: 15,
              meanRiseTimeMs: 40,
              meanSettlingTimeMs: 100,
              meanLatencyMs: 5,
            },
            pitch: {
              meanOvershoot: 15,
              meanRiseTimeMs: 40,
              meanSettlingTimeMs: 100,
              meanLatencyMs: 5,
            },
            yaw: {
              meanOvershoot: 5,
              meanRiseTimeMs: 40,
              meanSettlingTimeMs: 100,
              meanLatencyMs: 5,
            },
            stepsDetected: 10,
            currentPIDs: PIDS,
            summary: 'test',
          },
        },
      ];

      const result = await analyzePID(
        data,
        0,
        PIDS,
        undefined,
        undefined,
        undefined,
        'balanced',
        history
      );

      expect(result.bayesianSuggestions).toBeUndefined();
    });
  });
});
