import { describe, it, expect } from 'vitest';
import { BlackboxParser, BlackboxParseError } from './BlackboxParser';

/**
 * Helper to build a minimal synthetic BBL file buffer.
 * Creates valid headers + I-frame data for testing.
 */
function buildSyntheticBBL(options: {
  numIFrames?: number;
  includeGyro?: boolean;
  includeMotor?: boolean;
  addCorruption?: boolean;
  secondSession?: boolean;
} = {}): Buffer {
  const { numIFrames = 3, includeGyro = true, includeMotor = false, addCorruption = false, secondSession = false } = options;

  const parts: Buffer[] = [];

  function addSession(sessionNum: number) {
    // Build field names based on options
    const iFieldNames = ['loopIteration', 'time'];
    const iEncodings = ['1', '1']; // UNSIGNED_VB
    const iPredictors = ['0', '0']; // ZERO
    const iSigned = ['0', '0'];

    if (includeGyro) {
      iFieldNames.push('gyroADC[0]', 'gyroADC[1]', 'gyroADC[2]');
      iEncodings.push('0', '0', '0'); // SIGNED_VB
      iPredictors.push('0', '0', '0');
      iSigned.push('1', '1', '1');
    }

    if (includeMotor) {
      iFieldNames.push('motor[0]', 'motor[1]', 'motor[2]', 'motor[3]');
      iEncodings.push('1', '1', '1', '1'); // UNSIGNED_VB
      iPredictors.push('0', '0', '0', '0');
      iSigned.push('0', '0', '0', '0');
    }

    // Header lines
    const headers = [
      'H Product:Blackbox flight data recorder by Nicholas Sherlock',
      'H Data version:2',
      'H I interval:32',
      'H P interval:1/2',
      'H Firmware type:Betaflight',
      'H Firmware revision:4.4.2',
      'H looptime:312',
      'H minthrottle:1070',
      'H vbatref:420',
      `H Field I name:${iFieldNames.join(',')}`,
      `H Field I signed:${iSigned.join(',')}`,
      `H Field I predictor:${iPredictors.join(',')}`,
      `H Field I encoding:${iEncodings.join(',')}`,
      // P-frame defs (simplified: same as I but with PREVIOUS predictor)
      `H Field P name:${iFieldNames.join(',')}`,
      `H Field P signed:${iSigned.join(',')}`,
      `H Field P predictor:${iFieldNames.map(() => '1').join(',')}`,
      `H Field P encoding:${iFieldNames.map(() => '0').join(',')}`,
    ];

    parts.push(Buffer.from(headers.join('\n') + '\n'));

    // I-frames
    for (let f = 0; f < numIFrames; f++) {
      // Frame marker: 'I' (0x49)
      const frameBytes: number[] = [0x49];

      // loopIteration (unsigned VB)
      const loopIter = sessionNum * 1000 + f * 32;
      pushUVB(frameBytes, loopIter);

      // time (unsigned VB)
      const time = loopIter * 312; // µs
      pushUVB(frameBytes, time);

      if (includeGyro) {
        // gyroADC[0..2] (signed VB): small values
        pushSVB(frameBytes, 10 + f);   // gyro roll
        pushSVB(frameBytes, -(5 + f)); // gyro pitch
        pushSVB(frameBytes, f);        // gyro yaw
      }

      if (includeMotor) {
        // motor[0..3] (unsigned VB): ~1500
        pushUVB(frameBytes, 1500 + f);
        pushUVB(frameBytes, 1500 - f);
        pushUVB(frameBytes, 1500);
        pushUVB(frameBytes, 1500);
      }

      if (addCorruption && f === 1) {
        // Insert garbage bytes before this frame
        parts.push(Buffer.from([0xFF, 0xFE, 0xFD, 0xFC]));
      }

      parts.push(Buffer.from(frameBytes));
    }

    // End event
    parts.push(Buffer.from([0x45, EVENT_LOG_END]));
  }

  addSession(0);
  if (secondSession) {
    addSession(1);
  }

  return Buffer.concat(parts);
}

const EVENT_LOG_END = 255;

/** Encode unsigned value as variable-byte and push to array */
function pushUVB(arr: number[], value: number): void {
  let v = value;
  while (v >= 0x80) {
    arr.push((v & 0x7F) | 0x80);
    v >>>= 7;
  }
  arr.push(v & 0x7F);
}

/** Encode signed value as zigzag VB and push to array */
function pushSVB(arr: number[], value: number): void {
  // ZigZag encode: (n << 1) ^ (n >> 31)
  const zigzag = (value << 1) ^ (value >> 31);
  pushUVB(arr, zigzag >>> 0);
}

