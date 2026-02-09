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
  describe('signExtend2Bit', () => {
    it('positive 2-bit values are unchanged', () => {
      expect(ValueDecoder.signExtend2Bit(0)).toBe(0);
      expect(ValueDecoder.signExtend2Bit(1)).toBe(1);
    });

    it('negative 2-bit values are sign-extended', () => {
      expect(ValueDecoder.signExtend2Bit(0x02)).toBe(-2);
      expect(ValueDecoder.signExtend2Bit(0x03)).toBe(-1);
    });
  });

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

  describe('signExtend5Bit', () => {
    it('positive 5-bit values are unchanged', () => {
      expect(ValueDecoder.signExtend5Bit(0)).toBe(0);
      expect(ValueDecoder.signExtend5Bit(15)).toBe(15);
    });

    it('negative 5-bit values are sign-extended', () => {
      expect(ValueDecoder.signExtend5Bit(0x1F)).toBe(-1);
      expect(ValueDecoder.signExtend5Bit(0x10)).toBe(-16);
    });
  });

  describe('signExtend6Bit', () => {
    it('positive 6-bit values are unchanged', () => {
      expect(ValueDecoder.signExtend6Bit(0)).toBe(0);
      expect(ValueDecoder.signExtend6Bit(31)).toBe(31);
    });

    it('negative 6-bit values are sign-extended', () => {
      expect(ValueDecoder.signExtend6Bit(0x3F)).toBe(-1);
      expect(ValueDecoder.signExtend6Bit(0x20)).toBe(-32);
    });
  });

  describe('signExtend7Bit', () => {
    it('positive 7-bit values are unchanged', () => {
      expect(ValueDecoder.signExtend7Bit(0)).toBe(0);
      expect(ValueDecoder.signExtend7Bit(63)).toBe(63);
    });

    it('negative 7-bit values are sign-extended', () => {
      expect(ValueDecoder.signExtend7Bit(0x7F)).toBe(-1);
      expect(ValueDecoder.signExtend7Bit(0x40)).toBe(-64);
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

  describe('signExtend14Bit', () => {
    it('positive 14-bit values are unchanged', () => {
      expect(ValueDecoder.signExtend14Bit(0)).toBe(0);
      expect(ValueDecoder.signExtend14Bit(5)).toBe(5);
      expect(ValueDecoder.signExtend14Bit(8191)).toBe(8191); // 0x1FFF
    });

    it('negative 14-bit values are sign-extended', () => {
      // Bit 13 set → sign-extend
      expect(ValueDecoder.signExtend14Bit(0x2000)).toBe(-8192); // 0x2000 = 8192
      expect(ValueDecoder.signExtend14Bit(0x3FFF)).toBe(-1);    // 14-bit -1
      expect(ValueDecoder.signExtend14Bit(0x3FFE)).toBe(-2);    // 14-bit -2
    });
  });

  describe('NEG_14BIT (encoding 3)', () => {
    it('decodes zero UVB as zero', () => {
      // readUnsignedVB returns 0 → signExtend14Bit(0) = 0 → result = -0 = 0
      expect(decodeSingle(BBLEncoding.NEG_14BIT, [0x00])).toBe(0);
    });

    it('decodes small positive UVB as negated', () => {
      // readUnsignedVB returns 5 → signExtend14Bit(5) = 5 → result = -5
      expect(decodeSingle(BBLEncoding.NEG_14BIT, [0x05])).toBe(-5);
    });

    it('decodes multi-byte UVB', () => {
      // readUnsignedVB returns 127 → signExtend14Bit(127) = 127 → result = -127
      expect(decodeSingle(BBLEncoding.NEG_14BIT, [0x7F])).toBe(-127);
    });

    it('decodes value with 14-bit sign bit set', () => {
      // readUnsignedVB returns 0x2000 (8192) → signExtend14Bit = -8192 → result = 8192
      // 0x2000 in UVB = [0x80, 0x40] (7-bit LSB: 0x00 with continuation, then 0x40)
      expect(decodeSingle(BBLEncoding.NEG_14BIT, [0x80, 0x40])).toBe(8192);
    });

    it('decodes 14-bit -1 (0x3FFF) as 1', () => {
      // readUnsignedVB returns 0x3FFF → signExtend14Bit = -1 → result = 1
      // 0x3FFF in UVB = [0xFF, 0x7F]
      expect(decodeSingle(BBLEncoding.NEG_14BIT, [0xFF, 0x7F])).toBe(1);
    });
  });

  describe('TAG8_8SVB (encoding 6)', () => {
    it('decodes all zeros when tag is 0', () => {
      const result = decodeGroup(BBLEncoding.TAG8_8SVB, [0x00], 8);
      expect(result).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it('decodes selective non-zero values', () => {
      // Tag 0x05 = 0b00000101 → fields 0 and 2 are non-zero
      // Field 0: signed VB = 0x02 → 1
      // Field 2: signed VB = 0x01 → -1
      const result = decodeGroup(BBLEncoding.TAG8_8SVB, [0x05, 0x02, 0x01], 8);
      expect(result).toEqual([1, 0, -1, 0, 0, 0, 0, 0]);
    });

    it('decodes all 8 non-zero values', () => {
      // Tag 0xFF = all 8 bits set
      const result = decodeGroup(BBLEncoding.TAG8_8SVB, [
        0xFF, 0x02, 0x04, 0x06, 0x08, 0x0A, 0x0C, 0x0E, 0x10
      ], 8);
      expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('handles EOF on tag read', () => {
      const reader = new StreamReader(Buffer.alloc(0));
      const values = new Array(8).fill(99);
      ValueDecoder.decode(reader, BBLEncoding.TAG8_8SVB, values, 0);
      expect(values).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it('decodes single value (count=1) without tag byte', () => {
      // When only 1 field uses TAG8_8SVB, BF writes signedVB directly
      // ZigZag: unsigned 4 → signed 2
      const reader = new StreamReader(Buffer.from([0x04]));
      const values = [0];
      ValueDecoder.decodeGroup(reader, BBLEncoding.TAG8_8SVB, values, 1);
      expect(values[0]).toBe(2);
      expect(reader.offset).toBe(1); // consumed 1 byte (signedVB), not 2 (tag + signedVB)
    });

    it('decodes single negative value (count=1) without tag byte', () => {
      // ZigZag: unsigned 1 → signed -1
      const reader = new StreamReader(Buffer.from([0x01]));
      const values = [0];
      ValueDecoder.decodeGroup(reader, BBLEncoding.TAG8_8SVB, values, 1);
      expect(values[0]).toBe(-1);
    });

    it('decodes single zero value (count=1) without tag byte', () => {
      const reader = new StreamReader(Buffer.from([0x00]));
      const values = [0];
      ValueDecoder.decodeGroup(reader, BBLEncoding.TAG8_8SVB, values, 1);
      expect(values[0]).toBe(0);
    });
  });

  describe('TAG2_3S32 (encoding 7)', () => {
    it('decodes 2-bit packed values (selector 0)', () => {
      // Lead byte: selector=00, bits: [5:4]=01(=1), [3:2]=10(=-2), [1:0]=00(=0)
      // Binary: 00_01_10_00 = 0x18
      const result = decodeGroup(BBLEncoding.TAG2_3S32, [0x18], 3);
      expect(result).toEqual([1, -2, 0]);
    });

    it('decodes all-zero 2-bit values (selector 0, all bits 0)', () => {
      // Lead byte: 0x00 → selector=00, all fields = 0
      const result = decodeGroup(BBLEncoding.TAG2_3S32, [0x00], 3);
      expect(result).toEqual([0, 0, 0]);
    });

    it('decodes 4-bit packed values (selector 1)', () => {
      // Lead byte: selector=01, low nibble = value[0]
      // 0x43 = 0b01_00_0011 → selector=1, value[0] = 0x03 = 3
      // Extra byte 0x21: value[1] = 0x2 = 2, value[2] = 0x1 = 1
      const result = decodeGroup(BBLEncoding.TAG2_3S32, [0x43, 0x21], 3);
      expect(result).toEqual([3, 2, 1]);
    });

    it('decodes negative 4-bit packed values (selector 1)', () => {
      // 0x4E = 0b01_00_1110 → selector=1, value[0] = 0xE = -2
      // Extra byte 0xF8: value[1] = 0xF = -1, value[2] = 0x8 = -8
      const result = decodeGroup(BBLEncoding.TAG2_3S32, [0x4E, 0xF8], 3);
      expect(result).toEqual([-2, -1, -8]);
    });

    it('decodes 6-bit values (selector 2)', () => {
      // Lead byte: selector=10, low 6 bits = value[0]
      // 0x85 = 0b10_000101 → selector=2, value[0] = 0x05 = 5
      // Extra bytes: 0x03 → value[1] = 3, 0x3F → value[2] = -1 (6-bit sign extend)
      const result = decodeGroup(BBLEncoding.TAG2_3S32, [0x85, 0x03, 0x3F], 3);
      expect(result).toEqual([5, 3, -1]);
    });

    it('decodes variable-width values (selector 3)', () => {
      // Lead byte: selector=11, bottom 6 bits = 3×2-bit width selectors
      // Bits [1:0]=00 (S8), [3:2]=01 (S16LE), [5:4]=00 (S8)
      // 0xC4 = 0b11_00_01_00
      // Value[0]: S8 = 0x05 = 5
      // Value[1]: S16LE = [0xE8, 0x03] = 1000
      // Value[2]: S8 = 0xFE = -2
      const result = decodeGroup(BBLEncoding.TAG2_3S32, [0xC4, 0x05, 0xE8, 0x03, 0xFE], 3);
      expect(result).toEqual([5, 1000, -2]);
    });

    it('decodes variable-width S32 values (selector 3)', () => {
      // Bits [1:0]=11 (S32LE) for value[0], [3:2]=00 (S8) for value[1], [5:4]=00 (S8)
      // 0xC3 = 0b11_00_00_11
      const buf = Buffer.alloc(7);
      buf[0] = 0xC3;
      buf.writeInt32LE(100000, 1); // value[0] = 100000
      buf[5] = 0x01; // value[1] = 1
      buf[6] = 0x00; // value[2] = 0
      const result = decodeGroup(BBLEncoding.TAG2_3S32, [...buf], 3);
      expect(result).toEqual([100000, 1, 0]);
    });

    it('handles EOF on tag', () => {
      const reader = new StreamReader(Buffer.alloc(0));
      const values = [99, 99, 99];
      ValueDecoder.decode(reader, BBLEncoding.TAG2_3S32, values, 0);
      expect(values).toEqual([0, 0, 0]);
    });
  });

  describe('TAG8_4S16 (encoding 8)', () => {
    it('decodes all zeros (tag 0x00) — v2', () => {
      const result = decodeGroup(BBLEncoding.TAG8_4S16, [0x00], 4);
      expect(result).toEqual([0, 0, 0, 0]);
    });

    it('decodes 8-bit signed values (tag bits = 01) — v2', () => {
      // Tag = 0x05 = 0b00_00_01_01 → fields 0,1 are 8-bit (v2)
      const result = decodeGroup(BBLEncoding.TAG8_4S16, [0x05, 0xFF, 0x7F], 4);
      expect(result).toEqual([-1, 127, 0, 0]);
    });

    it('decodes 16-bit values (tag bits = 10) — v2', () => {
      // Tag = 0x02 = 0b00_00_00_10 → field 0 is 16-bit (v2)
      const buf = Buffer.alloc(3);
      buf[0] = 0x02;
      buf.writeInt16LE(-500, 1);
      const result = decodeGroup(BBLEncoding.TAG8_4S16, [...buf], 4);
      expect(result[0]).toBe(-500);
    });

    it('decodes signed VB values (tag bits = 11) — v2', () => {
      // Tag = 0x03 = 0b00_00_00_11 → field 0 is signed VB (v2)
      // signed VB 0x04 → 2
      const result = decodeGroup(BBLEncoding.TAG8_4S16, [0x03, 0x04], 4);
      expect(result[0]).toBe(2);
    });

    it('decodes mixed sizes — v2', () => {
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
      const result = decodeGroup(BBLEncoding.TAG8_4S16, [...buf], 4);
      expect(result).toEqual([2, 1000, -128, 0]);
    });

    it('decodes 4-bit signed values in v1 mode', () => {
      // Version 1: tag bits = 01 → 4-bit signed
      const reader = new StreamReader(Buffer.from([0x05, 0x03, 0x05]));
      const values = new Array(4).fill(0);
      ValueDecoder.decode(reader, BBLEncoding.TAG8_4S16, values, 0, 1);
      expect(values).toEqual([3, 5, 0, 0]);
    });

    it('decodes 8-bit signed values in v1 mode', () => {
      // Version 1: tag bits = 10 → 8-bit signed
      const reader = new StreamReader(Buffer.from([0x0A, 0xFF, 0x7F]));
      const values = new Array(4).fill(0);
      ValueDecoder.decode(reader, BBLEncoding.TAG8_4S16, values, 0, 1);
      expect(values).toEqual([-1, 127, 0, 0]);
    });
  });

  describe('NULL (encoding 9)', () => {
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

  describe('TAG2_3SVARIABLE (encoding 10)', () => {
    it('decodes 2-bit packed values (selector 0)', () => {
      // Same as TAG2_3S32 case 0
      // 0x18 = 0b00_01_10_00 → selector=0, values [1, -2, 0]
      const result = decodeGroup(BBLEncoding.TAG2_3SVARIABLE, [0x18], 3);
      expect(result).toEqual([1, -2, 0]);
    });

    it('decodes 5-5-4 bit values (selector 1)', () => {
      // Lead byte: selector=01, bits [5:1]=value[0](5-bit), bit[0]=MSB of value[1]
      // value[0] = (leadByte & 0x3E) >> 1
      // value[1] = ((leadByte & 0x01) << 4) | (byte1 >> 4)
      // value[2] = byte1 & 0x0F (4-bit sign extend)
      //
      // Want: value[0]=3, value[1]=5, value[2]=-2
      // value[0]=3 → (leadByte & 0x3E) >> 1 = 3 → leadByte & 0x3E = 0x06
      // value[1]=5 → ((leadByte & 0x01) << 4) | (byte1 >> 4) = 5
      //   If leadByte & 0x01 = 0, then byte1 >> 4 = 5 → byte1 = 0x5x
      // value[2]=-2 → byte1 & 0x0F = 0x0E (sign extend 4-bit: -2)
      //   byte1 = 0x5E
      // leadByte = 0x40 | 0x06 | 0x00 = 0x46 (selector=01)
      const result = decodeGroup(BBLEncoding.TAG2_3SVARIABLE, [0x46, 0x5E], 3);
      expect(result).toEqual([3, 5, -2]);
    });

    it('decodes 8-7-7 bit values (selector 2)', () => {
      // Lead byte: selector=10, value[0] uses 6 bits from lead + 2 from byte1
      // value[0] = signExtend8Bit(((leadByte & 0x3F) << 2) | (b1 >> 6))
      // value[1] = signExtend7Bit(((b1 & 0x3F) << 1) | (b2 >> 7))
      // value[2] = signExtend7Bit(b2 & 0x7F)
      //
      // Want: value[0]=10, value[1]=-5, value[2]=20
      // value[0]=10: ((lead & 0x3F) << 2) | (b1 >> 6) = 10
      //   lead & 0x3F = 10 >> 2 = 2 (if b1 >> 6 = 10 & 3 = 2)
      //   lead = 0x80 | 0x02 = 0x82
      //   b1 >> 6 = 2, so b1 top 2 bits = 10
      // value[1]=-5: ((b1 & 0x3F) << 1) | (b2 >> 7) = signExtend7Bit result = -5
      //   7-bit -5 = 0x7B (123). ((b1 & 0x3F) << 1) | (b2 >> 7) = 0x7B
      //   If b2 >> 7 = 1, then (b1 & 0x3F) << 1 = 0x7A = 122, b1 & 0x3F = 61 = 0x3D
      //   b1 = (2 << 6) | 0x3D = 0x80 | 0x3D = 0xBD
      // value[2]=20: b2 & 0x7F = 20, b2 >> 7 = 1 → b2 = 0x80 | 20 = 0x94
      const result = decodeGroup(BBLEncoding.TAG2_3SVARIABLE, [0x82, 0xBD, 0x94], 3);
      expect(result).toEqual([10, -5, 20]);
    });

    it('decodes variable-width values (selector 3)', () => {
      // Same as TAG2_3S32 case 3
      // 0xC4 = 0b11_00_01_00: value[0]=S8, value[1]=S16, value[2]=S8
      const result = decodeGroup(BBLEncoding.TAG2_3SVARIABLE, [0xC4, 0x05, 0xE8, 0x03, 0xFE], 3);
      expect(result).toEqual([5, 1000, -2]);
    });

    it('handles EOF on tag', () => {
      const reader = new StreamReader(Buffer.alloc(0));
      const values = [99, 99, 99];
      ValueDecoder.decode(reader, BBLEncoding.TAG2_3SVARIABLE, values, 0);
      expect(values).toEqual([0, 0, 0]);
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
      // TAG8_8SVB starting at index 2 — tag 0x03 → bits 0,1 set
      const reader = new StreamReader(Buffer.from([0x03, 0x02, 0x04]));
      const values = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      ValueDecoder.decode(reader, BBLEncoding.TAG8_8SVB, values, 2);
      expect(values).toEqual([0, 0, 1, 2, 0, 0, 0, 0, 0, 0]);
    });
  });

  describe('return value (field count)', () => {
    it('single-value encodings return 1', () => {
      const reader = new StreamReader(Buffer.from([0]));
      const values = [0];
      expect(ValueDecoder.decode(reader, BBLEncoding.SIGNED_VB, values, 0)).toBe(1);
    });

    it('TAG8_8SVB returns 8', () => {
      const reader = new StreamReader(Buffer.from([0x00]));
      const values = new Array(8).fill(0);
      expect(ValueDecoder.decode(reader, BBLEncoding.TAG8_8SVB, values, 0)).toBe(8);
    });

    it('TAG2_3S32 returns 3', () => {
      const reader = new StreamReader(Buffer.from([0x00]));
      const values = new Array(3).fill(0);
      expect(ValueDecoder.decode(reader, BBLEncoding.TAG2_3S32, values, 0)).toBe(3);
    });

    it('TAG8_4S16 returns 4', () => {
      const reader = new StreamReader(Buffer.from([0x00]));
      const values = new Array(4).fill(0);
      expect(ValueDecoder.decode(reader, BBLEncoding.TAG8_4S16, values, 0)).toBe(4);
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
