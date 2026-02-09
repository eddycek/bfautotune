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
    parts.push(logEndBytes());
  }

  addSession(0);
  if (secondSession) {
    addSession(1);
  }

  return Buffer.concat(parts);
}

const EVENT_LOG_END = 255;

/** Full LOG_END event bytes: marker(E) + type(0xFF) + "End of log\0" */
function logEndBytes(): Buffer {
  return Buffer.from([0x45, EVENT_LOG_END, ...Buffer.from('End of log\0', 'ascii')]);
}

/**
 * Encode TAG2_3S32 group (BF encoding 7).
 * Top 2 bits of lead byte select sub-encoding:
 *   00 = 2-bit fields (0 extra bytes)
 *   01 = 4-bit fields (1 extra byte)
 *   10 = 6-bit fields (2 extra bytes)
 *   11 = variable width (S8/S16/S24/S32 per value)
 */
function pushTag2_3S32(arr: number[], values: [number, number, number]): void {
  const maxAbs = Math.max(Math.abs(values[0]), Math.abs(values[1]), Math.abs(values[2]));

  if (maxAbs <= 1) {
    // Selector 0: 2-bit fields packed in lead byte
    // bits [5:4]=value[0], [3:2]=value[1], [1:0]=value[2]
    const leadByte = (0x00 << 6) |
      ((values[0] & 0x03) << 4) |
      ((values[1] & 0x03) << 2) |
      (values[2] & 0x03);
    arr.push(leadByte);
  } else if (maxAbs <= 7) {
    // Selector 1: 4-bit fields — value[0] in lead low nibble, value[1,2] in extra byte
    const leadByte = (0x01 << 6) | (values[0] & 0x0F);
    const extraByte = ((values[1] & 0x0F) << 4) | (values[2] & 0x0F);
    arr.push(leadByte, extraByte);
  } else if (maxAbs <= 31) {
    // Selector 2: 6-bit fields
    const leadByte = (0x02 << 6) | (values[0] & 0x3F);
    arr.push(leadByte, values[1] & 0x3F, values[2] & 0x3F);
  } else {
    // Selector 3: variable width — use S8 for small, S16 for bigger
    // Build width selector bits
    let widthBits = 0;
    const payloads: number[][] = [];
    for (let i = 0; i < 3; i++) {
      const v = values[i];
      const absV = Math.abs(v);
      if (absV <= 127) {
        // 00 = S8
        payloads.push([v < 0 ? v + 256 : v]);
      } else if (absV <= 32767) {
        // 01 = S16LE
        widthBits |= (0x01 << (i * 2));
        const u16 = v < 0 ? v + 65536 : v;
        payloads.push([u16 & 0xFF, (u16 >> 8) & 0xFF]);
      } else {
        // 11 = S32LE
        widthBits |= (0x03 << (i * 2));
        const buf = Buffer.alloc(4);
        buf.writeInt32LE(v, 0);
        payloads.push([...buf]);
      }
    }
    const leadByte = (0x03 << 6) | widthBits;
    arr.push(leadByte);
    for (const p of payloads) arr.push(...p);
  }
}

/** Encode S16 LE and push to array */
function pushS16(arr: number[], value: number): void {
  const u16 = value < 0 ? value + 65536 : value;
  arr.push(u16 & 0xFF, (u16 >> 8) & 0xFF);
}

/** Encode S8 and push to array */
function pushS8(arr: number[], value: number): void {
  arr.push(value < 0 ? value + 256 : value);
}

/**
 * BF encoding 9 = NULL: writes no bytes. Used for P-frame loopIteration
 * with INCREMENT predictor (the delta is always 0, predictor adds +1).
 * This is a no-op encoder kept for clarity in test helpers.
 */
function pushNull(_arr: number[], _value: number): void {
  // NULL encoding: no bytes emitted
}

/**
 * Encode TAG8_8SVB (BF encoding 6).
 * Tag byte where bit i indicates values[i] is non-zero. For each set bit, write signed VB.
 * Encodes up to 8 values.
 */
function pushTag8_8SVB(arr: number[], values: number[]): void {
  let tag = 0;
  const count = Math.min(values.length, 8);
  for (let i = 0; i < count; i++) {
    if (values[i] !== 0) tag |= (1 << i);
  }
  arr.push(tag);
  for (let i = 0; i < count; i++) {
    if (values[i] !== 0) pushSVB(arr, values[i]);
  }
}

/**
 * Encode TAG2_3SVARIABLE (BF encoding 10).
 * Top 2 bits of lead byte select sub-encoding:
 *   00 = 2-bit fields (same as TAG2_3S32 case 0)
 *   01 = 5-5-4 bit fields (1 extra byte)
 *   10 = 8-7-7 bit fields (2 extra bytes)
 *   11 = variable width (same as TAG2_3S32 case 3)
 */
function pushTag2_3SVariable(arr: number[], values: [number, number, number]): void {
  const maxAbs = Math.max(Math.abs(values[0]), Math.abs(values[1]), Math.abs(values[2]));

  if (maxAbs <= 1) {
    // Selector 0: 2-bit fields — same as TAG2_3S32 case 0
    const leadByte = (0x00 << 6) |
      ((values[0] & 0x03) << 4) |
      ((values[1] & 0x03) << 2) |
      (values[2] & 0x03);
    arr.push(leadByte);
  } else if (maxAbs <= 7) {
    // Selector 1: 5-5-4 bit fields
    // value[0] = (leadByte & 0x3E) >> 1
    // value[1] = ((leadByte & 0x01) << 4) | (byte1 >> 4)
    // value[2] = byte1 & 0x0F
    const v0 = values[0] & 0x1F;
    const v1 = values[1] & 0x1F;
    const v2 = values[2] & 0x0F;
    const leadByte = (0x01 << 6) | ((v0 & 0x1F) << 1) | ((v1 >> 4) & 0x01);
    const extraByte = ((v1 & 0x0F) << 4) | (v2 & 0x0F);
    arr.push(leadByte, extraByte);
  } else {
    // Selector 3: variable width — same as TAG2_3S32 case 3
    let widthBits = 0;
    const payloads: number[][] = [];
    for (let i = 0; i < 3; i++) {
      const v = values[i];
      const absV = Math.abs(v);
      if (absV <= 127) {
        payloads.push([v < 0 ? v + 256 : v]);
      } else if (absV <= 32767) {
        widthBits |= (0x01 << (i * 2));
        const u16 = v < 0 ? v + 65536 : v;
        payloads.push([u16 & 0xFF, (u16 >> 8) & 0xFF]);
      } else {
        widthBits |= (0x03 << (i * 2));
        const buf = Buffer.alloc(4);
        buf.writeInt32LE(v, 0);
        payloads.push([...buf]);
      }
    }
    const leadByte = (0x03 << 6) | widthBits;
    arr.push(leadByte);
    for (const p of payloads) arr.push(...p);
  }
}

