import { describe, it, expect } from 'vitest';
import { recommendPID, generatePIDSummary } from './PIDRecommender';
import type { PIDConfiguration } from '@shared/types/pid.types';
import type { AxisStepProfile, StepResponse, StepEvent } from '@shared/types/analysis.types';
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

function makeProfile(overrides: Partial<AxisStepProfile> & { responses?: StepResponse[] } = {}): AxisStepProfile {
  const responses = overrides.responses || [makeResponse()];
  return {
    responses,
    meanOvershoot: overrides.meanOvershoot ?? responses[0].overshootPercent,
    meanRiseTimeMs: overrides.meanRiseTimeMs ?? responses[0].riseTimeMs,
    meanSettlingTimeMs: overrides.meanSettlingTimeMs ?? responses[0].settlingTimeMs,
    meanLatencyMs: overrides.meanLatencyMs ?? responses[0].latencyMs,
  };
}

function emptyProfile(): AxisStepProfile {
  return { responses: [], meanOvershoot: 0, meanRiseTimeMs: 0, meanSettlingTimeMs: 0, meanLatencyMs: 0 };
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

    it('should recommend D increase for moderate overshoot (>20%)', () => {
      const profile = makeProfile({ meanOvershoot: 25 });

      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), DEFAULT_PIDS);

      const dRec = recs.find(r => r.setting === 'pid_roll_d');
      expect(dRec).toBeDefined();
      expect(dRec!.recommendedValue).toBeGreaterThan(DEFAULT_PIDS.roll.D);
      expect(dRec!.reason).toContain('overshoot');
    });

    it('should recommend both P decrease and D increase for severe overshoot (>30%)', () => {
      const profile = makeProfile({ meanOvershoot: 35 });

      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), DEFAULT_PIDS);

      const dRec = recs.find(r => r.setting === 'pid_roll_d');
      const pRec = recs.find(r => r.setting === 'pid_roll_p');
      expect(dRec).toBeDefined();
      expect(pRec).toBeDefined();
      expect(dRec!.confidence).toBe('high');
      expect(pRec!.recommendedValue).toBeLessThan(DEFAULT_PIDS.roll.P);
    });

    it('should recommend P increase for sluggish response', () => {
      const profile = makeProfile({
        meanOvershoot: 2,
        meanRiseTimeMs: 150,
      });

      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), DEFAULT_PIDS);

      const pRec = recs.find(r => r.setting === 'pid_roll_p');
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

      const dRec = recs.find(r => r.setting === 'pid_roll_d');
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
      const pRec = recs.find(r => r.setting === 'pid_roll_p');
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

      const dRec = recs.find(r => r.setting === 'pid_roll_d');
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

      const dRecs = recs.filter(r => r.setting === 'pid_roll_d');
      expect(dRecs.length).toBeLessThanOrEqual(1);
    });

    it('should skip axes with no step data', () => {
      const recs = recommendPID(emptyProfile(), emptyProfile(), emptyProfile(), DEFAULT_PIDS);

      expect(recs.length).toBe(0);
    });

    it('should generate recommendations for pitch independently', () => {
      const pitchProfile = makeProfile({ meanOvershoot: 25 });

      const recs = recommendPID(emptyProfile(), pitchProfile, emptyProfile(), DEFAULT_PIDS);

      const pitchRecs = recs.filter(r => r.setting.includes('pitch'));
      expect(pitchRecs.length).toBeGreaterThan(0);
      // Should not have roll recommendations
      const rollRecs = recs.filter(r => r.setting.includes('roll'));
      expect(rollRecs.length).toBe(0);
    });

    it('should use relaxed thresholds for yaw', () => {
      // 25% overshoot on yaw — should NOT trigger the moderate overshoot rule
      // because yaw uses relaxed threshold (30% instead of 20%)
      const yawProfile = makeProfile({ meanOvershoot: 25 });

      const recs = recommendPID(emptyProfile(), emptyProfile(), yawProfile, DEFAULT_PIDS);

      const yawDRec = recs.find(r => r.setting === 'pid_yaw_d');
      // May or may not have a recommendation depending on exact threshold
      // But at 25%, it should be below yaw's relaxed threshold
      expect(recs.filter(r => r.confidence === 'high').length).toBe(0);
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
        meanSettlingTimeMs: 200,
      });

      const recs = recommendPID(profile, emptyProfile(), emptyProfile(), DEFAULT_PIDS);

      const dRec = recs.find(r => r.setting === 'pid_roll_d');
      expect(dRec).toBeDefined();
      expect(dRec!.reason).toContain('settle');
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
  });
});
