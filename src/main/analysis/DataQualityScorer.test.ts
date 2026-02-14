import { describe, it, expect } from 'vitest';
import {
  scoreFilterDataQuality,
  scorePIDDataQuality,
  adjustFilterConfidenceByQuality,
  adjustPIDConfidenceByQuality,
} from './DataQualityScorer';
import type {
  FlightSegment,
  StepResponse,
  StepEvent,
  FilterRecommendation,
  PIDRecommendation,
} from '@shared/types/analysis.types';

function makeSegment(duration: number, throttle: number): FlightSegment {
  return { startIndex: 0, endIndex: 1000, durationSeconds: duration, averageThrottle: throttle };
}

function makeStepEvent(axis: 0 | 1 | 2, magnitude: number): StepEvent {
  return { axis, startIndex: 0, endIndex: 100, magnitude, direction: 'positive' };
}

function makeStepResponse(axis: 0 | 1 | 2, magnitude: number, settling = 50): StepResponse {
  return {
    step: makeStepEvent(axis, magnitude),
    riseTimeMs: 20,
    overshootPercent: 5,
    settlingTimeMs: settling,
    latencyMs: 8,
    ringingCount: 0,
    peakValue: magnitude * 1.05,
    steadyStateValue: magnitude,
  };
}

describe('DataQualityScorer', () => {
  describe('scoreFilterDataQuality', () => {
    it('scores excellent for ideal data (3+ segments, 5s+ hover, sweep, wide throttle)', () => {
      const result = scoreFilterDataQuality({
        segments: [makeSegment(2, 30), makeSegment(2, 50), makeSegment(2, 70)],
        hasSweepSegments: true,
        flightDurationS: 30,
      });

      expect(result.score.overall).toBeGreaterThanOrEqual(80);
      expect(result.score.tier).toBe('excellent');
      expect(result.score.subScores).toHaveLength(4);
      expect(result.warnings).toHaveLength(0);
    });

    it('scores poor for zero segments', () => {
      const result = scoreFilterDataQuality({
        segments: [],
        hasSweepSegments: false,
        flightDurationS: 5,
      });

      expect(result.score.overall).toBeLessThanOrEqual(39);
      expect(result.score.tier).toBe('poor');
      expect(result.warnings.some((w) => w.code === 'few_segments')).toBe(true);
      expect(result.warnings.some((w) => w.code === 'short_hover_time')).toBe(true);
    });

    it('warns about few segments when count < 2', () => {
      const result = scoreFilterDataQuality({
        segments: [makeSegment(3, 50)],
        hasSweepSegments: false,
        flightDurationS: 10,
      });

      expect(result.warnings.some((w) => w.code === 'few_segments')).toBe(true);
    });

    it('does not warn about segments when count >= 2', () => {
      const result = scoreFilterDataQuality({
        segments: [makeSegment(3, 40), makeSegment(3, 60)],
        hasSweepSegments: false,
        flightDurationS: 10,
      });

      expect(result.warnings.some((w) => w.code === 'few_segments')).toBe(false);
    });

    it('warns about short hover time when total < 2s', () => {
      const result = scoreFilterDataQuality({
        segments: [makeSegment(0.5, 50), makeSegment(0.5, 60)],
        hasSweepSegments: false,
        flightDurationS: 10,
      });

      expect(result.warnings.some((w) => w.code === 'short_hover_time')).toBe(true);
    });

    it('does not warn about hover time when total >= 2s', () => {
      const result = scoreFilterDataQuality({
        segments: [makeSegment(2, 50), makeSegment(2, 60)],
        hasSweepSegments: false,
        flightDurationS: 10,
      });

      expect(result.warnings.some((w) => w.code === 'short_hover_time')).toBe(false);
    });

    it('warns about narrow throttle coverage when range < 20%', () => {
      const result = scoreFilterDataQuality({
        segments: [makeSegment(3, 50), makeSegment(3, 55), makeSegment(3, 52)],
        hasSweepSegments: false,
        flightDurationS: 30,
      });

      expect(result.warnings.some((w) => w.code === 'narrow_throttle_coverage')).toBe(true);
    });

    it('does not warn about throttle when range >= 20%', () => {
      const result = scoreFilterDataQuality({
        segments: [makeSegment(3, 30), makeSegment(3, 60)],
        hasSweepSegments: false,
        flightDurationS: 30,
      });

      expect(result.warnings.some((w) => w.code === 'narrow_throttle_coverage')).toBe(false);
    });

    it('gives higher score to sweep segments vs fallback', () => {
      const base = {
        segments: [makeSegment(3, 40), makeSegment(3, 60)],
        flightDurationS: 30,
      };

      const withSweep = scoreFilterDataQuality({ ...base, hasSweepSegments: true });
      const withoutSweep = scoreFilterDataQuality({ ...base, hasSweepSegments: false });

      expect(withSweep.score.overall).toBeGreaterThan(withoutSweep.score.overall);
    });

    it('returns score between 0 and 100', () => {
      const result = scoreFilterDataQuality({
        segments: [makeSegment(1, 50)],
        hasSweepSegments: false,
        flightDurationS: 5,
      });

      expect(result.score.overall).toBeGreaterThanOrEqual(0);
      expect(result.score.overall).toBeLessThanOrEqual(100);
    });
  });

  describe('scorePIDDataQuality', () => {
    it('scores excellent for ideal data (15+ steps, 3 axes, varied magnitudes)', () => {
      const roll = Array.from({ length: 6 }, (_, i) => makeStepResponse(0, 200 + i * 50));
      const pitch = Array.from({ length: 6 }, (_, i) => makeStepResponse(1, 200 + i * 50));
      const yaw = Array.from({ length: 5 }, (_, i) => makeStepResponse(2, 200 + i * 50));

      const result = scorePIDDataQuality({
        totalSteps: 17,
        axisResponses: { roll, pitch, yaw },
      });

      expect(result.score.overall).toBeGreaterThanOrEqual(80);
      expect(result.score.tier).toBe('excellent');
      expect(result.warnings).toHaveLength(0);
    });

    it('scores poor for zero steps', () => {
      const result = scorePIDDataQuality({
        totalSteps: 0,
        axisResponses: { roll: [], pitch: [], yaw: [] },
      });

      expect(result.score.overall).toBeLessThanOrEqual(39);
      expect(result.score.tier).toBe('poor');
      expect(result.warnings.some((w) => w.code === 'few_steps')).toBe(true);
      expect(result.warnings.some((w) => w.code === 'missing_axis_coverage')).toBe(true);
    });

    it('warns about few steps when count < 5', () => {
      const roll = [makeStepResponse(0, 300), makeStepResponse(0, 300)];
      const result = scorePIDDataQuality({
        totalSteps: 2,
        axisResponses: { roll, pitch: [], yaw: [] },
      });

      expect(result.warnings.some((w) => w.code === 'few_steps')).toBe(true);
    });

    it('does not warn about few steps when count >= 5', () => {
      const responses = Array.from({ length: 5 }, () => makeStepResponse(0, 300));
      const result = scorePIDDataQuality({
        totalSteps: 5,
        axisResponses: { roll: responses, pitch: [], yaw: [] },
      });

      expect(result.warnings.some((w) => w.code === 'few_steps')).toBe(false);
    });

    it('warns about missing axis coverage', () => {
      const roll = Array.from({ length: 10 }, () => makeStepResponse(0, 300));
      const result = scorePIDDataQuality({
        totalSteps: 10,
        axisResponses: { roll, pitch: [], yaw: [] },
      });

      expect(result.warnings.filter((w) => w.code === 'missing_axis_coverage')).toHaveLength(2);
      expect(result.warnings.some((w) => w.message.includes('Pitch'))).toBe(true);
      expect(result.warnings.some((w) => w.message.includes('Yaw'))).toBe(true);
    });

    it('warns about few steps per axis when < 3', () => {
      const roll = [makeStepResponse(0, 300), makeStepResponse(0, 300)];
      const pitch = Array.from({ length: 5 }, () => makeStepResponse(1, 300));
      const yaw = Array.from({ length: 5 }, () => makeStepResponse(2, 300));
      const result = scorePIDDataQuality({
        totalSteps: 12,
        axisResponses: { roll, pitch, yaw },
      });

      expect(
        result.warnings.some((w) => w.code === 'few_steps_per_axis' && w.message.includes('Roll'))
      ).toBe(true);
    });

    it('warns about low step magnitude when mean < 200 deg/s', () => {
      const responses = Array.from({ length: 10 }, () => makeStepResponse(0, 100));
      const result = scorePIDDataQuality({
        totalSteps: 10,
        axisResponses: { roll: responses, pitch: [], yaw: [] },
      });

      expect(result.warnings.some((w) => w.code === 'low_step_magnitude')).toBe(true);
    });

    it('does not warn about magnitude when mean >= 200 deg/s', () => {
      const roll = Array.from({ length: 5 }, () => makeStepResponse(0, 300));
      const pitch = Array.from({ length: 5 }, () => makeStepResponse(1, 300));
      const yaw = Array.from({ length: 5 }, () => makeStepResponse(2, 300));
      const result = scorePIDDataQuality({
        totalSteps: 15,
        axisResponses: { roll, pitch, yaw },
      });

      expect(result.warnings.some((w) => w.code === 'low_step_magnitude')).toBe(false);
    });

    it('returns score between 0 and 100', () => {
      const result = scorePIDDataQuality({
        totalSteps: 3,
        axisResponses: {
          roll: [makeStepResponse(0, 300)],
          pitch: [makeStepResponse(1, 300)],
          yaw: [makeStepResponse(2, 300)],
        },
      });

      expect(result.score.overall).toBeGreaterThanOrEqual(0);
      expect(result.score.overall).toBeLessThanOrEqual(100);
    });
  });

  describe('adjustFilterConfidenceByQuality', () => {
    const recs: FilterRecommendation[] = [
      {
        setting: 'gyro_lpf1_static_hz',
        currentValue: 250,
        recommendedValue: 300,
        reason: 'test',
        impact: 'noise',
        confidence: 'high',
      },
      {
        setting: 'gyro_lpf2_static_hz',
        currentValue: 500,
        recommendedValue: 450,
        reason: 'test',
        impact: 'noise',
        confidence: 'medium',
      },
      {
        setting: 'dterm_lpf1_static_hz',
        currentValue: 150,
        recommendedValue: 180,
        reason: 'test',
        impact: 'latency',
        confidence: 'low',
      },
    ];

    it('does not modify confidence for excellent tier', () => {
      const adjusted = adjustFilterConfidenceByQuality(recs, 'excellent');
      expect(adjusted[0].confidence).toBe('high');
      expect(adjusted[1].confidence).toBe('medium');
      expect(adjusted[2].confidence).toBe('low');
    });

    it('does not modify confidence for good tier', () => {
      const adjusted = adjustFilterConfidenceByQuality(recs, 'good');
      expect(adjusted[0].confidence).toBe('high');
      expect(adjusted[1].confidence).toBe('medium');
    });

    it('downgrades high→medium for fair tier', () => {
      const adjusted = adjustFilterConfidenceByQuality(recs, 'fair');
      expect(adjusted[0].confidence).toBe('medium');
      expect(adjusted[1].confidence).toBe('medium');
      expect(adjusted[2].confidence).toBe('low');
    });

    it('downgrades high→medium and medium→low for poor tier', () => {
      const adjusted = adjustFilterConfidenceByQuality(recs, 'poor');
      expect(adjusted[0].confidence).toBe('medium');
      expect(adjusted[1].confidence).toBe('low');
      expect(adjusted[2].confidence).toBe('low');
    });
  });

  describe('adjustPIDConfidenceByQuality', () => {
    const recs: PIDRecommendation[] = [
      {
        setting: 'pid_roll_p',
        currentValue: 45,
        recommendedValue: 50,
        reason: 'test',
        impact: 'response',
        confidence: 'high',
      },
      {
        setting: 'pid_roll_d',
        currentValue: 30,
        recommendedValue: 35,
        reason: 'test',
        impact: 'stability',
        confidence: 'medium',
      },
    ];

    it('does not modify confidence for excellent tier', () => {
      const adjusted = adjustPIDConfidenceByQuality(recs, 'excellent');
      expect(adjusted[0].confidence).toBe('high');
      expect(adjusted[1].confidence).toBe('medium');
    });

    it('downgrades high→medium for fair tier', () => {
      const adjusted = adjustPIDConfidenceByQuality(recs, 'fair');
      expect(adjusted[0].confidence).toBe('medium');
      expect(adjusted[1].confidence).toBe('medium');
    });

    it('downgrades high→medium and medium→low for poor tier', () => {
      const adjusted = adjustPIDConfidenceByQuality(recs, 'poor');
      expect(adjusted[0].confidence).toBe('medium');
      expect(adjusted[1].confidence).toBe('low');
    });
  });
});
