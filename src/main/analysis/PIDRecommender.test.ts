import { describe, it, expect } from 'vitest';
import {
  recommendPID,
  generatePIDSummary,
  extractFlightPIDs,
  extractFeedforwardContext,
} from './PIDRecommender';
import type { PIDConfiguration } from '@shared/types/pid.types';
import type {
  AxisStepProfile,
  FeedforwardContext,
  StepResponse,
  StepEvent,
} from '@shared/types/analysis.types';
import { P_GAIN_MIN, P_GAIN_MAX, D_GAIN_MIN, D_GAIN_MAX } from './constants';

function makeStep(): StepEvent {
  return { axis: 0, startIndex: 0, endIndex: 1200, magnitude: 300, direction: 'positive' };
}

function makeResponse(overrides: Partial<StepResponse> = {}): StepResponse {
  return {
    step: makeStep(),
    riseTimeMs: 30,
    overshootPercent: 5,
    settlingTimeMs: 80,
    latencyMs: 5,
    ringingCount: 0,
    peakValue: 315,
    steadyStateValue: 300,
    ...overrides,
  };
}

function makeProfile(
  overrides: Partial<AxisStepProfile> & { responses?: StepResponse[] } = {}
): AxisStepProfile {
  const responses = overrides.responses || [makeResponse()];
  return {
    responses,
    meanOvershoot: overrides.meanOvershoot ?? responses[0].overshootPercent,
    meanRiseTimeMs: overrides.meanRiseTimeMs ?? responses[0].riseTimeMs,
    meanSettlingTimeMs: overrides.meanSettlingTimeMs ?? responses[0].settlingTimeMs,
    meanLatencyMs: overrides.meanLatencyMs ?? responses[0].latencyMs,
    meanTrackingErrorRMS: 0,
  };
}

function emptyProfile(): AxisStepProfile {
  return {
    responses: [],
    meanOvershoot: 0,
    meanRiseTimeMs: 0,
    meanSettlingTimeMs: 0,
    meanLatencyMs: 0,
    meanTrackingErrorRMS: 0,
  };
}

const DEFAULT_PIDS: PIDConfiguration = {
  roll: { P: 45, I: 80, D: 30 },
  pitch: { P: 47, I: 84, D: 32 },
  yaw: { P: 45, I: 80, D: 0 },
};

