import { describe, it, expect } from 'vitest';
import { FrameParser } from './FrameParser';
import { StreamReader } from './StreamReader';
import { BBLEncoding, BBLPredictor } from '@shared/types/blackbox.types';
import type { BBLFieldDefinition, BBLLogHeader } from '@shared/types/blackbox.types';

function makeFieldDef(
  name: string,
  encoding: BBLEncoding,
  predictor: BBLPredictor,
  signed = false
): BBLFieldDefinition {
  return { name, encoding, predictor, signed };
}

function makeHeader(overrides: Partial<BBLLogHeader> = {}): BBLLogHeader {
  return {
    product: '', dataVersion: 2, firmwareType: 'Betaflight',
    firmwareRevision: '', firmwareDate: '', boardInformation: '',
    logStartDatetime: '', craftName: '',
    iFieldDefs: [], pFieldDefs: [], sFieldDefs: [], gFieldDefs: [],
    iInterval: 32, pInterval: 1, pDenom: 2,
    minthrottle: 1070, maxthrottle: 2000, motorOutputRange: 2047,
    vbatref: 420, looptime: 312, gyroScale: 0.0305176,
    rawHeaders: new Map(),
    ...overrides,
  };
}

describe('FrameParser', () => {
  describe('parseIFrame', () => {
    it('decodes simple unsigned VB fields', () => {
      const header = makeHeader({
        iFieldDefs: [
          makeFieldDef('loopIteration', BBLEncoding.UNSIGNED_VB, BBLPredictor.ZERO),
          makeFieldDef('time', BBLEncoding.UNSIGNED_VB, BBLPredictor.ZERO),
        ],
      });
      const parser = new FrameParser(header);
      // loopIteration=10, time=5000 (VB: [0x88, 0x27])
      const reader = new StreamReader(Buffer.from([10, 0x88, 0x27]));
      const values = parser.parseIFrame(reader);
      expect(values).toEqual([10, 5000]);
    });

    it('decodes signed VB fields', () => {
      const header = makeHeader({
        iFieldDefs: [
          makeFieldDef('axisP[0]', BBLEncoding.SIGNED_VB, BBLPredictor.ZERO, true),
          makeFieldDef('axisP[1]', BBLEncoding.SIGNED_VB, BBLPredictor.ZERO, true),
        ],
      });
      const parser = new FrameParser(header);
      // zigzag: 1 → 2 (pos), -1 → 1
      const reader = new StreamReader(Buffer.from([0x02, 0x01]));
      const values = parser.parseIFrame(reader);
      expect(values).toEqual([1, -1]);
    });

    it('applies MINTHROTTLE predictor for I-frame', () => {
      const header = makeHeader({
        minthrottle: 1070,
        iFieldDefs: [
          makeFieldDef('motor[0]', BBLEncoding.UNSIGNED_VB, BBLPredictor.MINTHROTTLE),
        ],
      });
      const parser = new FrameParser(header);
      // decoded = 30, result = 30 + 1070 = 1100
      const reader = new StreamReader(Buffer.from([30]));
      const values = parser.parseIFrame(reader);
      expect(values).toEqual([1100]);
    });

    it('applies MOTOR_0 predictor in I-frame (uses current motor[0])', () => {
      const header = makeHeader({
        minthrottle: 1070,
        iFieldDefs: [
          makeFieldDef('motor[0]', BBLEncoding.UNSIGNED_VB, BBLPredictor.MINTHROTTLE),
          makeFieldDef('motor[1]', BBLEncoding.UNSIGNED_VB, BBLPredictor.MOTOR_0),
        ],
      });
      const parser = new FrameParser(header);
      // motor[0]: 30 + 1070 = 1100
      // motor[1]: 5 + motor[0](1100) = 1105
      const reader = new StreamReader(Buffer.from([30, 5]));
      const values = parser.parseIFrame(reader);
      expect(values).toEqual([1100, 1105]);
    });

    it('handles grouped TAG2_3S32 encoding across 3 fields', () => {
      const header = makeHeader({
        iFieldDefs: [
          makeFieldDef('axisP[0]', BBLEncoding.TAG2_3S32, BBLPredictor.ZERO, true),
          makeFieldDef('axisP[1]', BBLEncoding.TAG2_3S32, BBLPredictor.ZERO, true),
          makeFieldDef('axisP[2]', BBLEncoding.TAG2_3S32, BBLPredictor.ZERO, true),
        ],
      });
      const parser = new FrameParser(header);
      // Tag 0x01 (4-bit packed): byte0=0x21 → [1, 2], byte1=0x03 → [3]
      const reader = new StreamReader(Buffer.from([0x01, 0x21, 0x03]));
      const values = parser.parseIFrame(reader);
      expect(values).toEqual([1, 2, 3]);
    });

    it('handles grouped TAG8_4S16_V2 encoding across 4 fields', () => {
      const header = makeHeader({
        iFieldDefs: [
          makeFieldDef('gyroADC[0]', BBLEncoding.TAG8_4S16_V2, BBLPredictor.ZERO, true),
          makeFieldDef('gyroADC[1]', BBLEncoding.TAG8_4S16_V2, BBLPredictor.ZERO, true),
          makeFieldDef('gyroADC[2]', BBLEncoding.TAG8_4S16_V2, BBLPredictor.ZERO, true),
          makeFieldDef('extraField', BBLEncoding.TAG8_4S16_V2, BBLPredictor.ZERO, true),
        ],
      });
      const parser = new FrameParser(header);
      // Tag 0x00 → all zero
      const reader = new StreamReader(Buffer.from([0x00]));
      const values = parser.parseIFrame(reader);
      expect(values).toEqual([0, 0, 0, 0]);
    });

    it('handles NULL encoding', () => {
      const header = makeHeader({
        iFieldDefs: [
          makeFieldDef('unused', BBLEncoding.NULL, BBLPredictor.ZERO),
          makeFieldDef('time', BBLEncoding.UNSIGNED_VB, BBLPredictor.ZERO),
        ],
      });
      const parser = new FrameParser(header);
      const reader = new StreamReader(Buffer.from([42]));
      const values = parser.parseIFrame(reader);
      expect(values).toEqual([0, 42]);
    });
  });

  describe('parsePFrame', () => {
    it('applies PREVIOUS predictor', () => {
      const header = makeHeader({
        pFieldDefs: [
          makeFieldDef('axisP[0]', BBLEncoding.SIGNED_VB, BBLPredictor.PREVIOUS, true),
        ],
      });
      const parser = new FrameParser(header);
      const previous = [500];
      // decoded = 0x04 → signed 2, result = 2 + 500 = 502
      const reader = new StreamReader(Buffer.from([0x04]));
      const values = parser.parsePFrame(reader, previous, null);
      expect(values).toEqual([502]);
    });

    it('applies INCREMENT predictor', () => {
      const header = makeHeader({
        pFieldDefs: [
          makeFieldDef('loopIteration', BBLEncoding.TAGGED_16, BBLPredictor.INCREMENT),
        ],
      });
      const parser = new FrameParser(header);
      const previous = [100];
      // TAGGED_16: tag=0x00 → inline value 0, then INCREMENT: 0 + 100 + 1 = 101
      const reader = new StreamReader(Buffer.from([0x00]));
      const values = parser.parsePFrame(reader, previous, null);
      expect(values).toEqual([101]);
    });

    it('applies STRAIGHT_LINE predictor', () => {
      const header = makeHeader({
        pFieldDefs: [
          makeFieldDef('time', BBLEncoding.SIGNED_VB, BBLPredictor.STRAIGHT_LINE),
        ],
      });
      const parser = new FrameParser(header);
      const previous = [200];
      const previous2 = [100];
      // predicted = 2*200 - 100 = 300, decoded = 0 → result = 300
      const reader = new StreamReader(Buffer.from([0x00]));
      const values = parser.parsePFrame(reader, previous, previous2);
      expect(values).toEqual([300]);
    });

    it('applies MINTHROTTLE predictor in P-frame (delta from previous)', () => {
      const header = makeHeader({
        minthrottle: 1070,
        pFieldDefs: [
          makeFieldDef('motor[0]', BBLEncoding.SIGNED_VB, BBLPredictor.MINTHROTTLE),
        ],
      });
      const parser = new FrameParser(header);
      const previous = [1500];
      // decoded = 0x02 → 1, result = 1 + 1500 = 1501
      const reader = new StreamReader(Buffer.from([0x02]));
      const values = parser.parsePFrame(reader, previous, null);
      expect(values).toEqual([1501]);
    });

    it('decodes grouped encoding with predictor in P-frame', () => {
      const header = makeHeader({
        pFieldDefs: [
          makeFieldDef('axisP[0]', BBLEncoding.TAG2_3S32, BBLPredictor.PREVIOUS, true),
          makeFieldDef('axisP[1]', BBLEncoding.TAG2_3S32, BBLPredictor.PREVIOUS, true),
          makeFieldDef('axisP[2]', BBLEncoding.TAG2_3S32, BBLPredictor.PREVIOUS, true),
        ],
      });
      const parser = new FrameParser(header);
      const previous = [100, 200, 300];
      // Tag 0x00 → all zero deltas → values = previous = [100, 200, 300]
      const reader = new StreamReader(Buffer.from([0x00]));
      const values = parser.parsePFrame(reader, previous, null);
      expect(values).toEqual([100, 200, 300]);
    });
  });

  describe('parseSFrame', () => {
    it('parses slow frame fields', () => {
      const header = makeHeader({
        sFieldDefs: [
          makeFieldDef('flightModeFlags', BBLEncoding.UNSIGNED_VB, BBLPredictor.ZERO),
          makeFieldDef('stateFlags', BBLEncoding.UNSIGNED_VB, BBLPredictor.ZERO),
        ],
      });
      const parser = new FrameParser(header);
      const reader = new StreamReader(Buffer.from([0x03, 0x01]));
      const values = parser.parseSFrame(reader);
      expect(values).toEqual([3, 1]);
    });
  });

  describe('mixed field encodings in a realistic frame', () => {
    it('parses frame with mixed single and grouped encodings', () => {
      const header = makeHeader({
        iFieldDefs: [
          makeFieldDef('loopIteration', BBLEncoding.UNSIGNED_VB, BBLPredictor.ZERO),
          makeFieldDef('time', BBLEncoding.UNSIGNED_VB, BBLPredictor.ZERO),
          // 3 fields using TAG2_3S32 (grouped)
          makeFieldDef('axisP[0]', BBLEncoding.TAG2_3S32, BBLPredictor.ZERO, true),
          makeFieldDef('axisP[1]', BBLEncoding.TAG2_3S32, BBLPredictor.ZERO, true),
          makeFieldDef('axisP[2]', BBLEncoding.TAG2_3S32, BBLPredictor.ZERO, true),
          // Single field
          makeFieldDef('vbatLatest', BBLEncoding.UNSIGNED_VB, BBLPredictor.ZERO),
        ],
      });
      const parser = new FrameParser(header);
      // loopIteration=1, time=100, TAG2_3S32 tag=0x00 (all zero), vbatLatest=42
      const reader = new StreamReader(Buffer.from([1, 100, 0x00, 42]));
      const values = parser.parseIFrame(reader);
      expect(values).toEqual([1, 100, 0, 0, 0, 42]);
    });

    it('handles EOF mid-frame gracefully', () => {
      const header = makeHeader({
        iFieldDefs: [
          makeFieldDef('f1', BBLEncoding.UNSIGNED_VB, BBLPredictor.ZERO),
          makeFieldDef('f2', BBLEncoding.UNSIGNED_VB, BBLPredictor.ZERO),
          makeFieldDef('f3', BBLEncoding.UNSIGNED_VB, BBLPredictor.ZERO),
        ],
      });
      const parser = new FrameParser(header);
      // Only 1 byte, but 3 fields expected
      const reader = new StreamReader(Buffer.from([42]));
      const values = parser.parseIFrame(reader);
      expect(values[0]).toBe(42);
      // Remaining fields stay at 0
      expect(values[1]).toBe(0);
      expect(values[2]).toBe(0);
    });
  });
});