/**
 * Encode TAG8_4S16 v2 (BF encoding 8, data version 2).
 * Tag byte with 2 bits per value (4 values total):
 *   00 = zero, 01 = S8, 10 = S16, 11 = signed VB
 */
function pushTag8_4S16V2(arr: number[], values: [number, number, number, number]): void {
  let tag = 0;
  // First pass: compute tag bits for each value
  const sizes: number[] = [];
  for (let i = 0; i < 4; i++) {
    const v = values[i];
    const absV = Math.abs(v);
    let bits: number;
    if (v === 0) {
      bits = 0b00;
    } else if (absV <= 127) {
      bits = 0b01; // S8
    } else if (absV <= 32767) {
      bits = 0b10; // S16
    } else {
      bits = 0b11; // signed VB
    }
    tag |= (bits << (i * 2));
    sizes.push(bits);
  }
  arr.push(tag);
  // Second pass: write values
  for (let i = 0; i < 4; i++) {
    switch (sizes[i]) {
      case 0b00: break; // zero, nothing to write
      case 0b01: pushS8(arr, values[i]); break;
      case 0b10: pushS16(arr, values[i]); break;
      case 0b11: pushSVB(arr, values[i]); break;
    }
  }
}

/**
 * Build a synthetic BBL with I-frames AND P-frames using TAG2_3S32 encoding
 * for gyro fields (like real Betaflight). Returns expected gyro values for validation.
 */
