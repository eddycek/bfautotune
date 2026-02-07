import { BBLEncoding, BBLPredictor } from '@shared/types/blackbox.types';
import type { BBLFieldDefinition, BBLLogHeader } from '@shared/types/blackbox.types';
import { HEADER_PREFIX, HEADER_KEYS } from './constants';
import { StreamReader } from './StreamReader';

/**
 * Parses the ASCII header section of a BBL log session.
 * Header lines start with "H " and contain key:value pairs that
 * define field names, encodings, predictors, and metadata.
 */
export class HeaderParser {
  /**
   * Parse header lines from the stream reader.
   * Reads lines until a non-header line is encountered.
   * Returns the parsed header and leaves the stream positioned
   * at the first byte after the header section.
   */
  static parse(reader: StreamReader): BBLLogHeader {
    const rawHeaders = new Map<string, string>();

    // Read header lines
    while (!reader.eof) {
      const savedOffset = reader.offset;
      const line = reader.readLine();

      if (line === null) break;

      // Check if this line is a header line
      if (!line.startsWith(HEADER_PREFIX)) {
        // Not a header line - rewind to before this line
        reader.setOffset(savedOffset);
        break;
      }

      // Parse "H key:value"
      const content = line.substring(HEADER_PREFIX.length);
      const colonIdx = content.indexOf(':');
      if (colonIdx === -1) continue;

      const key = content.substring(0, colonIdx);
      const value = content.substring(colonIdx + 1);
      rawHeaders.set(key, value);
    }

    return HeaderParser.buildHeader(rawHeaders);
  }

  /**
   * Build a BBLLogHeader from raw header key-value pairs.
   */
  private static buildHeader(rawHeaders: Map<string, string>): BBLLogHeader {
    const header: BBLLogHeader = {
      product: rawHeaders.get(HEADER_KEYS.PRODUCT) || '',
      dataVersion: parseInt(rawHeaders.get(HEADER_KEYS.DATA_VERSION) || '0', 10),
      firmwareType: rawHeaders.get(HEADER_KEYS.FIRMWARE_TYPE) || '',
      firmwareRevision: rawHeaders.get(HEADER_KEYS.FIRMWARE_REVISION) || '',
      firmwareDate: rawHeaders.get(HEADER_KEYS.FIRMWARE_DATE) || '',
      boardInformation: rawHeaders.get(HEADER_KEYS.BOARD_INFO) || '',
      logStartDatetime: rawHeaders.get(HEADER_KEYS.LOG_START_DATETIME) || '',
      craftName: rawHeaders.get(HEADER_KEYS.CRAFT_NAME) || '',

      iFieldDefs: [],
      pFieldDefs: [],
      sFieldDefs: [],
      gFieldDefs: [],

      iInterval: parseInt(rawHeaders.get(HEADER_KEYS.I_INTERVAL) || '32', 10),
      pInterval: HeaderParser.parsePInterval(rawHeaders),
      pDenom: HeaderParser.parsePDenom(rawHeaders),

      minthrottle: parseInt(rawHeaders.get(HEADER_KEYS.MINTHROTTLE) || '1070', 10),
      maxthrottle: parseInt(rawHeaders.get(HEADER_KEYS.MAXTHROTTLE) || '2000', 10),
      motorOutputRange: 0,
      vbatref: parseInt(rawHeaders.get(HEADER_KEYS.VBATREF) || '0', 10),
      looptime: parseInt(rawHeaders.get(HEADER_KEYS.LOOPTIME) || '312', 10),
      gyroScale: parseFloat(rawHeaders.get(HEADER_KEYS.GYRO_SCALE) || '0.0305176'),

      rawHeaders,
    };

    // Motor output range: parse "motorOutput" header which has format "low,high"
    const motorOutput = rawHeaders.get('motorOutput');
    if (motorOutput) {
      const parts = motorOutput.split(',');
      if (parts.length >= 2) {
        header.motorOutputRange = parseInt(parts[1], 10) - parseInt(parts[0], 10);
      }
    }

    // Parse field definitions for each frame type
    header.iFieldDefs = HeaderParser.parseFieldDefs(
      rawHeaders,
      HEADER_KEYS.I_FIELD_NAME,
      HEADER_KEYS.I_ENCODING,
      HEADER_KEYS.I_PREDICTOR,
      HEADER_KEYS.I_SIGNED
    );

    header.pFieldDefs = HeaderParser.parseFieldDefs(
      rawHeaders,
      HEADER_KEYS.P_FIELD_NAME,
      HEADER_KEYS.P_ENCODING,
      HEADER_KEYS.P_PREDICTOR,
      HEADER_KEYS.P_SIGNED
    );

    header.sFieldDefs = HeaderParser.parseFieldDefs(
      rawHeaders,
      HEADER_KEYS.S_FIELD_NAME,
      HEADER_KEYS.S_ENCODING,
      HEADER_KEYS.S_PREDICTOR,
      HEADER_KEYS.S_SIGNED
    );

    header.gFieldDefs = HeaderParser.parseFieldDefs(
      rawHeaders,
      HEADER_KEYS.G_FIELD_NAME,
      HEADER_KEYS.G_ENCODING,
      HEADER_KEYS.G_PREDICTOR,
      HEADER_KEYS.G_SIGNED
    );

    return header;
  }