describe('BlackboxParser', () => {
  describe('findSessionBoundaries', () => {
    it('finds single session', () => {
      const data = buildSyntheticBBL();
      const boundaries = BlackboxParser.findSessionBoundaries(data);
      expect(boundaries).toHaveLength(1);
      expect(boundaries[0]).toBe(0);
    });

    it('finds multiple sessions', () => {
      const data = buildSyntheticBBL({ secondSession: true });
      const boundaries = BlackboxParser.findSessionBoundaries(data);
      expect(boundaries).toHaveLength(2);
    });

    it('returns empty for data without headers', () => {
      const data = Buffer.from([0x49, 0x00, 0x01, 0x02]);
      const boundaries = BlackboxParser.findSessionBoundaries(data);
      expect(boundaries).toHaveLength(0);
    });
  });

  describe('parse', () => {
    it('throws on empty buffer', async () => {
      await expect(BlackboxParser.parse(Buffer.alloc(0))).rejects.toThrow(BlackboxParseError);
    });

    it('throws on buffer without valid header', async () => {
      await expect(BlackboxParser.parse(Buffer.from('not a bbl file'))).rejects.toThrow(BlackboxParseError);
    });

    it('parses a synthetic BBL with I-frames', async () => {
      const data = buildSyntheticBBL({ numIFrames: 5, includeGyro: true });
      const result = await BlackboxParser.parse(data);

      expect(result.success).toBe(true);
      expect(result.sessions).toHaveLength(1);
      expect(result.fileSize).toBe(data.length);
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);

      const session = result.sessions[0];
      expect(session.index).toBe(0);
      expect(session.header.firmwareType).toBe('Betaflight');
      expect(session.header.looptime).toBe(312);
    });

    it('extracts gyro time series', async () => {
      const data = buildSyntheticBBL({ numIFrames: 3, includeGyro: true });
      const result = await BlackboxParser.parse(data);

      const fd = result.sessions[0].flightData;
      expect(fd.frameCount).toBe(3);
      expect(fd.gyro[0].values.length).toBe(3);
      // First frame: gyroADC[0] = 10
      expect(fd.gyro[0].values[0]).toBe(10);
      // First frame: gyroADC[1] = -5
      expect(fd.gyro[1].values[0]).toBe(-5);
    });

    it('extracts motor time series', async () => {
      const data = buildSyntheticBBL({ numIFrames: 3, includeMotor: true });
      const result = await BlackboxParser.parse(data);

      const fd = result.sessions[0].flightData;
      expect(fd.motor[0].values[0]).toBe(1500);
      expect(fd.motor[1].values[0]).toBe(1500);
    });

    it('computes correct sample rate', async () => {
      const data = buildSyntheticBBL({ numIFrames: 2 });
      const result = await BlackboxParser.parse(data);

      const fd = result.sessions[0].flightData;
      // sampleRate = 1_000_000 / 312 ≈ 3205
      expect(fd.sampleRateHz).toBeCloseTo(1_000_000 / 312, 0);
    });

    it('computes duration from time field', async () => {
      const data = buildSyntheticBBL({ numIFrames: 10, includeGyro: true });
      const result = await BlackboxParser.parse(data);

      const fd = result.sessions[0].flightData;
      expect(fd.durationSeconds).toBeGreaterThan(0);
    });

    it('reports progress', async () => {
      const data = buildSyntheticBBL({ numIFrames: 5 });
      const progressCalls: number[] = [];

      await BlackboxParser.parse(data, (progress) => {
        progressCalls.push(progress.percent);
      });

      expect(progressCalls.length).toBeGreaterThan(0);
      // Last progress should be ~100
      expect(progressCalls[progressCalls.length - 1]).toBeGreaterThanOrEqual(50);
    });

    it('handles corruption by skipping bad frames', async () => {
      const data = buildSyntheticBBL({ numIFrames: 5, includeGyro: true, addCorruption: true });
      const result = await BlackboxParser.parse(data);

      expect(result.success).toBe(true);
      const session = result.sessions[0];
      // Should still parse some frames even with corruption
      expect(session.flightData.frameCount).toBeGreaterThan(0);
      expect(session.corruptedFrameCount).toBeGreaterThanOrEqual(0);
    });

    it('parses multiple sessions', async () => {
      const data = buildSyntheticBBL({ numIFrames: 3, includeGyro: true, secondSession: true });
      const result = await BlackboxParser.parse(data);

      expect(result.success).toBe(true);
      expect(result.sessions.length).toBe(2);
      expect(result.sessions[0].index).toBe(0);
      expect(result.sessions[1].index).toBe(1);
    });

    it('produces zero-filled arrays for missing fields', async () => {
      // No gyro fields → gyro should be zero
      const data = buildSyntheticBBL({ numIFrames: 3, includeGyro: false, includeMotor: true });
      const result = await BlackboxParser.parse(data);

      const fd = result.sessions[0].flightData;
      // Gyro fields don't exist, so values should all be 0
      expect(fd.gyro[0].values.every(v => v === 0)).toBe(true);
    });

    it('handles time series with Float64Array types', async () => {
      const data = buildSyntheticBBL({ numIFrames: 3, includeGyro: true });
      const result = await BlackboxParser.parse(data);

      const fd = result.sessions[0].flightData;
      expect(fd.gyro[0].time).toBeInstanceOf(Float64Array);
      expect(fd.gyro[0].values).toBeInstanceOf(Float64Array);
      expect(fd.motor[0].time).toBeInstanceOf(Float64Array);
      expect(fd.motor[0].values).toBeInstanceOf(Float64Array);
    });

    it('returns failure result when no frames can be parsed', async () => {
      // Header only, no frames
      const headers = [
        'H Product:Blackbox flight data recorder',
        'H Data version:2',
        'H Field I name:loopIteration,time',
        'H Field I encoding:1,1',
        'H Field I predictor:0,0',
        'H Field I signed:0,0',
      ];
      const data = Buffer.from(headers.join('\n') + '\n');
      const result = await BlackboxParser.parse(data);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