function buildBBLWithPFrames(options: {
  gyroDeltas?: [number, number, number][];
  extraFields?: boolean;
} = {}): { buffer: Buffer; expectedGyro: [number[], number[], number[]] } {
  const {
    gyroDeltas = [[5, -3, 2], [100, -80, 50], [0, 0, 0]],
    extraFields = false,
  } = options;

  const parts: Buffer[] = [];

  // Build field names
  const iFieldNames: string[] = ['loopIteration', 'time'];
  const iEncodings: string[] = ['1', '1']; // UNSIGNED_VB
  const iPredictors: string[] = ['0', '0']; // ZERO
  const iSigned: string[] = ['0', '0'];

  const pEncodings: string[] = ['0', '0']; // SIGNED_VB for loopIter, time
  const pPredictors: string[] = ['1', '1']; // PREVIOUS

  if (extraFields) {
    // Add PID fields (axisP[0-2]) before gyro to test field alignment
    for (let i = 0; i < 3; i++) {
      iFieldNames.push(`axisP[${i}]`);
      iEncodings.push('0'); // SIGNED_VB
      iPredictors.push('0'); // ZERO
      iSigned.push('1');
      pEncodings.push('7'); // TAG2_3S32 (BF encoding 7)
      pPredictors.push('1'); // PREVIOUS
    }
  }

  // Gyro fields
  for (let i = 0; i < 3; i++) {
    iFieldNames.push(`gyroADC[${i}]`);
    iEncodings.push('0'); // SIGNED_VB
    iPredictors.push('0'); // ZERO
    iSigned.push('1');
    pEncodings.push('7'); // TAG2_3S32 (BF encoding 7)
    pPredictors.push('1'); // PREVIOUS
  }

  const pSigned = iSigned.join(',');

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
    `H Field P name:${iFieldNames.join(',')}`,
    `H Field P signed:${pSigned}`,
    `H Field P predictor:${pPredictors.join(',')}`,
    `H Field P encoding:${pEncodings.join(',')}`,
  ];

  parts.push(Buffer.from(headers.join('\n') + '\n'));

  // Initial gyro values in I-frame
  const iGyro: [number, number, number] = [100, -50, 30];

  // I-frame
  const iFrame: number[] = [0x49]; // 'I'
  pushUVB(iFrame, 0); // loopIteration = 0
  pushUVB(iFrame, 0); // time = 0
  if (extraFields) {
    pushSVB(iFrame, 10);  // axisP[0]
    pushSVB(iFrame, -20); // axisP[1]
    pushSVB(iFrame, 5);   // axisP[2]
  }
  pushSVB(iFrame, iGyro[0]); // gyroADC[0]
  pushSVB(iFrame, iGyro[1]); // gyroADC[1]
  pushSVB(iFrame, iGyro[2]); // gyroADC[2]
  parts.push(Buffer.from(iFrame));

  // Track expected gyro values for all frames
  const expectedGyro: [number[], number[], number[]] = [
    [iGyro[0]], [iGyro[1]], [iGyro[2]],
  ];

  let prevGyro = [...iGyro];

  // P-frames
  for (let p = 0; p < gyroDeltas.length; p++) {
    const delta = gyroDeltas[p];
    const pFrame: number[] = [0x50]; // 'P'
    pushSVB(pFrame, 1);   // loopIteration delta
    pushSVB(pFrame, 312); // time delta

    if (extraFields) {
      // axisP deltas (TAG2_3S32 group)
      pushTag2_3S32(pFrame, [1, -1, 0]);
    }

    // gyro deltas (TAG2_3S32 group)
    pushTag2_3S32(pFrame, delta);
    parts.push(Buffer.from(pFrame));

    // Compute expected absolute values after PREVIOUS predictor
    const expectedAbsolute = [
      prevGyro[0] + delta[0],
      prevGyro[1] + delta[1],
      prevGyro[2] + delta[2],
    ];
    expectedGyro[0].push(expectedAbsolute[0]);
    expectedGyro[1].push(expectedAbsolute[1]);
    expectedGyro[2].push(expectedAbsolute[2]);
    prevGyro = expectedAbsolute;
  }

  // End event
  parts.push(logEndBytes());

  return { buffer: Buffer.concat(parts), expectedGyro };
}

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
      // sampleRate = 1_000_000 / (looptime * pInterval) = 1_000_000 / (312 * 1) ≈ 3205
      // (buildSyntheticBBL uses P interval:1/2 → pInterval=1)
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

  describe('P-frame parsing with TAG2_3S32', () => {
    it('correctly decodes P-frames with TAG2_3S32 gyro encoding', async () => {
      const { buffer, expectedGyro } = buildBBLWithPFrames({
        gyroDeltas: [
          [5, -3, 2],       // tag=1 (4-bit packing)
          [100, -80, 50],   // tag=2 (16-bit)
          [0, 0, 0],        // tag=0 (all zero)
        ],
      });

      const result = await BlackboxParser.parse(buffer);
      expect(result.success).toBe(true);

      const fd = result.sessions[0].flightData;
      expect(fd.frameCount).toBe(4); // 1 I + 3 P

      // Verify each frame for all 3 gyro axes
      for (let frame = 0; frame < 4; frame++) {
        expect(fd.gyro[0].values[frame]).toBe(expectedGyro[0][frame]); // roll
        expect(fd.gyro[1].values[frame]).toBe(expectedGyro[1][frame]); // pitch
        expect(fd.gyro[2].values[frame]).toBe(expectedGyro[2][frame]); // yaw
      }
    });

    it('correctly handles TAG2_3S32 tag=3 (signed VB) encoding with large values', async () => {
      const { buffer, expectedGyro } = buildBBLWithPFrames({
        gyroDeltas: [
          [40000, -30000, 20000], // tag=3 (signed VB, values > 32767)
        ],
      });

      const result = await BlackboxParser.parse(buffer);
      expect(result.success).toBe(true);

      const fd = result.sessions[0].flightData;
      // No sensor value validation — large values pass through (matching BF viewer)
      expect(fd.frameCount).toBe(2); // 1 I + 1 P
      expect(fd.gyro[0].values[1]).toBe(expectedGyro[0][1]); // 100 + 40000 = 40100
      expect(fd.gyro[1].values[1]).toBe(expectedGyro[1][1]); // -50 + -30000 = -30050
      expect(fd.gyro[2].values[1]).toBe(expectedGyro[2][1]); // 30 + 20000 = 20030
    });

    it('preserves gyro accuracy across many P-frames', async () => {
      // Simulate 100 P-frames with small varying deltas
      // This tests that the predictor chain doesn't accumulate errors
      const deltas: [number, number, number][] = [];
      for (let i = 0; i < 100; i++) {
        deltas.push([
          ((i % 7) - 3),     // -3 to 3
          ((i % 5) - 2),     // -2 to 2
          ((i % 3) - 1),     // -1 to 1
        ]);
      }

      const { buffer, expectedGyro } = buildBBLWithPFrames({ gyroDeltas: deltas });
      const result = await BlackboxParser.parse(buffer);
      expect(result.success).toBe(true);

      const fd = result.sessions[0].flightData;
      expect(fd.frameCount).toBe(101); // 1 I + 100 P

      // Check first, middle, and last frames
      for (const frameIdx of [0, 1, 50, 99, 100]) {
        for (let axis = 0; axis < 3; axis++) {
          expect(fd.gyro[axis].values[frameIdx]).toBe(
            expectedGyro[axis][frameIdx]
          );
        }
      }

      // Verify no axis is all-zero (which would indicate parsing bug)
      for (let axis = 0; axis < 3; axis++) {
        const allZero = Array.from(fd.gyro[axis].values).every(v => v === 0);
        expect(allZero).toBe(false);
      }
    });

    it('correctly parses TAG2_3S32 with extra PID fields before gyro', async () => {
      // Tests that multiple TAG2_3S32 groups don't interfere with each other
      const { buffer, expectedGyro } = buildBBLWithPFrames({
        extraFields: true,
        gyroDeltas: [[5, -3, 2], [-7, 4, -1]],
      });

      const result = await BlackboxParser.parse(buffer);
      expect(result.success).toBe(true);

      const fd = result.sessions[0].flightData;
      expect(fd.frameCount).toBe(3); // 1 I + 2 P

      // Verify gyro values are correct despite axisP fields preceding them
      for (let frame = 0; frame < 3; frame++) {
        expect(fd.gyro[0].values[frame]).toBe(expectedGyro[0][frame]);
        expect(fd.gyro[1].values[frame]).toBe(expectedGyro[1][frame]);
        expect(fd.gyro[2].values[frame]).toBe(expectedGyro[2][frame]);
      }
    });

    it('correctly handles mixed I and P frame sequences', async () => {
      // Build a BBL with multiple I-P cycles: I, P, P, I, P, P
      // This tests that the predictor chain resets correctly on new I-frames
      const parts: Buffer[] = [];
      const fieldNames = 'loopIteration,time,gyroADC[0],gyroADC[1],gyroADC[2]';

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
        `H Field I name:${fieldNames}`,
        'H Field I signed:0,0,1,1,1',
        'H Field I predictor:0,0,0,0,0',
        'H Field I encoding:1,1,0,0,0',
        `H Field P name:${fieldNames}`,
        'H Field P signed:0,0,1,1,1',
        'H Field P predictor:1,1,1,1,1',
        'H Field P encoding:0,0,7,7,7',
      ];
      parts.push(Buffer.from(headers.join('\n') + '\n'));

      // I-frame 1: loopIter=0, gyro=[100, -50, 30]
      const i1: number[] = [0x49];
      pushUVB(i1, 0); pushUVB(i1, 0);
      pushSVB(i1, 100); pushSVB(i1, -50); pushSVB(i1, 30);
      parts.push(Buffer.from(i1));

      // P-frame: delta gyro=[5, -3, 2] → [105, -53, 32]
      const p1: number[] = [0x50];
      pushSVB(p1, 1); pushSVB(p1, 312);
      pushTag2_3S32(p1, [5, -3, 2]);
      parts.push(Buffer.from(p1));

      // I-frame 2: loopIter=32, gyro=[200, -100, 60] (RESET)
      const i2: number[] = [0x49];
      pushUVB(i2, 32); pushUVB(i2, 32 * 312);
      pushSVB(i2, 200); pushSVB(i2, -100); pushSVB(i2, 60);
      parts.push(Buffer.from(i2));

      // P-frame after second I: delta gyro=[3, -1, 4] → [203, -101, 64]
      const p2: number[] = [0x50];
      pushSVB(p2, 1); pushSVB(p2, 312);
      pushTag2_3S32(p2, [3, -1, 4]);
      parts.push(Buffer.from(p2));

      parts.push(logEndBytes());

      const result = await BlackboxParser.parse(Buffer.concat(parts));
      expect(result.success).toBe(true);

      const fd = result.sessions[0].flightData;
      expect(fd.frameCount).toBe(4);

      // Verify that second I-frame resets the predictor chain
      // Frame 2 should use I-frame 2 values (200, -100, 60), not accumulated from first chain
      // Frame ordering after merge: sorted by loopIteration = [0, 1, 32, 33]
      // Frame 0 (I1): gyro=[100, -50, 30]
      expect(fd.gyro[0].values[0]).toBe(100);
      expect(fd.gyro[1].values[0]).toBe(-50);
      expect(fd.gyro[2].values[0]).toBe(30);
      // Frame 1 (P1): gyro=[105, -53, 32]
      expect(fd.gyro[0].values[1]).toBe(105);
      expect(fd.gyro[1].values[1]).toBe(-53);
      expect(fd.gyro[2].values[1]).toBe(32);
      // Frame 2 (I2): gyro=[200, -100, 60]
      expect(fd.gyro[0].values[2]).toBe(200);
      expect(fd.gyro[1].values[2]).toBe(-100);
      expect(fd.gyro[2].values[2]).toBe(60);
      // Frame 3 (P2): gyro=[203, -101, 64]
      expect(fd.gyro[0].values[3]).toBe(203);
      expect(fd.gyro[1].values[3]).toBe(-101);
      expect(fd.gyro[2].values[3]).toBe(64);
    });

    it('correctly parses realistic BF4.4 field layout with multiple encoding types', async () => {
      // Simulates a realistic Betaflight 4.4 BBL with all typical fields:
      // PID terms (axisP/I/D/F), rcCommand, setpoint, gyro, motor
      // Each group uses a different P-frame encoding to test alignment across
      // TAG2_3S32(7), TAG2_3SVARIABLE(10), TAG8_8SVB(6), TAG8_4S16(8), NULL(9)

      const parts: Buffer[] = [];

      // --- I-frame field definitions ---
      const iFieldNames = [
        'loopIteration', 'time',
        'axisP[0]', 'axisP[1]', 'axisP[2]',
        'axisI[0]', 'axisI[1]', 'axisI[2]',
        'axisD[0]', 'axisD[1]', 'axisD[2]',
        'axisF[0]', 'axisF[1]', 'axisF[2]',
        'rcCommand[0]', 'rcCommand[1]', 'rcCommand[2]', 'rcCommand[3]',
        'setpoint[0]', 'setpoint[1]', 'setpoint[2]', 'setpoint[3]',
        'gyroADC[0]', 'gyroADC[1]', 'gyroADC[2]',
        'motor[0]', 'motor[1]', 'motor[2]', 'motor[3]',
      ];
      // I-frame: loopIteration,time = UVB(1); everything else SVB(0) except motor = UVB(1)
      const iEncodings = [
        '1', '1',           // loopIteration, time
        '0', '0', '0',      // axisP
        '0', '0', '0',      // axisI
        '0', '0', '0',      // axisD
        '0', '0', '0',      // axisF
        '0', '0', '0', '0', // rcCommand
        '0', '0', '0', '0', // setpoint
        '0', '0', '0',      // gyroADC
        '1', '1', '1', '1', // motor
      ];
      const iPredictors = iFieldNames.map(() => '0'); // All ZERO
      const iSigned = [
        '0', '0',           // loopIteration, time
        '1', '1', '1',      // axisP
        '1', '1', '1',      // axisI
        '1', '1', '1',      // axisD
        '1', '1', '1',      // axisF
        '1', '1', '1', '1', // rcCommand
        '1', '1', '1', '1', // setpoint
        '1', '1', '1',      // gyroADC
        '0', '0', '0', '0', // motor
      ];

      // --- P-frame field definitions ---
      const pEncodings = [
        '9',                     // loopIteration: NULL (BF 9)
        '0',                     // time: SIGNED_VB
        '7', '7', '7',          // axisP: TAG2_3S32 (BF 7)
        '7', '7', '7',          // axisI: TAG2_3S32 (BF 7)
        '10', '10', '10',       // axisD: TAG2_3SVARIABLE (BF 10)
        '10', '10', '10',       // axisF: TAG2_3SVARIABLE (BF 10)
        '6', '6', '6', '6',     // rcCommand: TAG8_8SVB (BF 6)
        '6', '6', '6', '6',     // setpoint: TAG8_8SVB (BF 6)
        '7', '7', '7',          // gyroADC: TAG2_3S32 (BF 7)
        '8', '8', '8', '8',     // motor: TAG8_4S16 (BF 8)
      ];
      const pPredictors = [
        '6',                 // loopIteration: INCREMENT
        '2',                 // time: STRAIGHT_LINE
        '1', '1', '1',      // axisP: PREVIOUS
        '1', '1', '1',      // axisI: PREVIOUS
        '1', '1', '1',      // axisD: PREVIOUS
        '1', '1', '1',      // axisF: PREVIOUS
        '1', '1', '1', '1', // rcCommand: PREVIOUS
        '1', '1', '1', '1', // setpoint: PREVIOUS
        '1', '1', '1',      // gyroADC: PREVIOUS
        '1', '1', '1', '1', // motor: PREVIOUS
      ];

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
        `H Field P name:${iFieldNames.join(',')}`,
        `H Field P signed:${iSigned.join(',')}`,
        `H Field P predictor:${pPredictors.join(',')}`,
        `H Field P encoding:${pEncodings.join(',')}`,
      ];
      parts.push(Buffer.from(headers.join('\n') + '\n'));

      // --- I-frame with known absolute values ---
      const iGyro: [number, number, number] = [500, -300, 200];
      const iFrame: number[] = [0x49]; // 'I'
      pushUVB(iFrame, 0);    // loopIteration = 0
      pushUVB(iFrame, 0);    // time = 0
      pushSVB(iFrame, 40);   // axisP[0]
      pushSVB(iFrame, -30);  // axisP[1]
      pushSVB(iFrame, 20);   // axisP[2]
      pushSVB(iFrame, 15);   // axisI[0]
      pushSVB(iFrame, -10);  // axisI[1]
      pushSVB(iFrame, 5);    // axisI[2]
      pushSVB(iFrame, 25);   // axisD[0]
      pushSVB(iFrame, -18);  // axisD[1]
      pushSVB(iFrame, 12);   // axisD[2]
      pushSVB(iFrame, 100);  // axisF[0]
      pushSVB(iFrame, -80);  // axisF[1]
      pushSVB(iFrame, 60);   // axisF[2]
      pushSVB(iFrame, 50);   // rcCommand[0]
      pushSVB(iFrame, -30);  // rcCommand[1]
      pushSVB(iFrame, 20);   // rcCommand[2]
      pushSVB(iFrame, 1500); // rcCommand[3] (throttle)
      pushSVB(iFrame, 120);  // setpoint[0]
      pushSVB(iFrame, -90);  // setpoint[1]
      pushSVB(iFrame, 70);   // setpoint[2]
      pushSVB(iFrame, 1450); // setpoint[3]
      pushSVB(iFrame, iGyro[0]); // gyroADC[0] = 500
      pushSVB(iFrame, iGyro[1]); // gyroADC[1] = -300
      pushSVB(iFrame, iGyro[2]); // gyroADC[2] = 200
      pushUVB(iFrame, 1500); // motor[0]
      pushUVB(iFrame, 1480); // motor[1]
      pushUVB(iFrame, 1520); // motor[2]
      pushUVB(iFrame, 1490); // motor[3]
      parts.push(Buffer.from(iFrame));

      // --- P-frame gyro deltas (varying, non-zero) ---
      const gyroDeltas: [number, number, number][] = [
        [10, -5, 8],       // P1 → [510, -305, 208]
        [-20, 15, -3],     // P2 → [490, -290, 205]
        [50, -40, 25],     // P3 → [540, -330, 230]
        [-15, 10, -12],    // P4 → [525, -320, 218]
        [30, -25, 18],     // P5 → [555, -345, 236]
      ];

      // Constant deltas for other fields
      const axisPDelta: [number, number, number] = [2, -1, 1];
      const axisIDelta: [number, number, number] = [0, 0, 0];
      const axisDDelta: [number, number, number] = [3, -2, 1];
      const axisFDelta: [number, number, number] = [5, -3, 2];
      const rcCmdDelta: [number, number, number, number] = [1, -1, 0, 5];
      const setpointDelta: [number, number, number, number] = [2, -2, 1, -3];
      const motorDelta: [number, number, number, number] = [5, -3, 2, -1];

      // Track expected gyro for verification
      const expectedGyro: [number[], number[], number[]] = [
        [iGyro[0]], [iGyro[1]], [iGyro[2]],
      ];
      let prevGyro = [...iGyro];

      // Build 5 P-frames
      // Time predictor is STRAIGHT_LINE: result = decoded + (2*prev - prev2)
      // For constant 312us intervals:
      //   P1: prev=0, prev2=0(null) → prediction=0, decoded=312
      //   P2+: prediction = next expected time, decoded=0
      const timeDeltas = [312, 0, 0, 0, 0];

      for (let p = 0; p < 5; p++) {
        const pFrame: number[] = [0x50]; // 'P'

        // loopIteration: NULL encoding (BF 9), INCREMENT predictor
        // decoded=0 → result = 0 + prev + 1 (auto-increment)
        pushNull(pFrame, 0);

        // time: SIGNED_VB, STRAIGHT_LINE predictor
        pushSVB(pFrame, timeDeltas[p]);

        // axisP[0..2]: TAG2_3S32, PREVIOUS predictor
        pushTag2_3S32(pFrame, axisPDelta);

        // axisI[0..2]: TAG2_3S32, PREVIOUS predictor
        pushTag2_3S32(pFrame, axisIDelta);

        // axisD[0..2]: TAG2_3SVARIABLE, PREVIOUS predictor
        pushTag2_3SVariable(pFrame, axisDDelta);

        // axisF[0..2]: TAG2_3SVARIABLE, PREVIOUS predictor
        pushTag2_3SVariable(pFrame, axisFDelta);

        // rcCommand[0..3] + setpoint[0..3]: TAG8_8SVB group (8 values in one tag)
        // FrameParser treats 8 consecutive TAG8_8SVB fields as a single 8-value group
        pushTag8_8SVB(pFrame, [...rcCmdDelta, ...setpointDelta]);

        // gyroADC[0..2]: TAG2_3S32, PREVIOUS predictor
        const gDelta = gyroDeltas[p];
        pushTag2_3S32(pFrame, gDelta);

        // motor[0..3]: TAG8_4S16 (BF 8), PREVIOUS predictor
        pushTag8_4S16V2(pFrame, motorDelta);

        parts.push(Buffer.from(pFrame));

        // Compute expected absolute gyro after PREVIOUS predictor
        const expectedAbs: [number, number, number] = [
          prevGyro[0] + gDelta[0],
          prevGyro[1] + gDelta[1],
          prevGyro[2] + gDelta[2],
        ];
        expectedGyro[0].push(expectedAbs[0]);
        expectedGyro[1].push(expectedAbs[1]);
        expectedGyro[2].push(expectedAbs[2]);
        prevGyro = [...expectedAbs];
      }

      // End event
      parts.push(logEndBytes());

      // --- Parse and verify ---
      const result = await BlackboxParser.parse(Buffer.concat(parts));
      expect(result.success).toBe(true);

      const fd = result.sessions[0].flightData;
      expect(fd.frameCount).toBe(6); // 1 I-frame + 5 P-frames

      // Verify each gyro axis for each of the 6 frames
      for (let frame = 0; frame < 6; frame++) {
        expect(fd.gyro[0].values[frame]).toBe(expectedGyro[0][frame]); // roll
        expect(fd.gyro[1].values[frame]).toBe(expectedGyro[1][frame]); // pitch
        expect(fd.gyro[2].values[frame]).toBe(expectedGyro[2][frame]); // yaw
      }

      // Verify gyro values are non-zero and vary across frames
      for (let axis = 0; axis < 3; axis++) {
        const vals = Array.from(fd.gyro[axis].values);
        const allSame = vals.every(v => v === vals[0]);
        expect(allSame).toBe(false);
        const allZero = vals.every(v => v === 0);
        expect(allZero).toBe(false);
      }

      // Cross-check specific expected gyro values
      // I-frame: [500, -300, 200]
      expect(fd.gyro[0].values[0]).toBe(500);
      expect(fd.gyro[1].values[0]).toBe(-300);
      expect(fd.gyro[2].values[0]).toBe(200);
      // P1: [510, -305, 208]
      expect(fd.gyro[0].values[1]).toBe(510);
      expect(fd.gyro[1].values[1]).toBe(-305);
      expect(fd.gyro[2].values[1]).toBe(208);
      // P2: [490, -290, 205]
      expect(fd.gyro[0].values[2]).toBe(490);
      expect(fd.gyro[1].values[2]).toBe(-290);
      expect(fd.gyro[2].values[2]).toBe(205);
      // P3: [540, -330, 230]
      expect(fd.gyro[0].values[3]).toBe(540);
      expect(fd.gyro[1].values[3]).toBe(-330);
      expect(fd.gyro[2].values[3]).toBe(230);
      // P4: [525, -320, 218]
      expect(fd.gyro[0].values[4]).toBe(525);
      expect(fd.gyro[1].values[4]).toBe(-320);
      expect(fd.gyro[2].values[4]).toBe(218);
      // P5: [555, -345, 236]
      expect(fd.gyro[0].values[5]).toBe(555);
      expect(fd.gyro[1].values[5]).toBe(-345);
      expect(fd.gyro[2].values[5]).toBe(236);
    });
  });

  describe('LOG_END handling', () => {
    it('stops parsing at LOG_END event', async () => {
      // Build a BBL with 3 valid I-frames, then LOG_END, then 3 garbage I-frames
      const parts: Buffer[] = [];

      const headers = [
        'H Product:Blackbox flight data recorder by Nicholas Sherlock',
        'H Data version:2',
        'H I interval:32',
        'H P interval:1/2',
        'H Firmware type:Betaflight',
        'H Firmware revision:4.5.1',
        'H looptime:312',
        'H minthrottle:1070',
        'H vbatref:420',
        'H Field I name:loopIteration,time,gyroADC[0],gyroADC[1],gyroADC[2]',
        'H Field I signed:0,0,1,1,1',
        'H Field I predictor:0,0,0,0,0',
        'H Field I encoding:1,1,0,0,0',
        'H Field P name:loopIteration,time,gyroADC[0],gyroADC[1],gyroADC[2]',
        'H Field P signed:0,0,1,1,1',
        'H Field P predictor:1,1,1,1,1',
        'H Field P encoding:0,0,0,0,0',
      ];
      parts.push(Buffer.from(headers.join('\n') + '\n'));

      // 3 valid I-frames with small gyro values
      for (let f = 0; f < 3; f++) {
        const frame: number[] = [0x49];
        pushUVB(frame, f * 32);
        pushUVB(frame, f * 32 * 312);
        pushSVB(frame, 100 + f);
        pushSVB(frame, -(50 + f));
        pushSVB(frame, 30 + f);
        parts.push(Buffer.from(frame));
      }

      // LOG_END event with "End of log\0" string
      parts.push(logEndBytes());

      // Garbage after LOG_END: fake I-frames with extreme values
      for (let f = 0; f < 3; f++) {
        const frame: number[] = [0x49];
        pushUVB(frame, (f + 3) * 32);
        pushUVB(frame, (f + 3) * 32 * 312);
        pushSVB(frame, 17000); // absurdly high
        pushSVB(frame, -17000);
        pushSVB(frame, 17000);
        parts.push(Buffer.from(frame));
      }

      const result = await BlackboxParser.parse(Buffer.concat(parts));
      expect(result.success).toBe(true);
      expect(result.sessions).toHaveLength(1);

      const fd = result.sessions[0].flightData;
      // Only the 3 valid frames before LOG_END should be present
      expect(fd.frameCount).toBe(3);

      // Gyro values should be the small values, not the garbage
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(fd.gyro[0].values[i])).toBeLessThan(1000);
      }
    });

    it('handles session with no LOG_END (ends at boundary)', async () => {
      // Session without LOG_END should still parse normally
      const data = buildSyntheticBBL({ numIFrames: 5, includeGyro: true });
      // Remove the trailing LOG_END event (13 bytes: 0x45 + 0xFF + "End of log\0")
      const logEndSize = 2 + 'End of log\0'.length; // 13 bytes
      const withoutLogEnd = data.subarray(0, data.length - logEndSize);

      const result = await BlackboxParser.parse(withoutLogEnd);
      expect(result.success).toBe(true);
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].flightData.frameCount).toBe(5);
    });

    it('LOG_END preserves frames parsed before it', async () => {
      const data = buildSyntheticBBL({ numIFrames: 10, includeGyro: true });
      const result = await BlackboxParser.parse(data);

      expect(result.success).toBe(true);
      const fd = result.sessions[0].flightData;
      expect(fd.frameCount).toBe(10);

      // Verify specific gyro values are preserved
      expect(fd.gyro[0].values[0]).toBe(10); // first frame: 10 + 0
      expect(fd.gyro[1].values[0]).toBe(-5); // first frame: -(5 + 0)
    });

    it('ignores false LOG_END (0xFF without "End of log" string)', async () => {
      const parts: Buffer[] = [];

      const headers = [
        'H Product:Blackbox flight data recorder by Nicholas Sherlock',
        'H Data version:2',
        'H I interval:32',
        'H P interval:1/2',
        'H Firmware type:Betaflight',
        'H Firmware revision:4.5.1',
        'H looptime:312',
        'H minthrottle:1070',
        'H vbatref:420',
        'H Field I name:loopIteration,time,gyroADC[0],gyroADC[1],gyroADC[2]',
        'H Field I signed:0,0,1,1,1',
        'H Field I predictor:0,0,0,0,0',
        'H Field I encoding:1,1,0,0,0',
        'H Field P name:loopIteration,time,gyroADC[0],gyroADC[1],gyroADC[2]',
        'H Field P signed:0,0,1,1,1',
        'H Field P predictor:1,1,1,1,1',
        'H Field P encoding:0,0,0,0,0',
      ];
      parts.push(Buffer.from(headers.join('\n') + '\n'));

      // 2 valid I-frames
      for (let f = 0; f < 2; f++) {
        const frame: number[] = [0x49];
        pushUVB(frame, f * 32);
        pushUVB(frame, f * 32 * 312);
        pushSVB(frame, 100 + f);
        pushSVB(frame, -(50 + f));
        pushSVB(frame, 30 + f);
        parts.push(Buffer.from(frame));
      }

      // False LOG_END: event marker (0x45) + 0xFF but garbage instead of "End of log\0"
      parts.push(Buffer.from([0x45, 0xFF, 0xAB, 0xCD, 0xEF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

      // 2 more valid I-frames after the false LOG_END
      for (let f = 2; f < 4; f++) {
        const frame: number[] = [0x49];
        pushUVB(frame, f * 32);
        pushUVB(frame, f * 32 * 312);
        pushSVB(frame, 100 + f);
        pushSVB(frame, -(50 + f));
        pushSVB(frame, 30 + f);
        parts.push(Buffer.from(frame));
      }

      parts.push(logEndBytes());

      const result = await BlackboxParser.parse(Buffer.concat(parts));
      expect(result.success).toBe(true);

      // All 4 frames should be present — the false LOG_END was ignored
      expect(result.sessions[0].flightData.frameCount).toBe(4);
    });
  });

  describe('frame validation', () => {
    it('rejects frames exceeding MAX_FRAME_LENGTH (256 bytes)', async () => {
      const parts: Buffer[] = [];

      const headers = [
        'H Product:Blackbox flight data recorder by Nicholas Sherlock',
        'H Data version:2',
        'H I interval:32',
        'H P interval:1/2',
        'H Firmware type:Betaflight',
        'H Firmware revision:4.5.1',
        'H looptime:312',
        'H minthrottle:1070',
        'H vbatref:420',
        'H Field I name:loopIteration,time,gyroADC[0],gyroADC[1],gyroADC[2]',
        'H Field I signed:0,0,1,1,1',
        'H Field I predictor:0,0,0,0,0',
        'H Field I encoding:1,1,0,0,0',
        'H Field P name:loopIteration,time,gyroADC[0],gyroADC[1],gyroADC[2]',
        'H Field P signed:0,0,1,1,1',
        'H Field P predictor:1,1,1,1,1',
        'H Field P encoding:0,0,0,0,0',
      ];
      parts.push(Buffer.from(headers.join('\n') + '\n'));

      // Valid frame
      const f1: number[] = [0x49];
      pushUVB(f1, 0); pushUVB(f1, 0);
      pushSVB(f1, 100); pushSVB(f1, -50); pushSVB(f1, 30);
      parts.push(Buffer.from(f1));

      // Oversized "frame": I-marker + 300 bytes of padding before next marker
      const oversized = Buffer.alloc(301);
      oversized[0] = 0x49; // I-frame marker
      // Fill with non-marker bytes so resync doesn't stop early
      for (let i = 1; i < 300; i++) oversized[i] = 0x01;
      // Next valid I-frame marker at end
      oversized[300] = 0x49;
      parts.push(oversized);

      // Another valid frame after the oversized one
      const f3: number[] = [0x49];
      pushUVB(f3, 64); pushUVB(f3, 64 * 312);
      pushSVB(f3, 200); pushSVB(f3, -100); pushSVB(f3, 60);
      parts.push(Buffer.from(f3));

      parts.push(logEndBytes());

      const result = await BlackboxParser.parse(Buffer.concat(parts));
      expect(result.success).toBe(true);

      // The oversized frame should be rejected
      expect(result.sessions[0].corruptedFrameCount).toBeGreaterThanOrEqual(1);
    });

    it('accepts frames with large field values (no sensor threshold)', async () => {
      // Ensures that large sensor values (e.g. debug[], motor ERPM) pass through
      // — matching BF viewer which does NOT validate field value ranges
      const parts: Buffer[] = [];

      const headers = [
        'H Product:Blackbox flight data recorder by Nicholas Sherlock',
        'H Data version:2',
        'H I interval:32',
        'H P interval:1/2',
        'H Firmware type:Betaflight',
        'H Firmware revision:4.5.1',
        'H looptime:312',
        'H minthrottle:1070',
        'H vbatref:420',
        'H Field I name:loopIteration,time,gyroADC[0],gyroADC[1],gyroADC[2]',
        'H Field I signed:0,0,1,1,1',
        'H Field I predictor:0,0,0,0,0',
        'H Field I encoding:1,1,0,0,0',
        'H Field P name:loopIteration,time,gyroADC[0],gyroADC[1],gyroADC[2]',
        'H Field P signed:0,0,1,1,1',
        'H Field P predictor:1,1,1,1,1',
        'H Field P encoding:0,0,0,0,0',
      ];
      parts.push(Buffer.from(headers.join('\n') + '\n'));

      // Frame with gyro value 50000 (would be rejected by old threshold)
      const f1: number[] = [0x49];
      pushUVB(f1, 0); pushUVB(f1, 0);
      pushSVB(f1, 50000); pushSVB(f1, -50000); pushSVB(f1, 30000);
      parts.push(Buffer.from(f1));

      parts.push(logEndBytes());

      const result = await BlackboxParser.parse(Buffer.concat(parts));
      expect(result.success).toBe(true);

      const fd = result.sessions[0].flightData;
      expect(fd.frameCount).toBe(1);
      expect(fd.gyro[0].values[0]).toBe(50000);
      expect(fd.gyro[1].values[0]).toBe(-50000);
    });

    it('rejects frames with backward iteration jump', async () => {
      const parts: Buffer[] = [];

      const headers = [
        'H Product:Blackbox flight data recorder by Nicholas Sherlock',
        'H Data version:2',
        'H I interval:32',
        'H P interval:1/2',
        'H Firmware type:Betaflight',
        'H Firmware revision:4.5.1',
        'H looptime:312',
        'H minthrottle:1070',
        'H vbatref:420',
        'H Field I name:loopIteration,time,gyroADC[0],gyroADC[1],gyroADC[2]',
        'H Field I signed:0,0,1,1,1',
        'H Field I predictor:0,0,0,0,0',
        'H Field I encoding:1,1,0,0,0',
        'H Field P name:loopIteration,time,gyroADC[0],gyroADC[1],gyroADC[2]',
        'H Field P signed:0,0,1,1,1',
        'H Field P predictor:1,1,1,1,1',
        'H Field P encoding:0,0,0,0,0',
      ];
      parts.push(Buffer.from(headers.join('\n') + '\n'));

      // Frame 1: iteration=100
      const f1: number[] = [0x49];
      pushUVB(f1, 100); pushUVB(f1, 100 * 312);
      pushSVB(f1, 50); pushSVB(f1, -30); pushSVB(f1, 20);
      parts.push(Buffer.from(f1));

      // Frame 2: iteration=50 (backward jump - should be rejected)
      const f2: number[] = [0x49];
      pushUVB(f2, 50); pushUVB(f2, 50 * 312);
      pushSVB(f2, 60); pushSVB(f2, -40); pushSVB(f2, 25);
      parts.push(Buffer.from(f2));

      // Frame 3: iteration=132 (valid forward from frame 1)
      const f3: number[] = [0x49];
      pushUVB(f3, 132); pushUVB(f3, 132 * 312);
      pushSVB(f3, 70); pushSVB(f3, -50); pushSVB(f3, 30);
      parts.push(Buffer.from(f3));

      parts.push(logEndBytes());

      const result = await BlackboxParser.parse(Buffer.concat(parts));
      expect(result.success).toBe(true);

      const fd = result.sessions[0].flightData;
      expect(fd.frameCount).toBe(2);
      expect(result.sessions[0].corruptedFrameCount).toBeGreaterThanOrEqual(1);
    });

    it('stops after MAX_CONSECUTIVE_CORRUPT_FRAMES', async () => {
      const parts: Buffer[] = [];

      const headers = [
        'H Product:Blackbox flight data recorder by Nicholas Sherlock',
        'H Data version:2',
        'H I interval:32',
        'H P interval:1/2',
        'H Firmware type:Betaflight',
        'H Firmware revision:4.5.1',
        'H looptime:312',
        'H minthrottle:1070',
        'H vbatref:420',
        'H Field I name:loopIteration,time,gyroADC[0],gyroADC[1],gyroADC[2]',
        'H Field I signed:0,0,1,1,1',
        'H Field I predictor:0,0,0,0,0',
        'H Field I encoding:1,1,0,0,0',
        'H Field P name:loopIteration,time,gyroADC[0],gyroADC[1],gyroADC[2]',
        'H Field P signed:0,0,1,1,1',
        'H Field P predictor:1,1,1,1,1',
        'H Field P encoding:0,0,0,0,0',
      ];
      parts.push(Buffer.from(headers.join('\n') + '\n'));

      // One valid frame at iteration=10000
      const f1: number[] = [0x49];
      pushUVB(f1, 10000); pushUVB(f1, 10000 * 312);
      pushSVB(f1, 100); pushSVB(f1, -50); pushSVB(f1, 30);
      parts.push(Buffer.from(f1));

      // 200 "I-frames" with backward iteration (all corrupt — iteration goes backward)
      for (let i = 0; i < 200; i++) {
        const f: number[] = [0x49];
        pushUVB(f, 100 + i); // iteration < 10000 → backward jump → rejected
        pushUVB(f, (100 + i) * 312);
        pushSVB(f, 50); pushSVB(f, -50); pushSVB(f, 30);
        parts.push(Buffer.from(f));
      }

      const result = await BlackboxParser.parse(Buffer.concat(parts));
      expect(result.success).toBe(true);

      const session = result.sessions[0];
      expect(session.flightData.frameCount).toBe(1); // only the first valid frame
      expect(session.warnings.some(w => w.includes('consecutive corrupt'))).toBe(true);
    });
  });

  describe('stripFlashHeaders', () => {
    function buildBBLContent(): Buffer {
      // Minimal valid BBL content starting with 'H'
      return Buffer.from('H Product:Test\nH Data version:2\n');
    }

    it('returns clean BBL data unchanged (starts with H)', () => {
      const bbl = buildBBLContent();
      const result = BlackboxParser.stripFlashHeaders(bbl);
      expect(Buffer.compare(result, bbl)).toBe(0);
    });

    it('strips 7-byte response headers (BF 4.1+ with compression flag)', () => {
      const bblData = buildBBLContent();
      const chunkSize = 15;

      // Build 2 chunks with 7-byte headers: [4B addr][2B size][1B comp][data]
      const chunk1Data = bblData.subarray(0, chunkSize);
      const chunk2Data = bblData.subarray(chunkSize);

      const chunk1 = Buffer.alloc(7 + chunk1Data.length);
      chunk1.writeUInt32LE(0, 0);
      chunk1.writeUInt16LE(chunk1Data.length, 4);
      chunk1[6] = 0; // not compressed
      chunk1Data.copy(chunk1, 7);

      const chunk2 = Buffer.alloc(7 + chunk2Data.length);
      chunk2.writeUInt32LE(chunkSize, 0);
      chunk2.writeUInt16LE(chunk2Data.length, 4);
      chunk2[6] = 0;
      chunk2Data.copy(chunk2, 7);

      const concatenated = Buffer.concat([chunk1, chunk2]);
      const result = BlackboxParser.stripFlashHeaders(concatenated);

      expect(result.toString()).toBe(bblData.toString());
    });

    it('strips 6-byte response headers (no compression flag)', () => {
      const bblData = buildBBLContent();
      const chunkSize = 15;

      const chunk1Data = bblData.subarray(0, chunkSize);
      const chunk2Data = bblData.subarray(chunkSize);

      // 6-byte header: [4B addr][2B size][data]
      const chunk1 = Buffer.alloc(6 + chunk1Data.length);
      chunk1.writeUInt32LE(0, 0);
      chunk1.writeUInt16LE(chunk1Data.length, 4);
      chunk1Data.copy(chunk1, 6);

      const chunk2 = Buffer.alloc(6 + chunk2Data.length);
      chunk2.writeUInt32LE(chunkSize, 0);
      chunk2.writeUInt16LE(chunk2Data.length, 4);
      chunk2Data.copy(chunk2, 6);

      const concatenated = Buffer.concat([chunk1, chunk2]);
      const result = BlackboxParser.stripFlashHeaders(concatenated);

      expect(result.toString()).toBe(bblData.toString());
    });

    it('returns small buffers unchanged', () => {
      const small = Buffer.from([0x01, 0x02]);
      expect(BlackboxParser.stripFlashHeaders(small).length).toBe(2);
    });
  });
});
