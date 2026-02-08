import { BBLEncoding } from '@shared/types/blackbox.types';
import type { BBLFieldDefinition, BBLLogHeader } from '@shared/types/blackbox.types';
import { ENCODING_GROUP_SIZE } from './constants';
import { StreamReader } from './StreamReader';
import { ValueDecoder } from './ValueDecoder';
import { PredictorApplier } from './PredictorApplier';

/**
 * Parses complete I-frames and P-frames by coordinating value decoding
 * and predictor application across all fields in a frame.
 *
 * Handles the complexity of grouped encodings (TAG2_3S32, TAG8_4S16, etc.)
 * which consume multiple fields at once while only reading a single tag byte.
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
   * Core frame parsing logic.
   *
   * Iterates through field definitions, respecting grouped encodings
   * that consume multiple fields. For each field or group:
   * 1. Decode values from binary data using the encoding type
   * 2. Apply the predictor to each decoded value
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
      if (reader.eof) break;

      const def = fieldDefs[fieldIdx];
      const groupSize = ENCODING_GROUP_SIZE[def.encoding];

      if (groupSize !== undefined) {
        // Grouped encoding: decode multiple values at once
        const decoded = new Array(groupSize).fill(0);
        ValueDecoder.decode(reader, def.encoding, decoded, 0);

        // Apply predictor to each value in the group
        const count = Math.min(groupSize, fieldDefs.length - fieldIdx);
        for (let i = 0; i < count; i++) {
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
        fieldIdx += count;
      } else {
        // Single-value encoding
        const decoded = new Array(1).fill(0);
        ValueDecoder.decode(reader, def.encoding, decoded, 0);

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
    }

    return values;
  }

  private findFieldIndex(defs: BBLFieldDefinition[], name: string): number {
    return defs.findIndex(d => d.name === name);
  }
}