describe('PIDRecommender', () => {
  describe('recommendPID', () => {
    it('should return no recommendations for a good tune', () => {
      const goodProfile = makeProfile({
        meanOvershoot: 5,
        meanRiseTimeMs: 30,
        meanSettlingTimeMs: 50,
      });

      const recs = recommendPID(goodProfile, goodProfile, emptyProfile(), DEFAULT_PIDS);

      expect(recs.length).toBe(0);
    });

    it('should recommend D increase for moderate overshoot (15-25%)', () => {
      const profile = makeProfile({ meanOvershoot: 20 });

      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), DEFAULT_PIDS);

      const dRec = recs.find((r) => r.setting === 'pid_roll_d');
      expect(dRec).toBeDefined();
      expect(dRec!.recommendedValue).toBeGreaterThan(DEFAULT_PIDS.roll.D);
      expect(dRec!.reason).toContain('overshoot');
      expect(dRec!.confidence).toBe('medium');
    });

    it('should recommend only D increase for severe overshoot when D is low', () => {
      const profile = makeProfile({ meanOvershoot: 35 });

      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), DEFAULT_PIDS);

      const dRec = recs.find((r) => r.setting === 'pid_roll_d');
      const pRec = recs.find((r) => r.setting === 'pid_roll_p');
      expect(dRec).toBeDefined();
      expect(dRec!.confidence).toBe('high');
      // D=30 is below 60% of D_GAIN_MAX, so P should NOT be reduced (D-first strategy)
      expect(pRec).toBeUndefined();
    });

    it('should recommend both P decrease and D increase for severe overshoot when D is high', () => {
      const highDPids: PIDConfiguration = {
        roll: { P: 45, I: 80, D: 50 }, // D ≥ 60% of 80 = 48
        pitch: { P: 47, I: 84, D: 32 },
        yaw: { P: 45, I: 80, D: 0 },
      };
      const profile = makeProfile({ meanOvershoot: 35 });

      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), highDPids);

      const dRec = recs.find((r) => r.setting === 'pid_roll_d');
      const pRec = recs.find((r) => r.setting === 'pid_roll_p');
      expect(dRec).toBeDefined();
      expect(pRec).toBeDefined();
      expect(dRec!.confidence).toBe('high');
      expect(pRec!.recommendedValue).toBeLessThan(highDPids.roll.P);
    });

    it('should scale D+10 and reduce P for high overshoot (>2x threshold)', () => {
      // 60% overshoot → severity = 60/25 = 2.4 (>2x)
      const profile = makeProfile({ meanOvershoot: 60 });

      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), DEFAULT_PIDS);

      const dRec = recs.find((r) => r.setting === 'pid_roll_d');
      const pRec = recs.find((r) => r.setting === 'pid_roll_p');
      expect(dRec).toBeDefined();
      expect(dRec!.recommendedValue).toBe(DEFAULT_PIDS.roll.D + 10); // D: 30 + 10 = 40
      expect(pRec).toBeDefined();
      expect(pRec!.recommendedValue).toBe(DEFAULT_PIDS.roll.P - 5); // P: 45 - 5 = 40
    });

    it('should scale D+15 and P-10 for extreme overshoot (>4x threshold)', () => {
      // 145% overshoot → severity = 145/25 = 5.8 (>4x)
      const profile = makeProfile({ meanOvershoot: 145 });

      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), DEFAULT_PIDS);

      const dRec = recs.find((r) => r.setting === 'pid_roll_d');
      const pRec = recs.find((r) => r.setting === 'pid_roll_p');
      expect(dRec).toBeDefined();
      expect(dRec!.recommendedValue).toBe(DEFAULT_PIDS.roll.D + 15); // D: 30 + 15 = 45
      expect(pRec).toBeDefined();
      expect(pRec!.recommendedValue).toBe(DEFAULT_PIDS.roll.P - 10); // P: 45 - 10 = 35
      expect(pRec!.reason).toContain('Extreme');
    });

    it('should clamp D to max even with extreme overshoot', () => {
      const highDPids: PIDConfiguration = {
        roll: { P: 45, I: 80, D: 70 }, // near max
        pitch: { P: 47, I: 84, D: 32 },
        yaw: { P: 45, I: 80, D: 0 },
      };
      const profile = makeProfile({ meanOvershoot: 145 });

      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), highDPids);

      const dRec = recs.find((r) => r.setting === 'pid_roll_d');
      expect(dRec).toBeDefined();
      expect(dRec!.recommendedValue).toBeLessThanOrEqual(D_GAIN_MAX);
    });

    it('should recommend P increase for sluggish response', () => {
      const profile = makeProfile({
        meanOvershoot: 2,
        meanRiseTimeMs: 150,
      });

      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), DEFAULT_PIDS);

      const pRec = recs.find((r) => r.setting === 'pid_roll_p');
      expect(pRec).toBeDefined();
      expect(pRec!.recommendedValue).toBeGreaterThan(DEFAULT_PIDS.roll.P);
      expect(pRec!.reason).toContain('sluggish');
    });

    it('should recommend D increase for excessive ringing', () => {
      const response = makeResponse({ ringingCount: 5 });
      const profile = makeProfile({
        responses: [response],
        meanOvershoot: 10,
      });

      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), DEFAULT_PIDS);

      const dRec = recs.find((r) => r.setting === 'pid_roll_d');
      expect(dRec).toBeDefined();
      expect(dRec!.reason).toContain('scillation');
    });

    it('should respect P gain safety bounds', () => {
      // PIDs already at max
      const maxPIDs: PIDConfiguration = {
        roll: { P: P_GAIN_MAX, I: 80, D: 30 },
        pitch: { P: 47, I: 84, D: 32 },
        yaw: { P: 45, I: 80, D: 0 },
      };

      const sluggish = makeProfile({
        meanOvershoot: 2,
        meanRiseTimeMs: 200,
      });

      const recs = recommendPID(sluggish, emptyProfile(), emptyProfile(), maxPIDs);

      // Should not recommend going above P_GAIN_MAX
      const pRec = recs.find((r) => r.setting === 'pid_roll_p');
      if (pRec) {
        expect(pRec.recommendedValue).toBeLessThanOrEqual(P_GAIN_MAX);
      }
    });

    it('should respect D gain safety bounds', () => {
      const maxPIDs: PIDConfiguration = {
        roll: { P: 45, I: 80, D: D_GAIN_MAX },
        pitch: { P: 47, I: 84, D: 32 },
        yaw: { P: 45, I: 80, D: 0 },
      };

      const profile = makeProfile({ meanOvershoot: 25 });

      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), maxPIDs);

      const dRec = recs.find((r) => r.setting === 'pid_roll_d');
      if (dRec) {
        expect(dRec.recommendedValue).toBeLessThanOrEqual(D_GAIN_MAX);
      }
    });

    it('should not duplicate D recommendations for same axis', () => {
      // Both overshoot and ringing on same axis
      const response = makeResponse({ ringingCount: 5, overshootPercent: 25 });
      const profile = makeProfile({
        responses: [response],
        meanOvershoot: 25,
      });

      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), DEFAULT_PIDS);

      const dRecs = recs.filter((r) => r.setting === 'pid_roll_d');
      expect(dRecs.length).toBeLessThanOrEqual(1);
    });

    it('should skip axes with no step data', () => {
      const recs = recommendPID(emptyProfile(), emptyProfile(), emptyProfile(), DEFAULT_PIDS);

      expect(recs.length).toBe(0);
    });

    it('should generate recommendations for pitch independently', () => {
      const pitchProfile = makeProfile({ meanOvershoot: 25 });

      const recs = recommendPID(emptyProfile(), pitchProfile, emptyProfile(), DEFAULT_PIDS);

      const pitchRecs = recs.filter((r) => r.setting.includes('pitch'));
      expect(pitchRecs.length).toBeGreaterThan(0);
      // Should not have roll recommendations
      const rollRecs = recs.filter((r) => r.setting.includes('roll'));
      expect(rollRecs.length).toBe(0);
    });

    it('should use relaxed thresholds for yaw', () => {
      // 25% overshoot on yaw — should NOT trigger the moderate overshoot rule
      // because yaw uses relaxed moderate threshold (OVERSHOOT_MAX_PERCENT=25 instead of 15)
      const yawProfile = makeProfile({ meanOvershoot: 25 });

      const recs = recommendPID(emptyProfile(), emptyProfile(), yawProfile, DEFAULT_PIDS);

      // At 25%, yaw moderate threshold is 25, so 25 > 25 is false — no overshoot recs
      expect(recs.filter((r) => r.confidence === 'high').length).toBe(0);
      expect(recs.find((r) => r.setting === 'pid_yaw_d')).toBeUndefined();
    });

    it('should include beginner-friendly reason strings', () => {
      const profile = makeProfile({ meanOvershoot: 35 });

      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), DEFAULT_PIDS);

      for (const rec of recs) {
        expect(rec.reason.length).toBeGreaterThan(20);
        // Should be plain English, not technical jargon
        expect(rec.reason).not.toContain('PSD');
        expect(rec.reason).not.toContain('transfer function');
      }
    });

    it('should recommend D increase for slow settling', () => {
      const profile = makeProfile({
        meanOvershoot: 10,
        meanSettlingTimeMs: 250,
      });

      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), DEFAULT_PIDS);

      const dRec = recs.find((r) => r.setting === 'pid_roll_d');
      expect(dRec).toBeDefined();
      expect(dRec!.reason).toContain('settle');
    });

    // --- flightPIDs convergence tests ---

    it('should anchor targets to flightPIDs when provided', () => {
      const flightPIDs: PIDConfiguration = {
        roll: { P: 40, I: 80, D: 25 },
        pitch: { P: 42, I: 84, D: 27 },
        yaw: { P: 40, I: 80, D: 0 },
      };
      // Current PIDs are different (already applied a previous recommendation)
      const currentPIDs: PIDConfiguration = {
        roll: { P: 40, I: 80, D: 30 },
        pitch: { P: 42, I: 84, D: 32 },
        yaw: { P: 40, I: 80, D: 0 },
      };

      const profile = makeProfile({ meanOvershoot: 20 }); // moderate overshoot → D+5

      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), currentPIDs, flightPIDs);

      const dRec = recs.find((r) => r.setting === 'pid_roll_d');
      // Target: flightD + 5 = 25 + 5 = 30, current = 30 → no recommendation (already at target)
      expect(dRec).toBeUndefined();
    });

    it('should converge: applying recommendations as currentPIDs with same flightPIDs yields no recommendations', () => {
      const flightPIDs: PIDConfiguration = {
        roll: { P: 45, I: 80, D: 30 },
        pitch: { P: 47, I: 84, D: 32 },
        yaw: { P: 45, I: 80, D: 0 },
      };

      const overshootProfile = makeProfile({ meanOvershoot: 35 });

      // First run: get recommendations
      const recs1 = recommendPID(
        overshootProfile,
        emptyProfile(),
        emptyProfile(),
        flightPIDs,
        flightPIDs
      );
      expect(recs1.length).toBeGreaterThan(0);

      // Apply recommendations to current PIDs
      const appliedPIDs: PIDConfiguration = JSON.parse(JSON.stringify(flightPIDs));
      for (const rec of recs1) {
        const match = rec.setting.match(/^pid_(roll|pitch|yaw)_(p|i|d)$/i);
        if (match) {
          const axis = match[1] as 'roll' | 'pitch' | 'yaw';
          const term = match[2].toUpperCase() as 'P' | 'I' | 'D';
          appliedPIDs[axis][term] = rec.recommendedValue;
        }
      }

      // Second run: same flight data, same flightPIDs, but applied as current
      const recs2 = recommendPID(
        overshootProfile,
        emptyProfile(),
        emptyProfile(),
        appliedPIDs,
        flightPIDs
      );
      expect(recs2.length).toBe(0);
    });

    it('should still work without flightPIDs (fallback to currentPIDs)', () => {
      const profile = makeProfile({ meanOvershoot: 35 });

      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), DEFAULT_PIDS);

      // Should still produce recommendations when flightPIDs is undefined
      expect(recs.length).toBeGreaterThan(0);
    });

    // --- FF-aware recommendation tests ---

    it('should recommend feedforward_boost reduction for FF-dominated overshoot (>60% FF energy)', () => {
      const ffResponse = makeResponse({ overshootPercent: 30, ffContribution: 0.8 });
      const profile = makeProfile({
        responses: [ffResponse],
        meanOvershoot: 30,
      });
      const ffContext: FeedforwardContext = { active: true, boost: 15 };

      const recs = recommendPID(
        profile,
        emptyProfile(),
        emptyProfile(),
        DEFAULT_PIDS,
        undefined,
        ffContext
      );

      const ffRec = recs.find((r) => r.setting === 'feedforward_boost');
      expect(ffRec).toBeDefined();
      expect(ffRec!.recommendedValue).toBe(10);
      expect(ffRec!.reason).toContain('feedforward');
      expect(ffRec!.reason).toContain('80%');
      // Should NOT have P/D recommendations for this axis
      const dRec = recs.find((r) => r.setting === 'pid_roll_d');
      const pRec = recs.find((r) => r.setting === 'pid_roll_p');
      expect(dRec).toBeUndefined();
      expect(pRec).toBeUndefined();
    });

    it('should not recommend FF changes when overshoot is P-dominated (<30% FF energy)', () => {
      const pResponse = makeResponse({ overshootPercent: 30, ffContribution: 0.1 });
      const profile = makeProfile({
        responses: [pResponse],
        meanOvershoot: 30,
      });
      const ffContext: FeedforwardContext = { active: true, boost: 15 };

      const recs = recommendPID(
        profile,
        emptyProfile(),
        emptyProfile(),
        DEFAULT_PIDS,
        undefined,
        ffContext
      );

      const ffRec = recs.find((r) => r.setting === 'feedforward_boost');
      expect(ffRec).toBeUndefined();
      // Should have normal D recommendation
      const dRec = recs.find((r) => r.setting === 'pid_roll_d');
      expect(dRec).toBeDefined();
    });

    it('should recommend both FF and D for mixed FF/PID overshoot (30-60% FF energy)', () => {
      const mixedResponse = makeResponse({ overshootPercent: 30, ffContribution: 0.45 });
      const profile = makeProfile({
        responses: [mixedResponse],
        meanOvershoot: 30,
      });
      const ffContext: FeedforwardContext = { active: true, boost: 15 };

      const recs = recommendPID(
        profile,
        emptyProfile(),
        emptyProfile(),
        DEFAULT_PIDS,
        undefined,
        ffContext
      );

      // Should have both FF and D recommendations
      const ffRec = recs.find((r) => r.setting === 'feedforward_boost');
      expect(ffRec).toBeDefined();
      expect(ffRec!.recommendedValue).toBe(12); // boost - 3 (smaller reduction for mixed)
      expect(ffRec!.reason).toContain('45%');

      const dRec = recs.find((r) => r.setting === 'pid_roll_d');
      expect(dRec).toBeDefined();
      expect(dRec!.reason).toContain('Mixed');
    });

    // --- FlightStyle-aware tests ---

    it('balanced style: identical behavior to default (regression test)', () => {
      const profile = makeProfile({ meanOvershoot: 20 });

      const recsDefault = recommendPID(profile, emptyProfile(), emptyProfile(), DEFAULT_PIDS);
      const recsBalanced = recommendPID(
        profile,
        emptyProfile(),
        emptyProfile(),
        DEFAULT_PIDS,
        undefined,
        undefined,
        'balanced'
      );

      expect(recsBalanced).toEqual(recsDefault);
    });

    it('smooth style + 10% overshoot: recommends reducing (too high for smooth)', () => {
      // smooth moderateOvershoot = 8, so 10% > 8 → should trigger D increase
      const profile = makeProfile({ meanOvershoot: 10 });

      const recs = recommendPID(
        profile,
        emptyProfile(),
        emptyProfile(),
        DEFAULT_PIDS,
        undefined,
        undefined,
        'smooth'
      );

      const dRec = recs.find((r) => r.setting === 'pid_roll_d');
      expect(dRec).toBeDefined();
      expect(dRec!.reason).toContain('overshoot');
    });

    it('aggressive style + 20% overshoot: no overshoot recommendation (acceptable)', () => {
      // aggressive moderateOvershoot = 25, overshootMax = 35
      // 20% < 25 → no moderate overshoot rule, and < 35 → no severe rule
      const profile = makeProfile({ meanOvershoot: 20 });

      const recs = recommendPID(
        profile,
        emptyProfile(),
        emptyProfile(),
        DEFAULT_PIDS,
        undefined,
        undefined,
        'aggressive'
      );

      const overshootRecs = recs.filter((r) => r.reason.includes('overshoot'));
      expect(overshootRecs.length).toBe(0);
    });

    it('smooth style + 100ms rise time: no sluggish warning (acceptable for smooth)', () => {
      // smooth sluggishRise = 120, overshootIdeal = 3
      // 100ms < 120 → not sluggish for smooth
      const profile = makeProfile({ meanOvershoot: 2, meanRiseTimeMs: 100 });

      const recs = recommendPID(
        profile,
        emptyProfile(),
        emptyProfile(),
        DEFAULT_PIDS,
        undefined,
        undefined,
        'smooth'
      );

      const sluggishRecs = recs.filter((r) => r.reason.includes('sluggish'));
      expect(sluggishRecs.length).toBe(0);
    });

    it('aggressive style + 70ms rise time: sluggish warning (too slow for aggressive)', () => {
      // aggressive sluggishRise = 50, overshootIdeal = 18
      // 70ms > 50 and meanOvershoot < 18 → sluggish
      const profile = makeProfile({ meanOvershoot: 5, meanRiseTimeMs: 70 });

      const recs = recommendPID(
        profile,
        emptyProfile(),
        emptyProfile(),
        DEFAULT_PIDS,
        undefined,
        undefined,
        'aggressive'
      );

      const sluggishRecs = recs.filter((r) => r.reason.includes('sluggish'));
      expect(sluggishRecs.length).toBeGreaterThan(0);
    });

    it('should emit feedforward_boost recommendation only once across axes', () => {
      const ffResponse = makeResponse({ overshootPercent: 30, ffContribution: 0.8 });
      const rollProfile = makeProfile({ responses: [ffResponse], meanOvershoot: 30 });
      const pitchProfile = makeProfile({ responses: [ffResponse], meanOvershoot: 30 });
      const ffContext: FeedforwardContext = { active: true, boost: 15 };

      const recs = recommendPID(
        rollProfile,
        pitchProfile,
        emptyProfile(),
        DEFAULT_PIDS,
        undefined,
        ffContext
      );

      const ffRecs = recs.filter((r) => r.setting === 'feedforward_boost');
      expect(ffRecs.length).toBe(1);
    });
  });

  describe('extractFlightPIDs', () => {
    it('should extract PIDs from valid BBL header', () => {
      const headers = new Map<string, string>();
      headers.set('rollPID', '45,80,30');
      headers.set('pitchPID', '47,84,32');
      headers.set('yawPID', '45,80,0');

      const result = extractFlightPIDs(headers);
      expect(result).toBeDefined();
      expect(result!.roll).toEqual({ P: 45, I: 80, D: 30 });
      expect(result!.pitch).toEqual({ P: 47, I: 84, D: 32 });
      expect(result!.yaw).toEqual({ P: 45, I: 80, D: 0 });
    });

    it('should return undefined when PIDs are missing from header', () => {
      const headers = new Map<string, string>();
      headers.set('rollPID', '45,80,30');
      // Missing pitchPID and yawPID

      expect(extractFlightPIDs(headers)).toBeUndefined();
    });

    it('should return undefined for empty header map', () => {
      expect(extractFlightPIDs(new Map())).toBeUndefined();
    });

    it('should handle malformed PID values gracefully', () => {
      const headers = new Map<string, string>();
      headers.set('rollPID', '45,abc,30');
      headers.set('pitchPID', '47,,32');
      headers.set('yawPID', '45,80');

      const result = extractFlightPIDs(headers);
      expect(result).toBeDefined();
      // NaN from "abc" → 0 fallback
      expect(result!.roll).toEqual({ P: 45, I: 0, D: 30 });
      // Empty string → NaN → 0
      expect(result!.pitch).toEqual({ P: 47, I: 0, D: 32 });
      // Missing D → undefined → 0
      expect(result!.yaw).toEqual({ P: 45, I: 80, D: 0 });
    });
  });

  describe('extractFeedforwardContext', () => {
    it('should detect FF active when boost > 0', () => {
      const headers = new Map<string, string>();
      headers.set('feedforward_boost', '15');
      headers.set('feedforward_max_rate_limit', '100');

      const ctx = extractFeedforwardContext(headers);
      expect(ctx.active).toBe(true);
      expect(ctx.boost).toBe(15);
      expect(ctx.maxRateLimit).toBe(100);
    });

    it('should detect FF inactive when boost is 0', () => {
      const headers = new Map<string, string>();
      headers.set('feedforward_boost', '0');

      const ctx = extractFeedforwardContext(headers);
      expect(ctx.active).toBe(false);
      expect(ctx.boost).toBe(0);
    });

    it('should detect FF inactive when headers are missing', () => {
      const ctx = extractFeedforwardContext(new Map());
      expect(ctx.active).toBe(false);
      expect(ctx.boost).toBeUndefined();
      expect(ctx.maxRateLimit).toBeUndefined();
    });

    it('should handle non-numeric header values gracefully', () => {
      const headers = new Map<string, string>();
      headers.set('feedforward_boost', 'abc');

      const ctx = extractFeedforwardContext(headers);
      expect(ctx.active).toBe(false);
      expect(ctx.boost).toBeUndefined();
    });
  });

  describe('generatePIDSummary', () => {
    it('should report no steps detected', () => {
      const summary = generatePIDSummary(emptyProfile(), emptyProfile(), emptyProfile(), []);

      expect(summary).toContain('No step inputs');
    });

    it('should report good tune when no recommendations', () => {
      const good = makeProfile({ meanOvershoot: 5, meanRiseTimeMs: 30 });
      const summary = generatePIDSummary(good, good, emptyProfile(), []);

      expect(summary).toContain('looks good');
    });

    it('should mention overshoot when present in recommendations', () => {
      const profile = makeProfile({ meanOvershoot: 35 });
      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), DEFAULT_PIDS);
      const summary = generatePIDSummary(profile, emptyProfile(), emptyProfile(), recs);

      expect(summary).toContain('overshoot');
    });

    it('should include step count in summary', () => {
      const profile = makeProfile();
      const summary = generatePIDSummary(profile, profile, emptyProfile(), []);

      expect(summary).toContain('2'); // 2 total steps (1 roll + 1 pitch)
    });

    it('should include style context for smooth', () => {
      const good = makeProfile({ meanOvershoot: 2, meanRiseTimeMs: 30 });
      const summary = generatePIDSummary(good, good, emptyProfile(), [], 'smooth');
      expect(summary).toContain('smooth flying');
    });

    it('should include style context for aggressive', () => {
      const good = makeProfile({ meanOvershoot: 15, meanRiseTimeMs: 20 });
      const summary = generatePIDSummary(good, good, emptyProfile(), [], 'aggressive');
      expect(summary).toContain('racing');
    });

    it('should not include style context for balanced (default)', () => {
      const good = makeProfile({ meanOvershoot: 5, meanRiseTimeMs: 30 });
      const summary = generatePIDSummary(good, good, emptyProfile(), [], 'balanced');
      expect(summary).not.toContain('smooth');
      expect(summary).not.toContain('racing');
    });
  });
});
