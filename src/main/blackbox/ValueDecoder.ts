import { BBLEncoding } from '@shared/types/blackbox.types';
import { StreamReader } from './StreamReader';

/**
 * Decodes field values from binary BBL data using one of 10 encoding types.
 *
 * Some encodings are "grouped" - they read a tag byte first, then decode
 * multiple values at once (e.g., TAG2_3S32 decodes 3 values, TAG8_4S16
 * decodes 4 values). For these, the caller must pass the output array
 * and starting index so the decoder can write multiple values.
 *
 * References:
 * - blackbox_decode.c in cleanflight/betaflight
 * - blackbox-log-viewer decoder.js
 */
export class ValueDecoder {
  /**
   * Decode a single value (or group of values) using the specified encoding.
   *
   * For single-value encodings: writes one value at values[fieldIdx].
   * For grouped encodings: writes multiple values starting at values[fieldIdx].
   *
   * @returns The number of fields consumed (1 for single-value, N for grouped).
   */
  static decode(
    reader: StreamReader,
    encoding: BBLEncoding,
    values: number[],
    fieldIdx: number
  ): number {
    switch (encoding) {
      case BBLEncoding.SIGNED_VB:
        values[fieldIdx] = reader.readSignedVB();
        return 1;

      case BBLEncoding.UNSIGNED_VB:
        values[fieldIdx] = reader.readUnsignedVB();
        return 1;

      case BBLEncoding.NEG_14BIT:
        values[fieldIdx] = ValueDecoder.readNeg14Bit(reader);
        return 1;

      case BBLEncoding.TAG8_8SVB:
        return ValueDecoder.readTag8_8SVB(reader, values, fieldIdx);

      case BBLEncoding.TAG2_3S32:
        return ValueDecoder.readTag2_3S32(reader, values, fieldIdx);

      case BBLEncoding.TAG8_4S16_V1:
        return ValueDecoder.readTag8_4S16(reader, values, fieldIdx, 1);

      case BBLEncoding.TAG8_4S16_V2:
        return ValueDecoder.readTag8_4S16(reader, values, fieldIdx, 2);

      case BBLEncoding.NULL:
        values[fieldIdx] = 0;
        return 1;

      case BBLEncoding.TAG2_3SVARIABLE:
        return ValueDecoder.readTag2_3SVariable(reader, values, fieldIdx);

      case BBLEncoding.TAGGED_16:
        values[fieldIdx] = ValueDecoder.readTagged16(reader);
        return 1;

      default:
        values[fieldIdx] = 0;
        return 1;
    }
  }

  /**
   * Encoding 2: NEG_14BIT
   * Read a signed VB and negate + subtract 1.
   * Used for fields that are typically negative (like D-term).
   */
  private static readNeg14Bit(reader: StreamReader): number {
    const unsigned = reader.readUnsignedVB();
    return -(unsigned + 1);
  }

  /**
   * Encoding 3: TAG8_8SVB
   * Read a tag byte where each bit indicates whether the corresponding
   * field has a non-zero value. For each set bit, read a signed VB.
   * Produces up to 4 values.
   */
  private static readTag8_8SVB(
    reader: StreamReader,
    values: number[],
    fieldIdx: number
  ): number {
    const tag = reader.readByte();
    if (tag === -1) {
      for (let i = 0; i < 4; i++) values[fieldIdx + i] = 0;
      return 4;
    }

    for (let i = 0; i < 4; i++) {
      if (tag & (1 << i)) {
        values[fieldIdx + i] = reader.readSignedVB();
      } else {
        values[fieldIdx + i] = 0;
      }
    }
    return 4;
  }

  /**
   * Encoding 4: TAG2_3S32
   * Read a 2-bit tag that selects the sub-encoding for 3 values:
   *   00 = all three are zero
   *   01 = all three fit in a single byte each (4-bit + 4-bit + 4-bit packed, or similar)
   *   10 = all three fit in 16-bit each
   *   11 = all three are full signed VB
   *
   * This is the most common P-frame encoding for PID terms.
   */
  private static readTag2_3S32(
    reader: StreamReader,
    values: number[],
    fieldIdx: number
  ): number {
    const tag = reader.readByte();
    if (tag === -1) {
      values[fieldIdx] = 0;
      values[fieldIdx + 1] = 0;
      values[fieldIdx + 2] = 0;
      return 3;
    }

    // The tag byte contains 4 x 2-bit values (we only use 3)
    // For each group of 3 fields sharing this encoding, the 2-bit tag says:
    const tagVal = tag & 0x03;

    switch (tagVal) {
      case 0:
        // All three values are zero
        values[fieldIdx] = 0;
        values[fieldIdx + 1] = 0;
        values[fieldIdx + 2] = 0;
        break;

      case 1: {
        // Values encoded in next 2 bytes using 4-4-4 bit packing + sign extension
        const byte0 = reader.readByte();
        const byte1 = reader.readByte();
        if (byte0 === -1 || byte1 === -1) {
          values[fieldIdx] = 0;
          values[fieldIdx + 1] = 0;
          values[fieldIdx + 2] = 0;
          break;
        }
        // Pack: byte0 low nibble = val0, byte0 high nibble = val1, byte1 low nibble = val2
        values[fieldIdx] = ValueDecoder.signExtend4(byte0 & 0x0F);
        values[fieldIdx + 1] = ValueDecoder.signExtend4(byte0 >> 4);
        values[fieldIdx + 2] = ValueDecoder.signExtend4(byte1 & 0x0F);
        break;
      }

      case 2: {
        // Values are 16-bit signed, packed into 6 bytes
        values[fieldIdx] = reader.readS16();
        values[fieldIdx + 1] = reader.readS16();
        values[fieldIdx + 2] = reader.readS16();
        break;
      }

      case 3:
        // Values are full signed VB
        values[fieldIdx] = reader.readSignedVB();
        values[fieldIdx + 1] = reader.readSignedVB();
        values[fieldIdx + 2] = reader.readSignedVB();
        break;
    }

    return 3;
  }

