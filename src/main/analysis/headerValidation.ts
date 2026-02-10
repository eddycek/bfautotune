/**
 * BBL header validation for analysis quality warnings.
 *
 * Checks logging rate and debug mode from the parsed BBL header
 * and generates warnings when the configuration is suboptimal.
 */

import type { BBLLogHeader } from '@shared/types/blackbox.types';
import type { AnalysisWarning } from '@shared/types/analysis.types';

/** Minimum recommended logging rate in Hz for meaningful FFT */
const MIN_LOGGING_RATE_HZ = 2000;

/** Debug mode value for GYRO_SCALED (unfiltered gyro for noise analysis) */
const GYRO_SCALED_DEBUG_MODE = 6;

/**
 * Validate BBL header and return warnings about data quality.
 *
 * @param header - Parsed BBL log header
 * @returns Array of warnings (empty if all looks good)
 */
export function validateBBLHeader(header: BBLLogHeader): AnalysisWarning[] {
  const warnings: AnalysisWarning[] = [];

  // Check logging rate
  if (header.looptime > 0) {
    const loggingRateHz = 1_000_000 / header.looptime;
    if (loggingRateHz < MIN_LOGGING_RATE_HZ) {
      const nyquist = Math.round(loggingRateHz / 2);
      warnings.push({
        code: 'low_logging_rate',
        message: `Logging rate is ${Math.round(loggingRateHz)} Hz (Nyquist: ${nyquist} Hz). ` +
          `Motor noise (200–600 Hz) may not be visible. Recommended: 2 kHz or higher.`,
        severity: 'warning',
      });
    }
  }

  // Check debug mode
  const debugModeStr = header.rawHeaders.get('debug_mode');
  if (debugModeStr !== undefined) {
    const debugMode = parseInt(debugModeStr, 10);
    if (!isNaN(debugMode) && debugMode !== GYRO_SCALED_DEBUG_MODE) {
      warnings.push({
        code: 'wrong_debug_mode',
        message: `Debug mode is not GYRO_SCALED (current: ${debugModeStr}). ` +
          `FFT may analyze filtered gyro data instead of raw noise. ` +
          `Set debug_mode = GYRO_SCALED in Betaflight for best filter analysis results.`,
        severity: 'info',
      });
    }
  }

  return warnings;
}
