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
  VARIANT: 'BTFL',
  /** Minimum supported BF version (API 1.44) */
  MIN_VERSION: '4.3.0',
  /** Minimum supported API version (major.minor) */
  MIN_API_VERSION: { major: 1, minor: 44 },
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

export const PROFILE = {
  STORAGE_DIR: 'data/profiles',
  PROFILES_FILE: 'profiles.json'
} as const;

// Default values based on drone size
export const SIZE_DEFAULTS = {
  '1"': { weight: 25, motorKV: 19000, battery: '1S' as const, propSize: '31mm' },
  '2"': { weight: 50, motorKV: 8000, battery: '1S' as const, propSize: '40mm' },
  '2.5"': { weight: 120, motorKV: 3000, battery: '3S' as const, propSize: '2.5"' },
  '3"': { weight: 180, motorKV: 3000, battery: '4S' as const, propSize: '3"' },
  '4"': { weight: 350, motorKV: 2650, battery: '4S' as const, propSize: '4"' },
  '5"': { weight: 650, motorKV: 2400, battery: '4S' as const, propSize: '5.1"' },
  '6"': { weight: 800, motorKV: 2000, battery: '6S' as const, propSize: '6"' },
  '7"': { weight: 900, motorKV: 1800, battery: '6S' as const, propSize: '7"' },
  '10"': { weight: 1500, motorKV: 1400, battery: '6S' as const, propSize: '10"' }
} as const;

// Helper to build preset from SIZE_DEFAULTS with overrides
import type { DroneSize } from './types/profile.types';

function preset(size: DroneSize, name: string, description: string, overrides?: Record<string, unknown>) {
  return { ...SIZE_DEFAULTS[size], size, name, description, ...overrides };
}

// Preset profiles — values derived from SIZE_DEFAULTS, only overrides where different
export const PRESET_PROFILES = {
  'tiny-whoop':           preset('1"',  'Tiny Whoop (1")',       'Ultra micro indoor whoop, 1S battery'),
  'micro-whoop':          preset('2"',  'Micro Whoop (2")',      'Micro whoop for indoor flying, 1S battery'),
  '3inch-cinewhoop':      preset('3"',  '3" Cinewhoop',          'Indoor/cinematic whoop with ducted props'),
  '4inch-toothpick':      preset('4"',  '4" Toothpick',          'Lightweight 4 inch toothpick for indoor/outdoor',
                            { battery: '3S' as const, weight: 300, motorKV: 2800 }),
  '5inch-freestyle':      preset('5"',  '5" Freestyle',          'Standard 5 inch freestyle quad with balanced tuning'),
  '5inch-race':           preset('5"',  '5" Race',               'Lightweight 5 inch racing quad with aggressive tuning',
                            { propSize: '5"', weight: 580, motorKV: 2650 }),
  '5inch-cinematic':      preset('5"',  '5" Cinematic',          'Heavy cinematic quad with GoPro, smooth tuning',
                            { battery: '6S' as const, weight: 750, motorKV: 1960 }),
  '6inch-longrange':      preset('6"',  '6" Long Range',         'Mid-range cruiser with 6S power'),
  '7inch-longrange':      preset('7"',  '7" Long Range',         'Long range cruiser with smooth flight characteristics'),
  '10inch-ultra-longrange': preset('10"', '10" Ultra Long Range', 'Ultra long range platform for exploration'),
};
