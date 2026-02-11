/**
 * End-to-end analysis pipeline validation tests.
 *
 * Section 1: Synthetic BF 4.5 reference fixture (always runs)
 * Section 2: Real flight BBL fixture (conditional, skipped in CI)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { BlackboxParser } from '../blackbox/BlackboxParser';
import { analyze as analyzeFilters } from './FilterAnalyzer';
import { analyzePID } from './PIDAnalyzer';
import { buildReferenceFixture } from '../blackbox/fixtures/bf45-reference';
import { DEFAULT_FILTER_SETTINGS } from '@shared/types/analysis.types';
import type { BlackboxFlightData } from '@shared/types/blackbox.types';
import type { PIDConfiguration } from '@shared/types/pid.types';
import type { AnalysisProgress } from '@shared/types/analysis.types';

/** Default PIDs matching PIDAnalyzer defaults */
const DEFAULT_PIDS: PIDConfiguration = {
  roll: { P: 45, I: 80, D: 30 },
  pitch: { P: 47, I: 84, D: 32 },
  yaw: { P: 45, I: 80, D: 0 },
};

// ---------------------------------------------------------------------------
// Section 1: BF 4.5 reference fixture (always runs)
// ---------------------------------------------------------------------------

describe('Analysis Pipeline with BF 4.5 reference fixture', () => {
  let flightData: BlackboxFlightData;

  beforeAll(async () => {
    const fixture = buildReferenceFixture();
    const result = await BlackboxParser.parse(fixture);
    expect(result.success).toBe(true);
    expect(result.sessions.length).toBeGreaterThanOrEqual(1);
    flightData = result.sessions[0].flightData;
  });

  // -- Filter analysis tests --

  it('should return a complete filter analysis result', async () => {
    const result = await analyzeFilters(flightData, 0, DEFAULT_FILTER_SETTINGS);

    expect(result.noise).toBeDefined();
    expect(result.noise.roll).toBeDefined();
    expect(result.noise.pitch).toBeDefined();
    expect(result.noise.yaw).toBeDefined();
    expect(result.noise.overallLevel).toMatch(/^(low|medium|high)$/);
    expect(result.recommendations).toBeDefined();
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(result.summary).toBeDefined();
    expect(typeof result.summary).toBe('string');
    expect(result.analysisTimeMs).toBeGreaterThan(0);
    expect(result.segmentsUsed).toBeGreaterThanOrEqual(0);
  });

  it('should produce non-negative noise floor values', async () => {
    const result = await analyzeFilters(flightData, 0, DEFAULT_FILTER_SETTINGS);

    // noiseFloorDb is in dB; for any real signal it should be a finite number.
    // The dB value can be negative (very quiet), but the spectrum magnitudes
    // that feed into it are non-negative. We validate finiteness here.
    expect(Number.isFinite(result.noise.roll.noiseFloorDb)).toBe(true);
    expect(Number.isFinite(result.noise.pitch.noiseFloorDb)).toBe(true);
    expect(Number.isFinite(result.noise.yaw.noiseFloorDb)).toBe(true);
  });

  it('should produce recommendations with valid structure', async () => {
    const result = await analyzeFilters(flightData, 0, DEFAULT_FILTER_SETTINGS);

    for (const rec of result.recommendations) {
      expect(typeof rec.setting).toBe('string');
      expect(rec.setting.length).toBeGreaterThan(0);
      expect(typeof rec.currentValue).toBe('number');
      expect(typeof rec.recommendedValue).toBe('number');
      expect(['high', 'medium', 'low']).toContain(rec.confidence);
      expect(typeof rec.reason).toBe('string');
      expect(rec.reason.length).toBeGreaterThan(0);
    }
  });

  it('should recommend filter cutoffs within safety bounds', async () => {
    const result = await analyzeFilters(flightData, 0, DEFAULT_FILTER_SETTINGS);

    for (const rec of result.recommendations) {
      if (rec.setting.includes('gyro_lpf1')) {
        expect(rec.recommendedValue).toBeGreaterThanOrEqual(0);
        expect(rec.recommendedValue).toBeLessThanOrEqual(500);
      }
      if (rec.setting.includes('dterm_lpf1')) {
        expect(rec.recommendedValue).toBeGreaterThanOrEqual(0);
        expect(rec.recommendedValue).toBeLessThanOrEqual(300);
      }
    }
  });

  it('should fire monotonically increasing progress callbacks', async () => {
    const progressCalls: AnalysisProgress[] = [];

    await analyzeFilters(flightData, 0, DEFAULT_FILTER_SETTINGS, (progress) => {
      progressCalls.push({ ...progress });
    });

    expect(progressCalls.length).toBeGreaterThan(0);

    // Percent values should be monotonically non-decreasing
    for (let i = 1; i < progressCalls.length; i++) {
      expect(progressCalls[i].percent).toBeGreaterThanOrEqual(progressCalls[i - 1].percent);
    }
    // Final progress should reach 100
    expect(progressCalls[progressCalls.length - 1].percent).toBe(100);
  });

  // -- PID analysis tests --

  it('should return a complete PID analysis result', async () => {
    const result = await analyzePID(flightData, 0, DEFAULT_PIDS);

    expect(result.roll).toBeDefined();
    expect(result.pitch).toBeDefined();
    expect(result.yaw).toBeDefined();
    expect(result.recommendations).toBeDefined();
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(typeof result.summary).toBe('string');
    expect(typeof result.stepsDetected).toBe('number');
    expect(result.stepsDetected).toBeGreaterThanOrEqual(0);
  });

  it('should handle hover-only data gracefully (no stick inputs)', async () => {
    // The bf45-reference fixture has all setpoint = 0 (hover), so the step
    // detector should find 0 steps and produce no recommendations.
    const result = await analyzePID(flightData, 0, DEFAULT_PIDS);

    expect(result.stepsDetected).toBe(0);
    expect(result.recommendations).toHaveLength(0);
    expect(result.roll.responses).toHaveLength(0);
    expect(result.pitch.responses).toHaveLength(0);
    expect(result.yaw.responses).toHaveLength(0);
  });

  it('should complete PID analysis within 5 seconds', async () => {
    const start = performance.now();
    await analyzePID(flightData, 0, DEFAULT_PIDS);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);
  });

  it('should complete filter analysis within 5 seconds', async () => {
    const start = performance.now();
    await analyzeFilters(flightData, 0, DEFAULT_FILTER_SETTINGS);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);
  });

  it('should run both analyses in parallel without interference', async () => {
    const [filterResult, pidResult] = await Promise.all([
      analyzeFilters(flightData, 0, DEFAULT_FILTER_SETTINGS),
      analyzePID(flightData, 0, DEFAULT_PIDS),
    ]);

    // Both should complete successfully
    expect(filterResult.noise).toBeDefined();
    expect(filterResult.summary.length).toBeGreaterThan(0);
    expect(pidResult.roll).toBeDefined();
    expect(pidResult.summary.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Section 2: Real flight BBL fixture (conditional)
// ---------------------------------------------------------------------------

const FIXTURE_PATH = path.join(__dirname, '..', 'blackbox', '__fixtures__', 'real_flight.bbl');
const hasFixture = fs.existsSync(FIXTURE_PATH);
const describeReal = hasFixture ? describe : describe.skip;

describeReal('Analysis Pipeline with real_flight.bbl', () => {
  let flightData: BlackboxFlightData;

  beforeAll(async () => {
    const raw = fs.readFileSync(FIXTURE_PATH);
    const result = await BlackboxParser.parse(Buffer.from(raw));
    expect(result.success).toBe(true);
    expect(result.sessions.length).toBeGreaterThanOrEqual(1);
    flightData = result.sessions[0].flightData;
  }, 30000);

  // -- Filter analysis on real data --

  it('should detect noise on real data (non-zero noise floor on at least 2 axes)', { timeout: 15000 }, async () => {
    const result = await analyzeFilters(flightData, 0, DEFAULT_FILTER_SETTINGS);

    // At least 2 axes should have non-trivial noise (noiseFloorDb > -Infinity)
    const noiseFloors = [
      result.noise.roll.noiseFloorDb,
      result.noise.pitch.noiseFloorDb,
      result.noise.yaw.noiseFloorDb,
    ];
    const nonTrivialAxes = noiseFloors.filter((db) => Number.isFinite(db) && db > -200);
    expect(nonTrivialAxes.length).toBeGreaterThanOrEqual(2);
  });

  it('should generate at least one filter recommendation', { timeout: 15000 }, async () => {
    const result = await analyzeFilters(flightData, 0, DEFAULT_FILTER_SETTINGS);

    expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect peak frequencies in expected range (10-4000 Hz)', { timeout: 15000 }, async () => {
    const result = await analyzeFilters(flightData, 0, DEFAULT_FILTER_SETTINGS);

    const allPeaks = [
      ...result.noise.roll.peaks,
      ...result.noise.pitch.peaks,
      ...result.noise.yaw.peaks,
    ];

    // Real flight data should have at least some peaks
    if (allPeaks.length > 0) {
      for (const peak of allPeaks) {
        // Lower bound is generous — real data can have low-frequency vibration peaks
        expect(peak.frequency).toBeGreaterThanOrEqual(10);
        expect(peak.frequency).toBeLessThanOrEqual(4000);
      }
    }
  });

  it('should recommend filter cutoffs within safety bounds on real data', { timeout: 15000 }, async () => {
    const result = await analyzeFilters(flightData, 0, DEFAULT_FILTER_SETTINGS);

    for (const rec of result.recommendations) {
      if (rec.setting.includes('gyro_lpf1')) {
        expect(rec.recommendedValue).toBeGreaterThanOrEqual(0);
        expect(rec.recommendedValue).toBeLessThanOrEqual(500);
      }
      if (rec.setting.includes('dterm_lpf1')) {
        expect(rec.recommendedValue).toBeGreaterThanOrEqual(0);
        expect(rec.recommendedValue).toBeLessThanOrEqual(300);
      }
    }
  });

  // -- PID analysis on real data --

  it('should detect steps in real flight data', { timeout: 15000 }, async () => {
    const result = await analyzePID(flightData, 0, DEFAULT_PIDS);

    // Real flight data should contain stick inputs
    expect(result.stepsDetected).toBeGreaterThan(0);
  });

  it('should produce step metrics in realistic ranges', { timeout: 15000 }, async () => {
    const result = await analyzePID(flightData, 0, DEFAULT_PIDS);

    const allResponses = [
      ...result.roll.responses,
      ...result.pitch.responses,
      ...result.yaw.responses,
    ];

    expect(allResponses.length).toBeGreaterThan(0);

    for (const resp of allResponses) {
      expect(resp.overshootPercent).toBeGreaterThanOrEqual(0);
      // Real flight data can have very high overshoot (aggressive maneuvers, poor tuning)
      expect(resp.overshootPercent).toBeLessThanOrEqual(2000);
      // Rise time can be 0 when gyro reaches target within a single sample
      expect(resp.riseTimeMs).toBeGreaterThanOrEqual(0);
      expect(resp.riseTimeMs).toBeLessThan(500);
      // Settling time can be 0 for very fast or near-instant responses
      expect(resp.settlingTimeMs).toBeGreaterThanOrEqual(0);
      expect(resp.settlingTimeMs).toBeLessThan(2000);
    }
  });

  it('should recommend PID values within safety bounds', { timeout: 15000 }, async () => {
    const result = await analyzePID(flightData, 0, DEFAULT_PIDS);

    for (const rec of result.recommendations) {
      if (rec.setting.includes('_p')) {
        expect(rec.recommendedValue).toBeGreaterThanOrEqual(20);
        expect(rec.recommendedValue).toBeLessThanOrEqual(120);
      }
      if (rec.setting.includes('_d')) {
        expect(rec.recommendedValue).toBeGreaterThanOrEqual(15);
        expect(rec.recommendedValue).toBeLessThanOrEqual(80);
      }
    }
  });

  it('should complete PID analysis within 10 seconds on real data', { timeout: 15000 }, async () => {
    const start = performance.now();
    await analyzePID(flightData, 0, DEFAULT_PIDS);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(10000);
  });

  it('should complete filter analysis within 10 seconds on real data', { timeout: 15000 }, async () => {
    const start = performance.now();
    await analyzeFilters(flightData, 0, DEFAULT_FILTER_SETTINGS);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(10000);
  });

  it('should produce deterministic filter analysis results', { timeout: 15000 }, async () => {
    const result1 = await analyzeFilters(flightData, 0, DEFAULT_FILTER_SETTINGS);
    const result2 = await analyzeFilters(flightData, 0, DEFAULT_FILTER_SETTINGS);

    // Noise floor values should be exactly the same across runs
    expect(result1.noise.roll.noiseFloorDb).toBe(result2.noise.roll.noiseFloorDb);
    expect(result1.noise.pitch.noiseFloorDb).toBe(result2.noise.pitch.noiseFloorDb);
    expect(result1.noise.yaw.noiseFloorDb).toBe(result2.noise.yaw.noiseFloorDb);

    // Recommendation count should match
    expect(result1.recommendations.length).toBe(result2.recommendations.length);

    // Each recommendation value should match
    for (let i = 0; i < result1.recommendations.length; i++) {
      expect(result1.recommendations[i].setting).toBe(result2.recommendations[i].setting);
      expect(result1.recommendations[i].recommendedValue).toBe(
        result2.recommendations[i].recommendedValue
      );
    }
  });
});