  /**
   * Encoding 5/6: TAG8_4S16 (v1 and v2)
   * Read a tag byte where pairs of bits indicate the size of each of 4 values:
   *   00 = value is zero
   *   01 = value is 4-bit signed (v1) or 8-bit signed (v2)
   *   10 = value is 8-bit signed (v1) or 16-bit signed (v2)
   *   11 = value is 16-bit signed (v1) or full signed VB (v2)
   */
  private static readTag8_4S16(
    reader: StreamReader,
    values: number[],
    fieldIdx: number,
    version: 1 | 2
  ): number {
    const tag = reader.readByte();
    if (tag === -1) {
      for (let i = 0; i < 4; i++) values[fieldIdx + i] = 0;
      return 4;
    }

    for (let i = 0; i < 4; i++) {
      const bits = (tag >> (i * 2)) & 0x03;

      if (version === 1) {
        switch (bits) {
          case 0: values[fieldIdx + i] = 0; break;
          case 1: values[fieldIdx + i] = ValueDecoder.signExtend4(reader.readByte()); break;
          case 2: values[fieldIdx + i] = ValueDecoder.signExtend8(reader.readByte()); break;
          case 3: values[fieldIdx + i] = reader.readS16(); break;
        }
      } else {
        // Version 2
        switch (bits) {
          case 0: values[fieldIdx + i] = 0; break;
          case 1: values[fieldIdx + i] = ValueDecoder.signExtend8(reader.readByte()); break;
          case 2: values[fieldIdx + i] = reader.readS16(); break;
          case 3: values[fieldIdx + i] = reader.readSignedVB(); break;
        }
      }
    }

    return 4;
  }

  /**
   * Encoding 8: TAG2_3SVARIABLE
   * Similar to TAG2_3S32 but with different size tiers.
   * 2-bit tag per group of 3 values:
   *   00 = all zero
   *   01 = all 8-bit signed
   *   10 = all 16-bit signed
   *   11 = all signed VB
   */
  private static readTag2_3SVariable(
    reader: StreamReader,
    values: number[],
    fieldIdx: number
  ): number {
    const tag = reader.readByte();
    if (tag === -1) {
      values[fieldIdx] = 0;
      values[fieldIdx + 1] = 0;
      values[fieldIdx + 2] = 0;
      return 3;
    }

    const tagVal = tag & 0x03;

    switch (tagVal) {
      case 0:
        values[fieldIdx] = 0;
        values[fieldIdx + 1] = 0;
        values[fieldIdx + 2] = 0;
        break;

      case 1:
        values[fieldIdx] = ValueDecoder.signExtend8(reader.readByte());
        values[fieldIdx + 1] = ValueDecoder.signExtend8(reader.readByte());
        values[fieldIdx + 2] = ValueDecoder.signExtend8(reader.readByte());
        break;

      case 2:
        values[fieldIdx] = reader.readS16();
        values[fieldIdx + 1] = reader.readS16();
        values[fieldIdx + 2] = reader.readS16();
        break;

      case 3:
        values[fieldIdx] = reader.readSignedVB();
        values[fieldIdx + 1] = reader.readSignedVB();
        values[fieldIdx + 2] = reader.readSignedVB();
        break;
    }

    return 3;
  }

  /**
   * Encoding 9: TAGGED_16
   * Read a tag byte. If bit 0 is set, value is a 16-bit signed int.
   * Otherwise, value = tag byte >> 1 (with sign extension if bit 7 set).
   * Used for loopIteration in P-frames.
   */
  private static readTagged16(reader: StreamReader): number {
    const tag = reader.readByte();
    if (tag === -1) return 0;

    if (tag & 0x01) {
      // Full 16-bit value follows
      return reader.readS16();
    }
    // Value is in the tag byte itself (shifted right by 1, sign extended)
    return ValueDecoder.signExtend8(tag) >> 1;
  }

  /** Sign-extend a 4-bit value to 32-bit */
  static signExtend4(value: number): number {
    if (value === -1) return 0;
    return (value & 0x08) ? (value | 0xFFFFFFF0) | 0 : value;
  }

  /** Sign-extend an 8-bit value to 32-bit */
  static signExtend8(value: number): number {
    if (value === -1) return 0;
    return (value & 0x80) ? (value | 0xFFFFFF00) | 0 : value;
  }
}
