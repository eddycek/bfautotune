import { BBLEncoding } from '@shared/types/blackbox.types';
import type { BBLFieldDefinition, BBLLogHeader } from '@shared/types/blackbox.types';
import { StreamReader } from './StreamReader';
import { ValueDecoder } from './ValueDecoder';
import { PredictorApplier } from './PredictorApplier';

/**
 * Fixed-group encodings: always consume exactly N fields from the field list,
 * regardless of those fields' declared encodings. The BF encoder writes N
 * consecutive field values as one binary group. This matches BF viewer behavior
 * where TAG2_3S32/TAG2_3SVARIABLE always advance the field index by 3.
 */
const FIXED_GROUP_SIZE: Map<BBLEncoding, number> = new Map([
  [BBLEncoding.TAG2_3S32, 3],        // 1 lead byte → 3 values
  [BBLEncoding.TAG2_3SVARIABLE, 3],  // 1 lead byte → 3 values
]);

/**
 * Variable-group encodings: consume N consecutive fields that share the same
 * encoding. The actual group size depends on how many fields in a row use the
 * encoding. TAG8_8SVB reads one tag byte with N relevant bits (up to 8).
 * TAG8_4S16 reads one tag byte encoding exactly 4 values.
 */
const VARIABLE_GROUP_SIZE: Map<BBLEncoding, number> = new Map([
  [BBLEncoding.TAG8_8SVB, 8],   // 1 tag byte → up to 8 values
  [BBLEncoding.TAG8_4S16, 4],   // 1 tag byte → 4 values
]);

/**
 * Parses complete I-frames and P-frames by coordinating value decoding
 * and predictor application across all fields in a frame.
 *
 * Two grouping strategies matching BF viewer behavior:
 *
 * 1. Fixed-group (TAG2_3S32, TAG2_3SVARIABLE): always read 3 values from
 *    the stream and advance field index by 3. The next 2 fields after the
 *    tagged field are consumed by the group regardless of their encoding.
 *
 * 2. Variable-group (TAG8_8SVB, TAG8_4S16): count consecutive fields with
 *    the same encoding and process them in sub-groups of the natural size.
 */
export class FrameParser {
  private header: BBLLogHeader;
  private motor0IFieldIdx: number;
  private motor0PFieldIdx: number;

  constructor(header: BBLLogHeader) {
    this.header = header;
    this.motor0IFieldIdx = this.findFieldIndex(header.iFieldDefs, 'motor[0]');
    this.motor0PFieldIdx = this.findFieldIndex(header.pFieldDefs, 'motor[0]');
  }

  /**
   * Parse an I-frame (intra frame) with absolute values.
   * Returns the decoded field values array.
   */
  parseIFrame(reader: StreamReader): number[] {
    return this.parseFrame(
      reader,
      this.header.iFieldDefs,
      true,
      null,
      null,
      this.motor0IFieldIdx
    );
  }

  /**
   * Parse a P-frame (inter frame) with delta values.
   * Requires previous frame(s) for predictor application.
   */
  parsePFrame(
    reader: StreamReader,
    previous: number[],
    previous2: number[] | null
  ): number[] {
    return this.parseFrame(
      reader,
      this.header.pFieldDefs,
      false,
      previous,
      previous2,
      this.motor0PFieldIdx
    );
  }

  /**
   * Parse a slow (S) frame.
   * S-frames typically use simple encodings without delta compression.
   */
  parseSFrame(reader: StreamReader): number[] {
    return this.parseFrame(
      reader,
      this.header.sFieldDefs,
      true, // S-frames are always "absolute"
      null,
      null,
      -1
    );
  }

  /**
   * Core frame parsing logic matching BF viewer's field iteration.
   *
   * For each field position:
   * 1. Fixed-group encoding (TAG2_3S*): decode 3 values, advance 3 fields.
   *    The BF encoder packs the next 3 fields into one binary group even
   *    if they have different declared encodings.
   * 2. Variable-group encoding (TAG8_8SVB, TAG8_4S16): count consecutive
   *    same-encoding fields, process in sub-groups of natural size.
   * 3. Single-value encoding: decode one value, advance 1 field.
   */
  private parseFrame(
    reader: StreamReader,
    fieldDefs: BBLFieldDefinition[],
    isIFrame: boolean,
    previous: number[] | null,
    previous2: number[] | null,
    motor0FieldIdx: number
  ): number[] {
    const values = new Array(fieldDefs.length).fill(0);
    let fieldIdx = 0;

    while (fieldIdx < fieldDefs.length) {
      const def = fieldDefs[fieldIdx];

      // NULL encoding doesn't read bytes, so skip eof check for it
      if (def.encoding !== BBLEncoding.NULL && reader.eof) break;

      // Check for fixed-group encoding (TAG2_3S32, TAG2_3SVARIABLE)
      const fixedSize = FIXED_GROUP_SIZE.get(def.encoding);
      if (fixedSize !== undefined) {
        // Always decode fixedSize values from the stream
        const decoded = new Array(fixedSize).fill(0);
        ValueDecoder.decodeGroup(reader, def.encoding, decoded, fixedSize, this.header.dataVersion);

        // Distribute to up to fixedSize fields (or until end of fieldDefs)
        const fieldsToApply = Math.min(fixedSize, fieldDefs.length - fieldIdx);
        for (let i = 0; i < fieldsToApply; i++) {
          values[fieldIdx + i] = PredictorApplier.apply(
            fieldDefs[fieldIdx + i].predictor,
            decoded[i],
            fieldIdx + i,
            isIFrame,
            previous,
            previous2,
            values,
            this.header,
            motor0FieldIdx
          );
        }
        fieldIdx += fieldsToApply;
        continue;
      }

      // Check for variable-group encoding (TAG8_8SVB, TAG8_4S16)
      const varGroupSize = VARIABLE_GROUP_SIZE.get(def.encoding);
      if (varGroupSize !== undefined) {
        // Count consecutive fields with the same encoding
        let consecutiveCount = 0;
        while (
          fieldIdx + consecutiveCount < fieldDefs.length &&
          fieldDefs[fieldIdx + consecutiveCount].encoding === def.encoding
        ) {
          consecutiveCount++;
        }

        // Process in sub-groups of the natural size
        let groupOffset = 0;
        while (groupOffset < consecutiveCount) {
          const subGroupSize = Math.min(varGroupSize, consecutiveCount - groupOffset);
          const decoded = new Array(subGroupSize).fill(0);
          ValueDecoder.decodeGroup(reader, def.encoding, decoded, subGroupSize, this.header.dataVersion);

          for (let i = 0; i < subGroupSize; i++) {
            values[fieldIdx + groupOffset + i] = PredictorApplier.apply(
              fieldDefs[fieldIdx + groupOffset + i].predictor,
              decoded[i],
              fieldIdx + groupOffset + i,
              isIFrame,
              previous,
              previous2,
              values,
              this.header,
              motor0FieldIdx
            );
          }
          groupOffset += varGroupSize;
        }
        fieldIdx += consecutiveCount;
        continue;
      }

      // Single-value encoding
      const decoded = new Array(1).fill(0);
      ValueDecoder.decode(reader, def.encoding, decoded, 0, this.header.dataVersion);

      values[fieldIdx] = PredictorApplier.apply(
        def.predictor,
        decoded[0],
        fieldIdx,
        isIFrame,
        previous,
        previous2,
        values,
        this.header,
        motor0FieldIdx
      );
      fieldIdx++;
    }

    return values;
  }

  private findFieldIndex(defs: BBLFieldDefinition[], name: string): number {
    return defs.findIndex(d => d.name === name);
  }
}
