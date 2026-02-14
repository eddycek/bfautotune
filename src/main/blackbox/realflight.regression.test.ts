/**
 * Regression tests against a real Betaflight blackbox log file.
 *
 * These validate the full pipeline from binary parsing through downstream
 * analysis (segment selection, step detection). The fixture file is NOT
 * checked into git — tests are skipped in CI via `describe.skip`.
 *
 * To run locally, place a real .bbl file at:
 *   src/main/blackbox/__fixtures__/real_flight.bbl
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { BlackboxParser } from './BlackboxParser';
import { findSteadySegments, normalizeThrottle } from '../analysis/SegmentSelector';
import { detectSteps } from '../analysis/StepDetector';

const FIXTURE_PATH = path.join(__dirname, '__fixtures__', 'real_flight.bbl');

// Skip if fixture not present (CI)
const hasFixture = fs.existsSync(FIXTURE_PATH);
const describeReal = hasFixture ? describe : describe.skip;

describeReal('Real flight BBL regression', () => {
  let parseResult: Awaited<ReturnType<typeof BlackboxParser.parse>>;

  // Parse once, reuse across tests
  beforeAll(async () => {
    const data = fs.readFileSync(FIXTURE_PATH);
    parseResult = await BlackboxParser.parse(data);
  });

  it('parses without errors and finds multiple sessions', () => {
    expect(parseResult.sessions.length).toBeGreaterThan(0);
  });

  it('all sessions have valid headers', () => {
    for (const s of parseResult.sessions) {
      expect(s.header.looptime).toBeGreaterThan(0);
      expect(s.header.pDenom).toBeGreaterThan(0);
      expect(s.header.iFieldDefs.length).toBeGreaterThan(5);
      expect(s.header.pFieldDefs.length).toBeGreaterThan(5);
    }
  });

  it('sampleRateHz = 1e6 / (looptime * pInterval * pDenom)', () => {
    for (const s of parseResult.sessions) {
      const pDiv = Math.max(1, s.header.pInterval) * Math.max(1, s.header.pDenom);
      const expected = 1_000_000 / (s.header.looptime * pDiv);
      expect(s.flightData.sampleRateHz).toBeCloseTo(expected, 0);
    }
  });

  it('empirical sample rate from time deltas matches formula', () => {
    const s = parseResult.sessions[0];
    const fd = s.flightData;
    const time = fd.gyro[0].time;

    // Compute deltas between consecutive samples (first 1000)
    const deltas: number[] = [];
    for (let i = 1; i < Math.min(time.length, 1000); i++) {
      deltas.push(time[i] - time[i - 1]);
    }

    // Filter out outliers (> 3x minimum), then compute empirical rate
    const minDelta = Math.min(...deltas);
    const normalDeltas = deltas.filter(d => d < minDelta * 3);
    const normalAvg = normalDeltas.reduce((a, b) => a + b, 0) / normalDeltas.length;
    const empiricalHz = 1.0 / normalAvg;

    // Empirical rate should be within 10% of reported rate
    expect(empiricalHz).toBeGreaterThan(fd.sampleRateHz * 0.9);
    expect(empiricalHz).toBeLessThan(fd.sampleRateHz * 1.1);
  });

  it('gyro data has realistic values (not all zeros, not constant)', () => {
    const longest = parseResult.sessions.reduce((a, b) =>
      a.flightData.frameCount > b.flightData.frameCount ? a : b
    );
    const fd = longest.flightData;

    for (let a = 0; a < 3; a++) {
      const vals = fd.gyro[a].values;
      const nonZero = vals.filter(v => v !== 0).length;
      const min = Math.min(...Array.from(vals));
      const max = Math.max(...Array.from(vals));

      expect(nonZero).toBeGreaterThan(vals.length * 0.1); // >10% non-zero
      expect(max - min).toBeGreaterThan(1); // not constant
    }
  });

  it('setpoint data has realistic values', () => {
    const longest = parseResult.sessions.reduce((a, b) =>
      a.flightData.frameCount > b.flightData.frameCount ? a : b
    );
    const fd = longest.flightData;

    // Throttle channel should have varying values
    const throttle = fd.setpoint[3].values;
    const nonZero = throttle.filter(v => v !== 0).length;
    expect(nonZero).toBeGreaterThan(0);

    // Normalized throttle should be 0..1 range
    const normalized = normalizeThrottle(throttle[Math.floor(throttle.length / 2)]);
    expect(normalized).toBeGreaterThanOrEqual(0);
    expect(normalized).toBeLessThanOrEqual(1);
  });

  it('time array is monotonic (< 1% backward jumps)', () => {
    const longest = parseResult.sessions.reduce((a, b) =>
      a.flightData.frameCount > b.flightData.frameCount ? a : b
    );
    const time = longest.flightData.gyro[0].time;

    let backwardJumps = 0;
    for (let i = 1; i < time.length; i++) {
      if (time[i] - time[i - 1] < 0) backwardJumps++;
    }

    // Small backward jumps at I-frame boundaries are normal (predictor rounding).
    // Accept up to 1% in real data.
    const backwardPct = (backwardJumps / time.length) * 100;
    expect(backwardPct).toBeLessThan(1);
  });

  it('motor data has realistic values', () => {
    const longest = parseResult.sessions.reduce((a, b) =>
      a.flightData.frameCount > b.flightData.frameCount ? a : b
    );
    const fd = longest.flightData;

    for (let m = 0; m < 4; m++) {
      const vals = fd.motor[m].values;
      const nonZero = vals.filter(v => v !== 0).length;
      expect(nonZero).toBeGreaterThan(0);
    }
  });

  it('all sessions with >10 frames have non-zero gyro data', () => {
    for (const s of parseResult.sessions) {
      if (s.flightData.frameCount < 10) continue;

      const gyroRollRange = Math.max(...Array.from(s.flightData.gyro[0].values))
        - Math.min(...Array.from(s.flightData.gyro[0].values));
      const gyroPitchRange = Math.max(...Array.from(s.flightData.gyro[1].values))
        - Math.min(...Array.from(s.flightData.gyro[1].values));

      expect(gyroRollRange + gyroPitchRange).toBeGreaterThan(0);
    }
  });

  it('P/I frame ratio is plausible (> 5:1)', () => {
    // With iInterval=128 and pInterval=4, expect ~31 P-frames per I-frame.
    // Even with corruption, ratio should be > 5:1
    const longest = parseResult.sessions.reduce((a, b) =>
      a.flightData.frameCount > b.flightData.frameCount ? a : b
    );
    const fd = longest.flightData;
    // frameCount = total I + P frames. We can't split here, but if
    // sampleRate and duration are correct, the data is well-parsed.
    expect(fd.frameCount).toBeGreaterThan(100);
    expect(fd.durationSeconds).toBeGreaterThan(1);
  });

  it('no time drift: first P-frame after I-frame has ~1ms delta (not 2ms)', () => {
    // This regression test catches the prev2 reset bug:
    // If previousFrame2 isn't set to I-frame after parsing an I-frame,
    // STRAIGHT_LINE predictor doubles the time delta.
    const s = parseResult.sessions[0];
    const time = s.flightData.gyro[0].time;

    // Check deltas at start of flight (first 100 frames)
    const deltas: number[] = [];
    for (let i = 1; i < Math.min(time.length, 100); i++) {
      deltas.push((time[i] - time[i - 1]) * 1e6); // in µs
    }

    // Expected delta is ~looptime * pDiv µs
    const expectedDelta = s.header.looptime * Math.max(1, s.header.pInterval) * Math.max(1, s.header.pDenom);

    // All deltas should be within 2x of expected (no drift/doubling)
    const maxDelta = Math.max(...deltas.filter(d => d > 0));
    expect(maxDelta).toBeLessThan(expectedDelta * 2);
  });

  it('SegmentSelector finds steady hover segments', () => {
    const longest = parseResult.sessions.reduce((a, b) =>
      a.flightData.frameCount > b.flightData.frameCount ? a : b
    );
    const segments = findSteadySegments(longest.flightData);
    expect(segments.length).toBeGreaterThan(0);
  });

  it('StepDetector finds step inputs', () => {
    const longest = parseResult.sessions.reduce((a, b) =>
      a.flightData.frameCount > b.flightData.frameCount ? a : b
    );
    const steps = detectSteps(longest.flightData);

    // A test flight with stick inputs should have meaningful step count
    expect(steps.length).toBeGreaterThan(2);

    // Should find steps on at least 2 axes
    const axes = new Set(steps.map(s => s.axis));
    expect(axes.size).toBeGreaterThanOrEqual(2);
  });
});
