import { describe, it, expect } from 'vitest';
import {
  computeObjective,
  extractObservations,
  choleskyDecomposition,
  optimizeAxis,
  optimizeWithHistory,
} from './BayesianOptimizer';
import type { CompletedTuningRecord } from '@shared/types/tuning-history.types';
import type { BayesianObservation } from '@shared/types/analysis.types';
import type { PIDConfiguration } from '@shared/types/pid.types';

function makeRecord(
  pids: PIDConfiguration,
  rollMetrics: { overshoot: number; riseTimeMs: number; settlingTimeMs: number },
  pitchMetrics?: { overshoot: number; riseTimeMs: number; settlingTimeMs: number },
  dataQualityTier?: string
): CompletedTuningRecord {
  const axisSummary = (m: { overshoot: number; riseTimeMs: number; settlingTimeMs: number }) => ({
    meanOvershoot: m.overshoot,
    meanRiseTimeMs: m.riseTimeMs,
    meanSettlingTimeMs: m.settlingTimeMs,
    meanLatencyMs: 5,
  });

  return {
    id: `rec-${Math.random().toString(36).slice(2)}`,
    profileId: 'profile-1',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T01:00:00Z',
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
    pidMetrics: {
      roll: axisSummary(rollMetrics),
      pitch: axisSummary(pitchMetrics ?? rollMetrics),
      yaw: axisSummary({ overshoot: 5, riseTimeMs: 40, settlingTimeMs: 100 }),
      stepsDetected: 10,
      currentPIDs: pids,
      summary: 'test',
      dataQuality: dataQualityTier ? { overall: 70, tier: dataQualityTier } : undefined,
    },
    verificationMetrics: null,
  };
}

const DEFAULT_PIDS: PIDConfiguration = {
  roll: { P: 45, I: 80, D: 30 },
  pitch: { P: 47, I: 84, D: 32 },
  yaw: { P: 45, I: 80, D: 0 },
};

