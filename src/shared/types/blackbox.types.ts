/**
 * Blackbox data flash storage information
 */
export interface BlackboxInfo {
  /** Whether Blackbox is supported on this FC */
  supported: boolean;
  /** Total flash storage size in bytes (0 if no flash) */
  totalSize: number;
  /** Used flash storage size in bytes */
  usedSize: number;
  /** Whether flash has any logs */
  hasLogs: boolean;
  /** Free space in bytes */
  freeSize: number;
  /** Usage percentage (0-100) */
  usagePercent: number;
}

/**
 * Blackbox configuration settings
 */
export interface BlackboxConfig {
  /** Logging rate divisor (1 = full rate, 2 = half rate, etc.) */
  rateDivisor: number;
  /** Debug mode for logging */
  debugMode: BlackboxDebugMode;
  /** Fields to log */
  fields: number;
}

/**
 * Blackbox debug modes for specialized logging
 */
export enum BlackboxDebugMode {
  NONE = 0,
  CYCLETIME = 1,
  BATTERY = 2,
  GYRO_FILTERED = 3,
  ACCELEROMETER = 4,
  PIDLOOP = 5,
  GYRO_SCALED = 6,
  RC_INTERPOLATION = 7,
  ANGLERATE = 8,
  ESC_SENSOR = 9,
  SCHEDULER = 10,
  STACK = 11,
  ESC_SENSOR_RPM = 12,
  ESC_SENSOR_TMP = 13,
  ALTITUDE = 14,
  FFT = 15,
  FFT_TIME = 16,
  FFT_FREQ = 17,
  RX_FRSKY_SPI = 18,
  RX_SFHSS_SPI = 19,
  GYRO_RAW = 20,
  DUAL_GYRO_COMBINED = 21,
  DUAL_GYRO_DIFF = 22,
  MAX7456_SIGNAL = 23,
  MAX7456_SPICLOCK = 24,
  SBUS = 25,
  FPORT = 26,
  RANGEFINDER = 27,
  RANGEFINDER_QUALITY = 28,
  LIDAR_TF = 29,
  ADC_INTERNAL = 30,
  RUNAWAY_TAKEOFF = 31,
  SDIO = 32,
  CURRENT_SENSOR = 33,
  USB = 34,
  SMARTAUDIO = 35,
  RTH = 36,
  ITERM_RELAX = 37,
  ACRO_TRAINER = 38,
  RC_SMOOTHING = 39,
  RX_SIGNAL_LOSS = 40,
  RC_SMOOTHING_RATE = 41,
  ANTI_GRAVITY = 42,
  DYN_LPF = 43,
  RX_SPEKTRUM_SPI = 44,
  DSHOT_RPM_TELEMETRY = 45,
  RPM_FILTER = 46,
  D_MIN = 47,
  AC_CORRECTION = 48,
  AC_ERROR = 49,
  DUAL_GYRO_RAW = 50,
  DSHOT_RPM_ERRORS = 51,
  CRSF_LINK_STATISTICS_UPLINK = 52,
  CRSF_LINK_STATISTICS_PWR = 53,
  CRSF_LINK_STATISTICS_DOWN = 54,
  BARO = 55,
  GPS_RESCUE_THROTTLE_PID = 56,
  DYN_IDLE = 57,
  FF_LIMIT = 58,
  FF_INTERPOLATED = 59,
  BLACKBOX_OUTPUT = 60,
  GYRO_SAMPLE = 61,
  RX_TIMING = 62
}

/**
 * Blackbox log download progress
 */
export interface BlackboxDownloadProgress {
  /** Downloaded bytes */
  downloaded: number;
  /** Total bytes to download */
  total: number;
  /** Progress percentage (0-100) */
  percent: number;
  /** Estimated time remaining in seconds */
  estimatedSecondsRemaining?: number;
}

/**
 * Metadata for a saved Blackbox log file
 */
export interface BlackboxLogMetadata {
  /** Unique log ID */
  id: string;
  /** Profile this log belongs to */
  profileId: string;
  /** FC serial number */
  fcSerial: string;
  /** Download timestamp (ISO format) */
  timestamp: string;
  /** Log filename */
  filename: string;
  /** Full filepath on disk */
  filepath: string;
  /** Log size in bytes */
  size: number;
  /** FC info at time of download */
  fcInfo: {
    variant: string;
    version: string;
    target: string;
  };
}
