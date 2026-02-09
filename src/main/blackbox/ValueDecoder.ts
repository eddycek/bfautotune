import { BBLEncoding } from '@shared/types/blackbox.types';
import { StreamReader } from './StreamReader';

/**
 * Decodes field values from binary BBL data using BF standard encoding types.
 *
 * Some encodings are "grouped" - they read a tag byte first, then decode
 * multiple values at once (e.g., TAG2_3S32 decodes 3 values, TAG8_4S16
 * decodes 4 values). For these, the caller must pass the output array
 * and starting index so the decoder can write multiple values.
 *
 * Encoding IDs match Betaflight standard (0,1,3,6,7,8,9,10).
 *
 * References:
 * - betaflight/src/main/blackbox/blackbox.c
 * - betaflight/blackbox-log-viewer flightlog_parser.js
 */
export class ValueDecoder {
  /**
   * Decode a single value (or group of values) using the specified encoding.
   *
   * For single-value encodings: writes one value at values[fieldIdx].
   * For grouped encodings: writes multiple values starting at values[fieldIdx].
   *
   * @param version - Data version from header (1 or 2), affects TAG8_4S16 behavior
   * @returns The number of fields consumed (1 for single-value, N for grouped).
   */
  static decode(
    reader: StreamReader,
    encoding: BBLEncoding,
    values: number[],
    fieldIdx: number,
    version: number = 2
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

      case BBLEncoding.TAG8_4S16:
        return ValueDecoder.readTag8_4S16(reader, values, fieldIdx, version >= 2 ? 2 : 1);

      case BBLEncoding.NULL:
        values[fieldIdx] = 0;
        return 1;

      case BBLEncoding.TAG2_3SVARIABLE:
        return ValueDecoder.readTag2_3SVariable(reader, values, fieldIdx);

      default:
        values[fieldIdx] = 0;
        return 1;
    }
  }

  /**
   * Decode a group of values with a known count.
   *
   * Unlike decode(), this method respects the actual number of consecutive
   * fields sharing the same encoding. This is critical for TAG8_8SVB where
   * fewer than 8 consecutive fields may share the encoding — reading all 8
   * bits of the tag byte would consume bytes belonging to subsequent fields.
   *
   * @param count - Actual number of values to decode (may be less than the
   *                encoding's natural group size)
   */
  static decodeGroup(
    reader: StreamReader,
    encoding: BBLEncoding,
    values: number[],
    count: number,
    version: number = 2
  ): number {
    switch (encoding) {
      case BBLEncoding.TAG8_8SVB:
        return ValueDecoder.readTag8_8SVB(reader, values, 0, count);

      case BBLEncoding.TAG2_3S32:
        return ValueDecoder.readTag2_3S32(reader, values, 0);

      case BBLEncoding.TAG8_4S16:
        return ValueDecoder.readTag8_4S16(reader, values, 0, version >= 2 ? 2 : 1);

      case BBLEncoding.TAG2_3SVARIABLE:
        return ValueDecoder.readTag2_3SVariable(reader, values, 0);

      default:
        return count;
    }
  }

  /**
   * Encoding 3: NEG_14BIT
   * Read an unsigned VB, sign-extend from 14 bits, then negate.
   * Used for fields stored as masked 14-bit values (e.g., vbatLatest).
   *
   * BF encoder writes: (value) & 0x3FFF as unsigned VB
   * BF decoder reads:  -signExtend14Bit(readUnsignedVB())
   */
  private static readNeg14Bit(reader: StreamReader): number {
    const unsigned = reader.readUnsignedVB();
    return -ValueDecoder.signExtend14Bit(unsigned) || 0; // avoid -0
  }

  /** Sign-extend a 14-bit value to 32-bit (two's complement from bit 13) */
  static signExtend14Bit(value: number): number {
    return (value & 0x2000) ? (value | 0xFFFFC000) | 0 : value;
  }

  /**
   * Encoding 6: TAG8_8SVB
   * Read a tag byte where each bit indicates whether the corresponding
   * field has a non-zero value. For each set bit, read a signed VB.
   *
   * Special case: when count == 1, the BF encoder writes a signedVB directly
   * without a tag byte. The decoder must match this behavior.
   *
   * @param count - Number of values to read (default 8). When fewer than 8
   *   consecutive fields share this encoding, only the first `count` bits
   *   of the tag byte are used. This matches BF viewer behavior.
   */
  private static readTag8_8SVB(
    reader: StreamReader,
    values: number[],
    fieldIdx: number,
    count: number = 8
  ): number {
    // BF encoder/decoder special case: single value = signedVB, no tag byte
    if (count === 1) {
      values[fieldIdx] = reader.readSignedVB();
      return 1;
    }

    const tag = reader.readByte();
    if (tag === -1) {
      for (let i = 0; i < count; i++) values[fieldIdx + i] = 0;
      return count;
    }

    for (let i = 0; i < count; i++) {
      if (tag & (1 << i)) {
        values[fieldIdx + i] = reader.readSignedVB();
      } else {
        values[fieldIdx + i] = 0;
      }
    }
    return count;
  }

  /**
   * Encoding 7: TAG2_3S32
   * Top 2 bits of lead byte select the sub-encoding for 3 values:
   *   00 = 2-bit fields packed in lead byte (0 extra bytes)
   *   01 = 4-bit fields (1 extra byte)
   *   10 = 6-bit fields (2 extra bytes)
   *   11 = variable width per value (lead byte bottom 6 bits = 3×2-bit selectors)
   *
   * Reference: betaflight/blackbox-log-viewer flightlog_parser.js
   */
  private static readTag2_3S32(
    reader: StreamReader,
    values: number[],
    fieldIdx: number
  ): number {
    const leadByte = reader.readByte();
    if (leadByte === -1) {
      values[fieldIdx] = 0;
      values[fieldIdx + 1] = 0;
      values[fieldIdx + 2] = 0;
      return 3;
    }

    const selector = leadByte >> 6;

    switch (selector) {
      case 0: {
        // 2-bit fields packed in lead byte bits [5:4], [3:2], [1:0]
        values[fieldIdx] = ValueDecoder.signExtend2Bit((leadByte >> 4) & 0x03);
        values[fieldIdx + 1] = ValueDecoder.signExtend2Bit((leadByte >> 2) & 0x03);
        values[fieldIdx + 2] = ValueDecoder.signExtend2Bit(leadByte & 0x03);
        break;
      }

      case 1: {
        // 4-bit fields: value[0] from lead byte low nibble, value[1,2] from extra byte
        const byte1 = reader.readByte();
        if (byte1 === -1) {
          values[fieldIdx] = 0;
          values[fieldIdx + 1] = 0;
          values[fieldIdx + 2] = 0;
          break;
        }
        values[fieldIdx] = ValueDecoder.signExtend4(leadByte & 0x0F);
        values[fieldIdx + 1] = ValueDecoder.signExtend4(byte1 >> 4);
        values[fieldIdx + 2] = ValueDecoder.signExtend4(byte1 & 0x0F);
        break;
      }

      case 2: {
        // 6-bit fields: value[0] from lead byte, value[1,2] from extra bytes
        const b1 = reader.readByte();
        const b2 = reader.readByte();
        if (b1 === -1 || b2 === -1) {
          values[fieldIdx] = 0;
          values[fieldIdx + 1] = 0;
          values[fieldIdx + 2] = 0;
          break;
        }
        values[fieldIdx] = ValueDecoder.signExtend6Bit(leadByte & 0x3F);
        values[fieldIdx + 1] = ValueDecoder.signExtend6Bit(b1 & 0x3F);
        values[fieldIdx + 2] = ValueDecoder.signExtend6Bit(b2 & 0x3F);
        break;
      }

      case 3: {
        // Variable width: bottom 6 bits of lead byte = 3×2-bit width selectors
        // Bits [1:0] → value[0], bits [3:2] → value[1], bits [5:4] → value[2]
        // 00=S8, 01=S16LE, 10=S24LE, 11=S32LE
        for (let i = 0; i < 3; i++) {
          const widthBits = (leadByte >> (i * 2)) & 0x03;
          values[fieldIdx + i] = ValueDecoder.readVariableWidth(reader, widthBits);
        }
        break;
      }
    }

    return 3;
  }

  /**
   * Encoding 8: TAG8_4S16 (v1 and v2)
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
   * Encoding 10: TAG2_3SVARIABLE
   * Top 2 bits of lead byte select the sub-encoding for 3 values:
   *   00 = 2-bit fields packed in lead byte (same as TAG2_3S32 case 0)
   *   01 = 5-5-4 bit fields (1 extra byte)
   *   10 = 8-7-7 bit fields (2 extra bytes)
   *   11 = variable width per value (same as TAG2_3S32 case 3)
   *
   * Reference: betaflight/blackbox-log-viewer flightlog_parser.js
   */
  private static readTag2_3SVariable(
    reader: StreamReader,
    values: number[],
    fieldIdx: number
  ): number {
    const leadByte = reader.readByte();
    if (leadByte === -1) {
      values[fieldIdx] = 0;
      values[fieldIdx + 1] = 0;
      values[fieldIdx + 2] = 0;
      return 3;
    }

    const selector = leadByte >> 6;

    switch (selector) {
      case 0: {
        // 2-bit fields — same as TAG2_3S32 case 0
        values[fieldIdx] = ValueDecoder.signExtend2Bit((leadByte >> 4) & 0x03);
        values[fieldIdx + 1] = ValueDecoder.signExtend2Bit((leadByte >> 2) & 0x03);
        values[fieldIdx + 2] = ValueDecoder.signExtend2Bit(leadByte & 0x03);
        break;
      }

      case 1: {
        // 5-5-4 bit fields (1 extra byte, 14 bits total from lead+extra)
        const byte1 = reader.readByte();
        if (byte1 === -1) {
          values[fieldIdx] = 0;
          values[fieldIdx + 1] = 0;
          values[fieldIdx + 2] = 0;
          break;
        }
        values[fieldIdx] = ValueDecoder.signExtend5Bit((leadByte & 0x3E) >> 1);
        values[fieldIdx + 1] = ValueDecoder.signExtend5Bit(((leadByte & 0x01) << 4) | (byte1 >> 4));
        values[fieldIdx + 2] = ValueDecoder.signExtend4(byte1 & 0x0F);
        break;
      }

      case 2: {
        // 8-7-7 bit fields (2 extra bytes, 22 bits total)
        const b1 = reader.readByte();
        const b2 = reader.readByte();
        if (b1 === -1 || b2 === -1) {
          values[fieldIdx] = 0;
          values[fieldIdx + 1] = 0;
          values[fieldIdx + 2] = 0;
          break;
        }
        values[fieldIdx] = ValueDecoder.signExtend8Bit(((leadByte & 0x3F) << 2) | (b1 >> 6));
        values[fieldIdx + 1] = ValueDecoder.signExtend7Bit(((b1 & 0x3F) << 1) | (b2 >> 7));
        values[fieldIdx + 2] = ValueDecoder.signExtend7Bit(b2 & 0x7F);
        break;
      }

      case 3: {
        // Variable width — same as TAG2_3S32 case 3
        for (let i = 0; i < 3; i++) {
          const widthBits = (leadByte >> (i * 2)) & 0x03;
          values[fieldIdx + i] = ValueDecoder.readVariableWidth(reader, widthBits);
        }
        break;
      }
    }

    return 3;
  }

  /**
   * Read a variable-width signed value based on 2-bit width selector.
   * Used by TAG2_3S32 case 3 and TAG2_3SVARIABLE case 3.
   *   00 = S8 (1 byte), 01 = S16LE (2 bytes), 10 = S24LE (3 bytes), 11 = S32LE (4 bytes)
   */
  private static readVariableWidth(reader: StreamReader, widthBits: number): number {
    switch (widthBits) {
      case 0: return ValueDecoder.signExtend8(reader.readByte());
      case 1: return reader.readS16();
      case 2: return ValueDecoder.readS24LE(reader);
      case 3: return reader.readS32();
      default: return 0;
    }
  }

  /**
   * Read a 24-bit signed little-endian integer from the stream.
   */
  private static readS24LE(reader: StreamReader): number {
    const b0 = reader.readByte();
    const b1 = reader.readByte();
    const b2 = reader.readByte();
    if (b0 === -1 || b1 === -1 || b2 === -1) return 0;
    const unsigned = b0 | (b1 << 8) | (b2 << 16);
    // Sign extend from 24 bits
    return (unsigned & 0x800000) ? (unsigned | 0xFF000000) | 0 : unsigned;
  }

  /** Sign-extend a 2-bit value to 32-bit */
  static signExtend2Bit(value: number): number {
    return (value & 0x02) ? (value | 0xFFFFFFFC) | 0 : value;
  }

  /** Sign-extend a 4-bit value to 32-bit */
  static signExtend4(value: number): number {
    if (value === -1) return 0;
    return (value & 0x08) ? (value | 0xFFFFFFF0) | 0 : value;
  }

  /** Sign-extend a 5-bit value to 32-bit */
  static signExtend5Bit(value: number): number {
    return (value & 0x10) ? (value | 0xFFFFFFE0) | 0 : value;
  }

  /** Sign-extend a 6-bit value to 32-bit */
  static signExtend6Bit(value: number): number {
    return (value & 0x20) ? (value | 0xFFFFFFC0) | 0 : value;
  }

  /** Sign-extend a 7-bit value to 32-bit */
  static signExtend7Bit(value: number): number {
    return (value & 0x40) ? (value | 0xFFFFFF80) | 0 : value;
  }

  /** Sign-extend an 8-bit value to 32-bit */
  static signExtend8(value: number): number {
    if (value === -1) return 0;
    return (value & 0x80) ? (value | 0xFFFFFF00) | 0 : value;
  }

  /** Sign-extend an 8-bit value to 32-bit (no EOF guard, for computed values) */
  static signExtend8Bit(value: number): number {
    return (value & 0x80) ? (value | 0xFFFFFF00) | 0 : value & 0xFF;
  }
}