  /**
   * Parse field definitions from header key-value pairs.
   * Field names, encodings, predictors, and signed flags are stored
   * as comma-separated values in separate header lines.
   */
  private static parseFieldDefs(
    rawHeaders: Map<string, string>,
    nameKey: string,
    encodingKey: string,
    predictorKey: string,
    signedKey: string
  ): BBLFieldDefinition[] {
    const namesStr = rawHeaders.get(nameKey);
    if (!namesStr) return [];

    const names = namesStr.split(',');
    const encodings = (rawHeaders.get(encodingKey) || '').split(',');
    const predictors = (rawHeaders.get(predictorKey) || '').split(',');
    const signeds = (rawHeaders.get(signedKey) || '').split(',');

    const defs: BBLFieldDefinition[] = [];
    for (let i = 0; i < names.length; i++) {
      const name = names[i].trim();
      if (!name) continue;

      defs.push({
        name,
        encoding: HeaderParser.parseEncoding(encodings[i]),
        predictor: HeaderParser.parsePredictor(predictors[i]),
        signed: HeaderParser.parseSigned(signeds[i]),
      });
    }

    return defs;
  }

  private static parseEncoding(value: string | undefined): BBLEncoding {
    if (!value) return BBLEncoding.SIGNED_VB;
    const num = parseInt(value.trim(), 10);
    if (isNaN(num) || num < 0 || num > 9) return BBLEncoding.SIGNED_VB;
    return num as BBLEncoding;
  }

  private static parsePredictor(value: string | undefined): BBLPredictor {
    if (!value) return BBLPredictor.ZERO;
    const num = parseInt(value.trim(), 10);
    if (isNaN(num) || num < 0 || num > 9) return BBLPredictor.ZERO;
    return num as BBLPredictor;
  }

  private static parseSigned(value: string | undefined): boolean {
    if (!value) return false;
    return value.trim() === '1';
  }

  private static parsePInterval(rawHeaders: Map<string, string>): number {
    // "P interval" can be "numerator/denominator" or just a number
    const pInterval = rawHeaders.get(HEADER_KEYS.P_INTERVAL);
    if (!pInterval) {
      // Fall back to P ratio
      const pRatio = rawHeaders.get(HEADER_KEYS.P_RATIO);
      if (pRatio) return parseInt(pRatio, 10);
      return 1;
    }
    const parts = pInterval.split('/');
    return parseInt(parts[0], 10) || 1;
  }

  private static parsePDenom(rawHeaders: Map<string, string>): number {
    const pInterval = rawHeaders.get(HEADER_KEYS.P_INTERVAL);
    if (!pInterval) return 1;
    const parts = pInterval.split('/');
    if (parts.length >= 2) return parseInt(parts[1], 10) || 1;
    return 1;
  }
}
