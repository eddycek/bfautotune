/**
 * Constants for Betaflight Blackbox binary log parsing.
 *
 * References:
 * - https://github.com/betaflight/blackbox-log-viewer
 * - https://github.com/betaflight/betaflight/blob/master/src/main/blackbox/blackbox.c
 */

/** ASCII byte values for frame type markers */
export const FRAME_MARKER = {
  INTRA: 0x49,      // 'I'
  INTER: 0x50,      // 'P'
  GPS_HOME: 0x48,   // 'H'
  GPS: 0x47,        // 'G'
  SLOW: 0x53,       // 'S'
  EVENT: 0x45,      // 'E'
} as const;

/** Set of all valid frame marker bytes for resync after corruption */
export const VALID_FRAME_MARKERS = new Set([
  FRAME_MARKER.INTRA,
  FRAME_MARKER.INTER,
  FRAME_MARKER.GPS_HOME,
  FRAME_MARKER.GPS,
  FRAME_MARKER.SLOW,
  FRAME_MARKER.EVENT,
]);

/** Event type IDs in event frames */
export const EVENT_TYPE = {
  SYNC_BEEP: 0,
  AUTOTUNE_CYCLE_START: 10,
  AUTOTUNE_CYCLE_RESULT: 11,
  AUTOTUNE_TARGETS: 12,
  INFLIGHT_ADJUSTMENT: 13,
  LOGGING_RESUME: 14,
  DISARM: 15,
  FLIGHT_MODE: 30,
  LOG_END: 255,
} as const;

/** Header line prefix in BBL files */
export const HEADER_PREFIX = 'H ';

/** Maximum bytes to read for a single variable-byte encoded value (safety limit) */
export const MAX_VB_BYTES = 5;

/** Number of frames between progress reports */
export const PROGRESS_INTERVAL = 1000;

/** Number of frames between setImmediate() yields to avoid blocking Electron */
export const YIELD_INTERVAL = 5000;

/** Maximum number of bytes to scan ahead when resyncing after corruption */
export const MAX_RESYNC_BYTES = 65536;

/** Header field name patterns for field definition parsing */
export const HEADER_KEYS = {
  /** Field names for I-frame */
  I_FIELD_NAME: 'Field I name',
  /** Field names for P-frame */
  P_FIELD_NAME: 'Field P name',
  /** Field names for S-frame (slow) */
  S_FIELD_NAME: 'Field S name',
  /** Field names for G-frame (GPS) */
  G_FIELD_NAME: 'Field G name',
  /** Field names for H-frame (GPS home) */
  H_FIELD_NAME: 'Field H name',

  /** Encoding types for I-frame fields */
  I_ENCODING: 'Field I encoding',
  /** Encoding types for P-frame fields */
  P_ENCODING: 'Field P encoding',
  /** Encoding types for S-frame fields */
  S_ENCODING: 'Field S encoding',
  /** Encoding types for G-frame fields */
  G_ENCODING: 'Field G encoding',
  /** Encoding types for H-frame fields */
  H_ENCODING: 'Field H encoding',

  /** Predictor types for I-frame fields */
  I_PREDICTOR: 'Field I predictor',
  /** Predictor types for P-frame fields */
  P_PREDICTOR: 'Field P predictor',
  /** Predictor types for S-frame fields */
  S_PREDICTOR: 'Field S predictor',
  /** Predictor types for G-frame fields */
  G_PREDICTOR: 'Field G predictor',
  /** Predictor types for H-frame fields */
  H_PREDICTOR: 'Field H predictor',

  /** Signed flags for I-frame fields */
  I_SIGNED: 'Field I signed',
  /** Signed flags for P-frame fields */
  P_SIGNED: 'Field P signed',
  /** Signed flags for S-frame fields */
  S_SIGNED: 'Field S signed',
  /** Signed flags for G-frame fields */
  G_SIGNED: 'Field G signed',
  /** Signed flags for H-frame fields */
  H_SIGNED: 'Field H signed',

  /** Metadata keys */
  PRODUCT: 'Product',
  DATA_VERSION: 'Data version',
  FIRMWARE_TYPE: 'Firmware type',
  FIRMWARE_REVISION: 'Firmware revision',
  FIRMWARE_DATE: 'Firmware date',
  BOARD_INFO: 'Board information',
  LOG_START_DATETIME: 'Log start datetime',
  CRAFT_NAME: 'Craft name',
  I_INTERVAL: 'I interval',
  P_INTERVAL: 'P interval',
  P_RATIO: 'P ratio',
  MINTHROTTLE: 'minthrottle',
  MAXTHROTTLE: 'maxthrottle',
  MOTOR_OUTPUT_LOW: 'motorOutput',
  VBATREF: 'vbatref',
  LOOPTIME: 'looptime',
  GYRO_SCALE: 'gyro_scale',
  ACC_1G: 'acc_1G',
} as const;

/** Well-known field name patterns used during flight data extraction */
export const FIELD_NAMES = {
  LOOP_ITERATION: 'loopIteration',
  TIME: 'time',
  GYRO_ADC_PREFIX: 'gyroADC[',
  SETPOINT_PREFIX: 'setpoint[',
  RC_COMMAND_PREFIX: 'rcCommand[',
  AXIS_P_PREFIX: 'axisP[',
  AXIS_I_PREFIX: 'axisI[',
  AXIS_D_PREFIX: 'axisD[',
  AXIS_F_PREFIX: 'axisF[',
  MOTOR_PREFIX: 'motor[',
  DEBUG_PREFIX: 'debug[',
} as const;

/** Number of encoding groups that multi-value encodings produce */
export const ENCODING_GROUP_SIZE: Record<number, number> = {
  3: 4,  // TAG8_8SVB produces up to 4 values
  4: 3,  // TAG2_3S32 produces 3 values
  5: 4,  // TAG8_4S16_V1 produces 4 values
  6: 4,  // TAG8_4S16_V2 produces 4 values
  8: 3,  // TAG2_3SVARIABLE produces 3 values
};
