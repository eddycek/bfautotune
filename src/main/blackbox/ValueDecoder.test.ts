import { describe, it, expect } from 'vitest';
import { ValueDecoder } from './ValueDecoder';
import { StreamReader } from './StreamReader';
import { BBLEncoding } from '@shared/types/blackbox.types';

/** Helper to decode a single encoding from a byte array */
function decodeSingle(encoding: BBLEncoding, bytes: number[]): number {
  const reader = new StreamReader(Buffer.from(bytes));
  const values: number[] = [0];
  ValueDecoder.decode(reader, encoding, values, 0);
  return values[0];
}

/** Helper to decode a grouped encoding from a byte array */
function decodeGroup(encoding: BBLEncoding, bytes: number[], count: number): number[] {
  const reader = new StreamReader(Buffer.from(bytes));
  const values: number[] = new Array(count).fill(0);
  ValueDecoder.decode(reader, encoding, values, 0);
  return values;
}

describe('ValueDecoder', () => {
  describe('signExtend4', () => {
    it('positive 4-bit values are unchanged', () => {
      expect(ValueDecoder.signExtend4(0)).toBe(0);
      expect(ValueDecoder.signExtend4(7)).toBe(7);
    });

    it('negative 4-bit values are sign-extended', () => {
      expect(ValueDecoder.signExtend4(0x0F)).toBe(-1);
      expect(ValueDecoder.signExtend4(0x08)).toBe(-8);
      expect(ValueDecoder.signExtend4(0x0E)).toBe(-2);
    });

    it('handles -1 input as 0', () => {
      expect(ValueDecoder.signExtend4(-1)).toBe(0);
    });
  });

  describe('signExtend8', () => {
    it('positive 8-bit values are unchanged', () => {
      expect(ValueDecoder.signExtend8(0)).toBe(0);
      expect(ValueDecoder.signExtend8(127)).toBe(127);
    });

    it('negative 8-bit values are sign-extended', () => {
      expect(ValueDecoder.signExtend8(0xFF)).toBe(-1);
      expect(ValueDecoder.signExtend8(0x80)).toBe(-128);
      expect(ValueDecoder.signExtend8(0xFE)).toBe(-2);
    });

    it('handles -1 input as 0', () => {
      expect(ValueDecoder.signExtend8(-1)).toBe(0);
    });
  });

  describe('SIGNED_VB (encoding 0)', () => {
    it('decodes zero', () => {
      expect(decodeSingle(BBLEncoding.SIGNED_VB, [0x00])).toBe(0);
    });

    it('decodes positive value', () => {
      // zigzag: 1 → unsigned 2
      expect(decodeSingle(BBLEncoding.SIGNED_VB, [0x02])).toBe(1);
    });

    it('decodes negative value', () => {
      // zigzag: -1 → unsigned 1
      expect(decodeSingle(BBLEncoding.SIGNED_VB, [0x01])).toBe(-1);
    });
  });

  describe('UNSIGNED_VB (encoding 1)', () => {
    it('decodes zero', () => {
      expect(decodeSingle(BBLEncoding.UNSIGNED_VB, [0x00])).toBe(0);
    });

    it('decodes single-byte value', () => {
      expect(decodeSingle(BBLEncoding.UNSIGNED_VB, [42])).toBe(42);
    });

    it('decodes multi-byte value', () => {
      expect(decodeSingle(BBLEncoding.UNSIGNED_VB, [0xAC, 0x02])).toBe(300);
    });
  });

  describe('NEG_14BIT (encoding 2)', () => {
    it('decodes to -(value + 1)', () => {
      // readUnsignedVB returns 0 → result = -(0 + 1) = -1
      expect(decodeSingle(BBLEncoding.NEG_14BIT, [0x00])).toBe(-1);
    });

    it('decodes larger value', () => {
      // readUnsignedVB returns 5 → result = -(5 + 1) = -6
      expect(decodeSingle(BBLEncoding.NEG_14BIT, [0x05])).toBe(-6);
    });

    it('decodes multi-byte value', () => {
      // readUnsignedVB returns 127 → result = -128
      expect(decodeSingle(BBLEncoding.NEG_14BIT, [0x7F])).toBe(-128);
    });
  });

  describe('TAG8_8SVB (encoding 3)', () => {
    it('decodes all zeros when tag is 0', () => {
      const result = decodeGroup(BBLEncoding.TAG8_8SVB, [0x00], 4);
      expect(result).toEqual([0, 0, 0, 0]);
    });

    it('decodes selective non-zero values', () => {
      // Tag 0x05 = 0b0101 → fields 0 and 2 are non-zero
      // Field 0: signed VB = 0x02 → 1
      // Field 2: signed VB = 0x01 → -1
      const result = decodeGroup(BBLEncoding.TAG8_8SVB, [0x05, 0x02, 0x01], 4);
      expect(result).toEqual([1, 0, -1, 0]);
    });

    it('decodes all non-zero values', () => {
      // Tag 0x0F = 0b1111 → all 4 fields non-zero
      const result = decodeGroup(BBLEncoding.TAG8_8SVB, [0x0F, 0x02, 0x04, 0x06, 0x08], 4);
      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('handles EOF on tag read', () => {
      const reader = new StreamReader(Buffer.alloc(0));
      const values = [99, 99, 99, 99];
      ValueDecoder.decode(reader, BBLEncoding.TAG8_8SVB, values, 0);
      expect(values).toEqual([0, 0, 0, 0]);
    });
  });

  describe('TAG2_3S32 (encoding 4)', () => {
    it('decodes all zeros (tag 0)', () => {
      const result = decodeGroup(BBLEncoding.TAG2_3S32, [0x00], 3);
      expect(result).toEqual([0, 0, 0]);
    });

    it('decodes 4-bit packed values (tag 1)', () => {
      // Tag = 0x01 (tagVal = 1)
      // byte0 = 0x21 → low nibble 0x1 = 1, high nibble 0x2 = 2
      // byte1 = 0x03 → low nibble 0x3 = 3
      const result = decodeGroup(BBLEncoding.TAG2_3S32, [0x01, 0x21, 0x03], 3);
      expect(result).toEqual([1, 2, 3]);
    });

    it('decodes negative 4-bit packed values (tag 1)', () => {
      // Tag = 0x01 (tagVal = 1)
      // byte0 = 0xFE → low nibble 0xE = -2 (sign-extended), high nibble 0xF = -1
      // byte1 = 0x08 → low nibble 0x8 = -8
      const result = decodeGroup(BBLEncoding.TAG2_3S32, [0x01, 0xFE, 0x08], 3);
      expect(result).toEqual([-2, -1, -8]);
    });

    it('decodes 16-bit values (tag 2)', () => {
      // Tag = 0x02 (tagVal = 2)
      // Three 16-bit LE signed values: 1000, -500, 0
      const buf = Buffer.alloc(7);
      buf[0] = 0x02;
      buf.writeInt16LE(1000, 1);
      buf.writeInt16LE(-500, 3);
      buf.writeInt16LE(0, 5);
      const result = decodeGroup(BBLEncoding.TAG2_3S32, [...buf], 3);
      expect(result).toEqual([1000, -500, 0]);
    });

    it('decodes full signed VB values (tag 3)', () => {
      // Tag = 0x03 (tagVal = 3)
      // Three signed VB: 0x04=2, 0x03=-2, 0x00=0
      const result = decodeGroup(BBLEncoding.TAG2_3S32, [0x03, 0x04, 0x03, 0x00], 3);
      expect(result).toEqual([2, -2, 0]);
    });

    it('handles EOF on tag', () => {
      const reader = new StreamReader(Buffer.alloc(0));
      const values = [99, 99, 99];
      ValueDecoder.decode(reader, BBLEncoding.TAG2_3S32, values, 0);
      expect(values).toEqual([0, 0, 0]);
    });
  });

  describe('TAG8_4S16_V1 (encoding 5)', () => {
    it('decodes all zeros (tag 0x00)', () => {
      const result = decodeGroup(BBLEncoding.TAG8_4S16_V1, [0x00], 4);
      expect(result).toEqual([0, 0, 0, 0]);
    });

    it('decodes 4-bit signed values (tag bits = 01)', () => {
      // Tag = 0x05 = 0b00_00_01_01 → fields 0,1 are 4-bit
      // Field 0: byte 3 → sign extend 4-bit = 3
      // Field 1: byte 5 → sign extend 4-bit = 5
      const result = decodeGroup(BBLEncoding.TAG8_4S16_V1, [0x05, 0x03, 0x05], 4);
      expect(result).toEqual([3, 5, 0, 0]);
    });

    it('decodes 8-bit signed values (tag bits = 10)', () => {
      // Tag = 0x0A = 0b00_00_10_10 → fields 0,1 are 8-bit
      // Field 0: byte 0xFF → -1
      // Field 1: byte 0x7F → 127
      const result = decodeGroup(BBLEncoding.TAG8_4S16_V1, [0x0A, 0xFF, 0x7F], 4);
      expect(result).toEqual([-1, 127, 0, 0]);
    });

    it('decodes 16-bit values (tag bits = 11)', () => {
      // Tag = 0x03 = 0b00_00_00_11 → field 0 is 16-bit
      const buf = Buffer.alloc(3);
      buf[0] = 0x03;
      buf.writeInt16LE(1000, 1);
      const result = decodeGroup(BBLEncoding.TAG8_4S16_V1, [...buf], 4);
      expect(result[0]).toBe(1000);
    });
  });

  describe('TAG8_4S16_V2 (encoding 6)', () => {
    it('decodes all zeros (tag 0x00)', () => {
      const result = decodeGroup(BBLEncoding.TAG8_4S16_V2, [0x00], 4);
      expect(result).toEqual([0, 0, 0, 0]);
    });

    it('decodes 8-bit signed values (tag bits = 01)', () => {
      // Tag = 0x05 = 0b00_00_01_01 → fields 0,1 are 8-bit (v2)
      const result = decodeGroup(BBLEncoding.TAG8_4S16_V2, [0x05, 0xFF, 0x7F], 4);
      expect(result).toEqual([-1, 127, 0, 0]);
    });

    it('decodes 16-bit values (tag bits = 10)', () => {
      // Tag = 0x02 = 0b00_00_00_10 → field 0 is 16-bit (v2)
      const buf = Buffer.alloc(3);
      buf[0] = 0x02;
      buf.writeInt16LE(-500, 1);
      const result = decodeGroup(BBLEncoding.TAG8_4S16_V2, [...buf], 4);
      expect(result[0]).toBe(-500);
    });

    it('decodes signed VB values (tag bits = 11)', () => {
      // Tag = 0x03 = 0b00_00_00_11 → field 0 is signed VB (v2)
      // signed VB 0x04 → 2
      const result = decodeGroup(BBLEncoding.TAG8_4S16_V2, [0x03, 0x04], 4);
      expect(result[0]).toBe(2);
    });

    it('decodes mixed sizes', () => {
      // Tag = 0x1B = 0b00_01_10_11
      //   field 0: 11 → signed VB
      //   field 1: 10 → 16-bit
      //   field 2: 01 → 8-bit
      //   field 3: 00 → zero
      const buf = Buffer.alloc(6);
      buf[0] = 0x1B;
      buf[1] = 0x04; // signed VB = 2
      buf.writeInt16LE(1000, 2); // 16-bit = 1000
      buf[4] = 0x80; // 8-bit = -128
      const result = decodeGroup(BBLEncoding.TAG8_4S16_V2, [...buf], 4);
      expect(result).toEqual([2, 1000, -128, 0]);
    });
  });

  describe('NULL (encoding 7)', () => {
    it('always returns zero', () => {
      expect(decodeSingle(BBLEncoding.NULL, [])).toBe(0);
    });

    it('does not consume any bytes', () => {
      const reader = new StreamReader(Buffer.from([0xFF]));
      const values = [99];
      ValueDecoder.decode(reader, BBLEncoding.NULL, values, 0);
      expect(values[0]).toBe(0);
      expect(reader.offset).toBe(0); // no bytes consumed
    });
  });

  describe('TAG2_3SVARIABLE (encoding 8)', () => {
    it('decodes all zeros (tag 0)', () => {
      const result = decodeGroup(BBLEncoding.TAG2_3SVARIABLE, [0x00], 3);
      expect(result).toEqual([0, 0, 0]);
    });

    it('decodes 8-bit signed values (tag 1)', () => {
      // Tag = 0x01, three 8-bit signed values
      const result = decodeGroup(BBLEncoding.TAG2_3SVARIABLE, [0x01, 0x7F, 0x80, 0x00], 3);
      expect(result).toEqual([127, -128, 0]);
    });

    it('decodes 16-bit signed values (tag 2)', () => {
      const buf = Buffer.alloc(7);
      buf[0] = 0x02;
      buf.writeInt16LE(2000, 1);
      buf.writeInt16LE(-1000, 3);
      buf.writeInt16LE(500, 5);
      const result = decodeGroup(BBLEncoding.TAG2_3SVARIABLE, [...buf], 3);
      expect(result).toEqual([2000, -1000, 500]);
    });

    it('decodes signed VB values (tag 3)', () => {
      // Tag = 0x03, three signed VBs
      const result = decodeGroup(BBLEncoding.TAG2_3SVARIABLE, [0x03, 0x04, 0x03, 0x00], 3);
      expect(result).toEqual([2, -2, 0]);
    });
  });

  describe('TAGGED_16 (encoding 9)', () => {
    it('decodes inline value when bit 0 is clear', () => {
      // Tag = 0x0A = 0b00001010 → bit 0 = 0, value = signExtend8(0x0A) >> 1 = 5
      expect(decodeSingle(BBLEncoding.TAGGED_16, [0x0A])).toBe(5);
    });

    it('decodes zero inline', () => {
      // Tag = 0x00 → value = 0 >> 1 = 0
      expect(decodeSingle(BBLEncoding.TAGGED_16, [0x00])).toBe(0);
    });

    it('decodes negative inline value', () => {
      // Tag = 0xFE = 0b11111110 → bit 0 = 0, value = signExtend8(0xFE) >> 1 = -1
      expect(decodeSingle(BBLEncoding.TAGGED_16, [0xFE])).toBe(-1);
    });

    it('decodes 16-bit value when bit 0 is set', () => {
      // Tag = 0x01 → bit 0 = 1, read 16-bit
      const buf = Buffer.alloc(3);
      buf[0] = 0x01;
      buf.writeInt16LE(5000, 1);
      expect(decodeSingle(BBLEncoding.TAGGED_16, [...buf])).toBe(5000);
    });

    it('decodes negative 16-bit value', () => {
      const buf = Buffer.alloc(3);
      buf[0] = 0x01;
      buf.writeInt16LE(-10000, 1);
      expect(decodeSingle(BBLEncoding.TAGGED_16, [...buf])).toBe(-10000);
    });
  });

  describe('field index offset', () => {
    it('writes to correct index for single-value encodings', () => {
      const reader = new StreamReader(Buffer.from([42]));
      const values = [0, 0, 0];
      ValueDecoder.decode(reader, BBLEncoding.UNSIGNED_VB, values, 2);
      expect(values).toEqual([0, 0, 42]);
    });

    it('writes to correct indices for grouped encodings', () => {
      // TAG8_8SVB starting at index 2
      const reader = new StreamReader(Buffer.from([0x03, 0x02, 0x04]));
      const values = [0, 0, 0, 0, 0, 0];
      ValueDecoder.decode(reader, BBLEncoding.TAG8_8SVB, values, 2);
      expect(values).toEqual([0, 0, 1, 2, 0, 0]);
    });
  });

  describe('return value (field count)', () => {
    it('single-value encodings return 1', () => {
      const reader = new StreamReader(Buffer.from([0]));
      const values = [0];
      expect(ValueDecoder.decode(reader, BBLEncoding.SIGNED_VB, values, 0)).toBe(1);
    });

    it('TAG8_8SVB returns 4', () => {
      const reader = new StreamReader(Buffer.from([0x00]));
      const values = new Array(4).fill(0);
      expect(ValueDecoder.decode(reader, BBLEncoding.TAG8_8SVB, values, 0)).toBe(4);
    });

    it('TAG2_3S32 returns 3', () => {
      const reader = new StreamReader(Buffer.from([0x00]));
      const values = new Array(3).fill(0);
      expect(ValueDecoder.decode(reader, BBLEncoding.TAG2_3S32, values, 0)).toBe(3);
    });

    it('TAG8_4S16_V2 returns 4', () => {
      const reader = new StreamReader(Buffer.from([0x00]));
      const values = new Array(4).fill(0);
      expect(ValueDecoder.decode(reader, BBLEncoding.TAG8_4S16_V2, values, 0)).toBe(4);
    });

    it('TAG2_3SVARIABLE returns 3', () => {
      const reader = new StreamReader(Buffer.from([0x00]));
      const values = new Array(3).fill(0);
      expect(ValueDecoder.decode(reader, BBLEncoding.TAG2_3SVARIABLE, values, 0)).toBe(3);
    });

    it('NULL returns 1', () => {
      const reader = new StreamReader(Buffer.from([]));
      const values = [0];
      expect(ValueDecoder.decode(reader, BBLEncoding.NULL, values, 0)).toBe(1);
    });
  });
});
