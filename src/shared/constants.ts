export const APP_VERSION = '0.1.0';

export const MSP = {
  DEFAULT_BAUD_RATE: 115200,
  CONNECTION_TIMEOUT: 5000,
  COMMAND_TIMEOUT: 2000,
  RECONNECT_ATTEMPTS: 5,
  RECONNECT_INTERVAL: 2000,
  REBOOT_WAIT_TIME: 3000
} as const;

export const BETAFLIGHT = {
  VENDOR_IDS: ['0x0483', '0x2E8A'], // STM32, RP2040
  VARIANT: 'BTFL'
} as const;

export const SNAPSHOT = {
  BASELINE_LABEL: 'Baseline',
  STORAGE_DIR: 'data/snapshots'
} as const;

export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
} as const;
