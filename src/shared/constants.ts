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

export const PROFILE = {
  STORAGE_DIR: 'data/profiles',
  PROFILES_FILE: 'profiles.json'
} as const;

// Default values based on drone size
export const SIZE_DEFAULTS = {
  '1"': { weight: 25, motorKV: 19000, battery: '1S' as const, propSize: '31mm', frameStiffness: 'soft' as const },
  '2"': { weight: 50, motorKV: 8000, battery: '1S' as const, propSize: '40mm', frameStiffness: 'soft' as const },
  '2.5"': { weight: 120, motorKV: 3000, battery: '3S' as const, propSize: '2.5"', frameStiffness: 'soft' as const },
  '3"': { weight: 180, motorKV: 3000, battery: '4S' as const, propSize: '3"', frameStiffness: 'soft' as const },
  '4"': { weight: 350, motorKV: 2650, battery: '4S' as const, propSize: '4"', frameStiffness: 'medium' as const },
  '5"': { weight: 650, motorKV: 2400, battery: '4S' as const, propSize: '5.1"', frameStiffness: 'medium' as const },
  '6"': { weight: 800, motorKV: 2000, battery: '6S' as const, propSize: '6"', frameStiffness: 'medium' as const },
  '7"': { weight: 900, motorKV: 1800, battery: '6S' as const, propSize: '7"', frameStiffness: 'medium' as const },
  '10"': { weight: 1500, motorKV: 1400, battery: '6S' as const, propSize: '10"', frameStiffness: 'stiff' as const }
} as const;

// Preset profiles
export const PRESET_PROFILES = {
  'tiny-whoop': {
    presetId: 'tiny-whoop',
    name: 'Tiny Whoop (1")',
    size: '1"' as const,
    propSize: '31mm',
    battery: '1S' as const,
    weight: 25,
    motorKV: 19000,
    frameType: 'freestyle' as const,
    flightStyle: 'balanced' as const,
    frameStiffness: 'soft' as const,
    notes: '',
    description: 'Ultra micro indoor whoop, 1S battery'
  },

  'micro-whoop': {
    presetId: 'micro-whoop',
    name: 'Micro Whoop (2")',
    size: '2"' as const,
    propSize: '40mm',
    battery: '1S' as const,
    weight: 50,
    motorKV: 8000,
    frameType: 'freestyle' as const,
    flightStyle: 'balanced' as const,
    frameStiffness: 'soft' as const,
    notes: '',
    description: 'Micro whoop for indoor flying, 1S battery'
  },

  '4inch-toothpick': {
    presetId: '4inch-toothpick',
    name: '4" Toothpick',
    size: '4"' as const,
    propSize: '4"',
    battery: '3S' as const,
    weight: 300,
    motorKV: 2800,
    frameType: 'freestyle' as const,
    flightStyle: 'balanced' as const,
    frameStiffness: 'medium' as const,
    notes: '',
    description: 'Lightweight 4 inch toothpick for indoor/outdoor'
  },

  '5inch-freestyle': {
    presetId: '5inch-freestyle',
    name: '5" Freestyle',
    size: '5"' as const,
    propSize: '5.1"',
    battery: '4S' as const,
    weight: 650,
    motorKV: 2400,
    frameType: 'freestyle' as const,
    flightStyle: 'balanced' as const,
    frameStiffness: 'medium' as const,
    notes: '',
    description: 'Standard 5 inch freestyle quad with balanced tuning'
  },

  '5inch-race': {
    presetId: '5inch-race',
    name: '5" Race',
    size: '5"' as const,
    propSize: '5"',
    battery: '4S' as const,
    weight: 580,
    motorKV: 2650,
    frameType: 'race' as const,
    flightStyle: 'aggressive' as const,
    frameStiffness: 'stiff' as const,
    notes: '',
    description: 'Lightweight 5 inch racing quad with aggressive tuning'
  },

  '5inch-cinematic': {
    presetId: '5inch-cinematic',
    name: '5" Cinematic',
    size: '5"' as const,
    propSize: '5.1"',
    battery: '6S' as const,
    weight: 750,
    motorKV: 1960,
    frameType: 'cinematic' as const,
    flightStyle: 'smooth' as const,
    frameStiffness: 'medium' as const,
    notes: '',
    description: 'Heavy cinematic quad with GoPro, smooth tuning'
  },

  '6inch-longrange': {
    presetId: '6inch-longrange',
    name: '6" Long Range',
    size: '6"' as const,
    propSize: '6"',
    battery: '6S' as const,
    weight: 800,
    motorKV: 2000,
    frameType: 'long-range' as const,
    flightStyle: 'smooth' as const,
    frameStiffness: 'medium' as const,
    notes: '',
    description: 'Mid-range cruiser with 6S power'
  },

  '7inch-longrange': {
    presetId: '7inch-longrange',
    name: '7" Long Range',
    size: '7"' as const,
    propSize: '7"',
    battery: '6S' as const,
    weight: 900,
    motorKV: 1800,
    frameType: 'long-range' as const,
    flightStyle: 'smooth' as const,
    frameStiffness: 'medium' as const,
    notes: '',
    description: 'Long range cruiser with smooth flight characteristics'
  },

  '3inch-cinewhoop': {
    presetId: '3inch-cinewhoop',
    name: '3" Cinewhoop',
    size: '3"' as const,
    propSize: '3"',
    battery: '4S' as const,
    weight: 180,
    motorKV: 3000,
    frameType: 'cinematic' as const,
    flightStyle: 'smooth' as const,
    frameStiffness: 'soft' as const,
    notes: '',
    description: 'Indoor/cinematic whoop with ducted props'
  },

  '10inch-ultra-longrange': {
    presetId: '10inch-ultra-longrange',
    name: '10" Ultra Long Range',
    size: '10"' as const,
    propSize: '10"',
    battery: '6S' as const,
    weight: 1500,
    motorKV: 1400,
    frameType: 'long-range' as const,
    flightStyle: 'smooth' as const,
    frameStiffness: 'stiff' as const,
    notes: '',
    description: 'Ultra long range platform for exploration'
  }
} as const;