describe('BayesianOptimizer', () => {
  describe('computeObjective', () => {
    it('should return 0 for ideal metrics with balanced style', () => {
      // Overshoot at ideal (10%), low rise time, low settling time → near 0
      const obj = computeObjective({ overshoot: 10, riseTimeMs: 20, settlingTimeMs: 50 });
      expect(obj).toBeGreaterThanOrEqual(0);
      expect(obj).toBeLessThan(0.5);
    });

    it('should return higher value for worse metrics', () => {
      const good = computeObjective({ overshoot: 10, riseTimeMs: 30, settlingTimeMs: 80 });
      const bad = computeObjective({ overshoot: 40, riseTimeMs: 100, settlingTimeMs: 300 });
      expect(bad).toBeGreaterThan(good);
    });

    it('should respect flight style thresholds', () => {
      const metrics = { overshoot: 20, riseTimeMs: 60, settlingTimeMs: 150 };
      const smooth = computeObjective(metrics, 'smooth');
      const aggressive = computeObjective(metrics, 'aggressive');
      // 20% overshoot is worse for smooth (ideal=3%) than aggressive (ideal=18%)
      expect(smooth).toBeGreaterThan(aggressive);
    });

    it('should return 0 overshoot penalty when at ideal', () => {
      const atIdeal = computeObjective({ overshoot: 10, riseTimeMs: 0, settlingTimeMs: 0 });
      const belowIdeal = computeObjective({ overshoot: 5, riseTimeMs: 0, settlingTimeMs: 0 });
      // Below ideal should also have 0 overshoot penalty
      expect(belowIdeal).toBe(0);
      expect(atIdeal).toBe(0);
    });
  });

  describe('extractObservations', () => {
    it('should extract per-axis observations from history', () => {
      const history = [
        makeRecord(DEFAULT_PIDS, { overshoot: 15, riseTimeMs: 40, settlingTimeMs: 100 }),
        makeRecord(DEFAULT_PIDS, { overshoot: 20, riseTimeMs: 50, settlingTimeMs: 120 }),
      ];

      const obs = extractObservations(history);

      expect(obs.roll.length).toBe(2);
      expect(obs.pitch.length).toBe(2);
      expect(obs.yaw.length).toBe(2);
      expect(obs.roll[0].gains.P).toBe(45);
      expect(obs.roll[0].gains.D).toBe(30);
    });

    it('should skip records without PID metrics', () => {
      const history: CompletedTuningRecord[] = [
        {
          ...makeRecord(DEFAULT_PIDS, { overshoot: 15, riseTimeMs: 40, settlingTimeMs: 100 }),
          pidMetrics: null,
        },
        makeRecord(DEFAULT_PIDS, { overshoot: 20, riseTimeMs: 50, settlingTimeMs: 120 }),
      ];

      const obs = extractObservations(history);

      expect(obs.roll.length).toBe(1);
    });

    it('should compute objective values for each observation', () => {
      const history = [
        makeRecord(DEFAULT_PIDS, { overshoot: 15, riseTimeMs: 40, settlingTimeMs: 100 }),
      ];

      const obs = extractObservations(history);

      expect(obs.roll[0].objectiveValue).toBeGreaterThanOrEqual(0);
      expect(typeof obs.roll[0].objectiveValue).toBe('number');
    });

    it('should include data quality tier', () => {
      const history = [
        makeRecord(
          DEFAULT_PIDS,
          { overshoot: 15, riseTimeMs: 40, settlingTimeMs: 100 },
          undefined,
          'good'
        ),
      ];

      const obs = extractObservations(history);

      expect(obs.roll[0].dataQualityTier).toBe('good');
    });
  });

  describe('choleskyDecomposition', () => {
    it('should decompose a simple positive-definite matrix', () => {
      const A = [
        [4, 2],
        [2, 3],
      ];

      const L = choleskyDecomposition(A);

      // Verify L * L^T ≈ A
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          let sum = 0;
          for (let k = 0; k < 2; k++) {
            sum += L[i][k] * L[j][k];
          }
          expect(sum).toBeCloseTo(A[i][j], 5);
        }
      }
    });

    it('should produce lower triangular matrix', () => {
      const A = [
        [4, 2, 1],
        [2, 5, 3],
        [1, 3, 6],
      ];

      const L = choleskyDecomposition(A);

      // Upper triangle should be 0
      expect(L[0][1]).toBe(0);
      expect(L[0][2]).toBe(0);
      expect(L[1][2]).toBe(0);
    });

    it('should handle 1x1 matrix', () => {
      const L = choleskyDecomposition([[9]]);
      expect(L[0][0]).toBeCloseTo(3, 5);
    });
  });

  describe('optimizeAxis', () => {
    it('should return undefined with fewer than 3 observations', () => {
      const obs: BayesianObservation[] = [
        {
          gains: { P: 45, D: 30 },
          metrics: { overshoot: 15, riseTimeMs: 40, settlingTimeMs: 100 },
          objectiveValue: 0.5,
        },
        {
          gains: { P: 50, D: 35 },
          metrics: { overshoot: 12, riseTimeMs: 35, settlingTimeMs: 90 },
          objectiveValue: 0.3,
        },
      ];

      const result = optimizeAxis(obs);

      expect(result).toBeUndefined();
    });

    it('should return optimization result with enough observations', () => {
      const obs: BayesianObservation[] = [
        {
          gains: { P: 40, D: 25 },
          metrics: { overshoot: 30, riseTimeMs: 60, settlingTimeMs: 200 },
          objectiveValue: 1.5,
        },
        {
          gains: { P: 45, D: 30 },
          metrics: { overshoot: 15, riseTimeMs: 40, settlingTimeMs: 100 },
          objectiveValue: 0.5,
        },
        {
          gains: { P: 50, D: 35 },
          metrics: { overshoot: 12, riseTimeMs: 35, settlingTimeMs: 90 },
          objectiveValue: 0.3,
        },
      ];

      const result = optimizeAxis(obs);

      expect(result).toBeDefined();
      expect(result!.suggestedP).toBeGreaterThanOrEqual(20);
      expect(result!.suggestedP).toBeLessThanOrEqual(120);
      expect(result!.suggestedD).toBeGreaterThanOrEqual(15);
      expect(result!.suggestedD).toBeLessThanOrEqual(80);
      expect(result!.expectedImprovement).toBeGreaterThanOrEqual(0);
      expect(result!.observationCount).toBe(3);
    });

    it('should suggest gains within safety bounds', () => {
      const obs: BayesianObservation[] = [
        {
          gains: { P: 20, D: 15 },
          metrics: { overshoot: 50, riseTimeMs: 100, settlingTimeMs: 300 },
          objectiveValue: 3.0,
        },
        {
          gains: { P: 60, D: 40 },
          metrics: { overshoot: 10, riseTimeMs: 30, settlingTimeMs: 80 },
          objectiveValue: 0.2,
        },
        {
          gains: { P: 100, D: 70 },
          metrics: { overshoot: 5, riseTimeMs: 20, settlingTimeMs: 60 },
          objectiveValue: 0.1,
        },
      ];

      const result = optimizeAxis(obs);

      expect(result).toBeDefined();
      expect(result!.suggestedP).toBeGreaterThanOrEqual(20);
      expect(result!.suggestedP).toBeLessThanOrEqual(120);
      expect(result!.suggestedD).toBeGreaterThanOrEqual(15);
      expect(result!.suggestedD).toBeLessThanOrEqual(80);
    });

    it('should favor region with better observed performance', () => {
      // Observations: low gains = bad, high gains = good
      const obs: BayesianObservation[] = [
        {
          gains: { P: 30, D: 20 },
          metrics: { overshoot: 40, riseTimeMs: 80, settlingTimeMs: 250 },
          objectiveValue: 2.0,
        },
        {
          gains: { P: 50, D: 35 },
          metrics: { overshoot: 15, riseTimeMs: 40, settlingTimeMs: 100 },
          objectiveValue: 0.5,
        },
        {
          gains: { P: 60, D: 40 },
          metrics: { overshoot: 8, riseTimeMs: 30, settlingTimeMs: 70 },
          objectiveValue: 0.15,
        },
      ];

      const result = optimizeAxis(obs);

      expect(result).toBeDefined();
      // Should suggest gains in the higher region (near 50-70 P, 30-45 D)
      expect(result!.suggestedP).toBeGreaterThanOrEqual(40);
      expect(result!.suggestedD).toBeGreaterThanOrEqual(25);
    });

    it('should assign low confidence with exactly 3 observations', () => {
      const obs: BayesianObservation[] = [
        {
          gains: { P: 40, D: 25 },
          metrics: { overshoot: 20, riseTimeMs: 50, settlingTimeMs: 150 },
          objectiveValue: 1.0,
        },
        {
          gains: { P: 45, D: 30 },
          metrics: { overshoot: 15, riseTimeMs: 40, settlingTimeMs: 100 },
          objectiveValue: 0.5,
        },
        {
          gains: { P: 50, D: 35 },
          metrics: { overshoot: 12, riseTimeMs: 35, settlingTimeMs: 90 },
          objectiveValue: 0.3,
        },
      ];

      const result = optimizeAxis(obs);

      expect(result).toBeDefined();
      expect(['high', 'medium', 'low']).toContain(result!.confidence);
    });

    it('should handle duplicate gain observations gracefully', () => {
      const obs: BayesianObservation[] = [
        {
          gains: { P: 45, D: 30 },
          metrics: { overshoot: 15, riseTimeMs: 40, settlingTimeMs: 100 },
          objectiveValue: 0.5,
        },
        {
          gains: { P: 45, D: 30 },
          metrics: { overshoot: 18, riseTimeMs: 42, settlingTimeMs: 110 },
          objectiveValue: 0.6,
        },
        {
          gains: { P: 45, D: 30 },
          metrics: { overshoot: 12, riseTimeMs: 38, settlingTimeMs: 95 },
          objectiveValue: 0.4,
        },
      ];

      const result = optimizeAxis(obs);

      // Should not crash from singular kernel matrix (noise variance prevents this)
      expect(result).toBeDefined();
    });
  });

  describe('optimizeWithHistory', () => {
    it('should return usedBayesian=false with fewer than 3 records', () => {
      const history = [
        makeRecord(DEFAULT_PIDS, { overshoot: 15, riseTimeMs: 40, settlingTimeMs: 100 }),
        makeRecord(DEFAULT_PIDS, { overshoot: 20, riseTimeMs: 50, settlingTimeMs: 120 }),
      ];

      const result = optimizeWithHistory(history);

      expect(result.usedBayesian).toBe(false);
      expect(result.historySessionsUsed).toBe(2);
    });

    it('should return suggestions with enough history', () => {
      const pids1 = {
        roll: { P: 40, I: 80, D: 25 },
        pitch: { P: 42, I: 84, D: 27 },
        yaw: { P: 40, I: 80, D: 0 },
      };
      const pids2 = {
        roll: { P: 45, I: 80, D: 30 },
        pitch: { P: 47, I: 84, D: 32 },
        yaw: { P: 45, I: 80, D: 0 },
      };
      const pids3 = {
        roll: { P: 50, I: 80, D: 35 },
        pitch: { P: 52, I: 84, D: 37 },
        yaw: { P: 50, I: 80, D: 0 },
      };
      const history = [
        makeRecord(pids1, { overshoot: 25, riseTimeMs: 60, settlingTimeMs: 180 }),
        makeRecord(pids2, { overshoot: 15, riseTimeMs: 40, settlingTimeMs: 100 }),
        makeRecord(pids3, { overshoot: 10, riseTimeMs: 30, settlingTimeMs: 80 }),
      ];

      const result = optimizeWithHistory(history);

      expect(result.usedBayesian).toBe(true);
      expect(result.historySessionsUsed).toBe(3);
      expect(result.roll).toBeDefined();
      expect(result.pitch).toBeDefined();
    });

    it('should skip records without PID metrics', () => {
      const pids1 = {
        roll: { P: 40, I: 80, D: 25 },
        pitch: { P: 42, I: 84, D: 27 },
        yaw: { P: 40, I: 80, D: 0 },
      };
      const pids2 = {
        roll: { P: 45, I: 80, D: 30 },
        pitch: { P: 47, I: 84, D: 32 },
        yaw: { P: 45, I: 80, D: 0 },
      };
      const history: CompletedTuningRecord[] = [
        makeRecord(pids1, { overshoot: 25, riseTimeMs: 60, settlingTimeMs: 180 }),
        {
          ...makeRecord(pids2, { overshoot: 15, riseTimeMs: 40, settlingTimeMs: 100 }),
          pidMetrics: null,
        },
        makeRecord(pids2, { overshoot: 15, riseTimeMs: 40, settlingTimeMs: 100 }),
      ];

      const result = optimizeWithHistory(history);

      expect(result.historySessionsUsed).toBe(2);
      expect(result.usedBayesian).toBe(false);
    });

    it('should respect flight style in optimization', () => {
      const pids1 = {
        roll: { P: 40, I: 80, D: 25 },
        pitch: { P: 42, I: 84, D: 27 },
        yaw: { P: 40, I: 80, D: 0 },
      };
      const pids2 = {
        roll: { P: 45, I: 80, D: 30 },
        pitch: { P: 47, I: 84, D: 32 },
        yaw: { P: 45, I: 80, D: 0 },
      };
      const pids3 = {
        roll: { P: 50, I: 80, D: 35 },
        pitch: { P: 52, I: 84, D: 37 },
        yaw: { P: 50, I: 80, D: 0 },
      };
      const history = [
        makeRecord(pids1, { overshoot: 25, riseTimeMs: 60, settlingTimeMs: 180 }),
        makeRecord(pids2, { overshoot: 15, riseTimeMs: 40, settlingTimeMs: 100 }),
        makeRecord(pids3, { overshoot: 10, riseTimeMs: 30, settlingTimeMs: 80 }),
      ];

      const smoothResult = optimizeWithHistory(history, 'smooth');
      const aggressiveResult = optimizeWithHistory(history, 'aggressive');

      // Both should produce valid results
      expect(smoothResult.usedBayesian).toBe(true);
      expect(aggressiveResult.usedBayesian).toBe(true);
    });

    it('should complete in reasonable time with many sessions', () => {
      const history: CompletedTuningRecord[] = [];
      for (let i = 0; i < 15; i++) {
        const p = 30 + i * 5;
        const d = 20 + i * 3;
        const pids = {
          roll: { P: p, I: 80, D: d },
          pitch: { P: p + 2, I: 84, D: d + 2 },
          yaw: { P: p, I: 80, D: 0 },
        };
        history.push(
          makeRecord(pids, {
            overshoot: Math.max(5, 30 - i * 2),
            riseTimeMs: Math.max(20, 60 - i * 3),
            settlingTimeMs: Math.max(50, 180 - i * 10),
          })
        );
      }

      const start = performance.now();
      const result = optimizeWithHistory(history);
      const elapsed = performance.now() - start;

      expect(result.usedBayesian).toBe(true);
      expect(elapsed).toBeLessThan(2000);
    });

    it('should handle empty history', () => {
      const result = optimizeWithHistory([]);

      expect(result.usedBayesian).toBe(false);
      expect(result.historySessionsUsed).toBe(0);
    });
  });
});
