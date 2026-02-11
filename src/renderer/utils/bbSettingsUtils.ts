import type { BlackboxSettings } from '@shared/types/blackbox.types';

const RECOMMENDED_DEBUG_MODE = 'GYRO_SCALED';
const MIN_LOGGING_RATE_HZ = 2000;

export interface BBSettingsStatus {
  allOk: boolean;
  debugModeOk: boolean;
  loggingRateOk: boolean;
  gyroScaledNotNeeded: boolean;
  fixCommands: string[];
}

/** BF 2025.12+ (4.6+) logs unfiltered gyro by default — DEBUG_GYRO_SCALED was removed */
export function isGyroScaledNotNeeded(version: string): boolean {
  const match = version.match(/^(\d+)\.(\d+)/);
  if (!match) return false;
  const [, major, minor] = match;
  return parseInt(major) > 4 || (parseInt(major) === 4 && parseInt(minor) >= 6);
}

export function computeBBSettingsStatus(
  bbSettings: BlackboxSettings | null,
  fcVersion: string
): BBSettingsStatus {
  const gyroScaledNotNeeded = isGyroScaledNotNeeded(fcVersion);

  if (!bbSettings) {
    return { allOk: true, debugModeOk: true, loggingRateOk: true, gyroScaledNotNeeded, fixCommands: [] };
  }

  const debugModeOk = gyroScaledNotNeeded || bbSettings.debugMode === RECOMMENDED_DEBUG_MODE;
  const loggingRateOk = bbSettings.loggingRateHz >= MIN_LOGGING_RATE_HZ;

  const fixCommands: string[] = [];
  if (!debugModeOk) {
    fixCommands.push(`set debug_mode = ${RECOMMENDED_DEBUG_MODE}`);
  }
  if (!loggingRateOk) {
    fixCommands.push('set blackbox_sample_rate = 1');
  }

  return {
    allOk: debugModeOk && loggingRateOk,
    debugModeOk,
    loggingRateOk,
    gyroScaledNotNeeded,
    fixCommands,
  };
}
