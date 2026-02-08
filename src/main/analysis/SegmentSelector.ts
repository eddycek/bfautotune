/**
 * Segment selector for finding stable hover portions of a flight.
 *
 * Analyzes throttle and gyro data to identify segments where the drone
 * is in steady hover — these provide the cleanest data for noise analysis.
 */
import type { BlackboxFlightData, TimeSeries } from '@shared/types/blackbox.types';
import type { FlightSegment } from '@shared/types/analysis.types';
import {
  THROTTLE_MIN_FLIGHT,
  THROTTLE_MAX_HOVER,
  GYRO_STEADY_MAX_STD,
  SEGMENT_MIN_DURATION_S,
  SEGMENT_WINDOW_SAMPLES,
} from './constants';

/**
 * Find stable hover segments in the flight data.
 *
 * A segment is "steady" if:
 * 1. Throttle is in hover range (above min, below max)
 * 2. Gyro variance is low (not doing aggressive maneuvers)
 * 3. Duration is at least SEGMENT_MIN_DURATION_S
 *
 * @returns Segments sorted by duration (longest first)
 */
export function findSteadySegments(flightData: BlackboxFlightData): FlightSegment[] {
  const { sampleRateHz } = flightData;
  const throttle = flightData.setpoint[3]; // Throttle channel
  const gyroRoll = flightData.gyro[0];
  const gyroPitch = flightData.gyro[1];

  const numSamples = throttle.values.length;
  if (numSamples === 0) return [];

  const minSegmentSamples = Math.floor(SEGMENT_MIN_DURATION_S * sampleRateHz);

  // Build a boolean mask: true = sample is in steady hover
  const steadyMask = new Uint8Array(numSamples);
  const windowSize = Math.min(SEGMENT_WINDOW_SAMPLES, numSamples);
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < numSamples; i++) {
    // Check throttle range
    const thr = normalizeThrottle(throttle.values[i]);
    if (thr < THROTTLE_MIN_FLIGHT || thr > THROTTLE_MAX_HOVER) {
      continue;
    }

    // Check gyro variance in a local window
    const wStart = Math.max(0, i - halfWindow);
    const wEnd = Math.min(numSamples, i + halfWindow);
    const rollStd = computeStd(gyroRoll.values, wStart, wEnd);
    const pitchStd = computeStd(gyroPitch.values, wStart, wEnd);

    if (rollStd <= GYRO_STEADY_MAX_STD && pitchStd <= GYRO_STEADY_MAX_STD) {
      steadyMask[i] = 1;
    }
  }

  // Extract contiguous segments from the mask
  const segments: FlightSegment[] = [];
  let segStart = -1;

  for (let i = 0; i <= numSamples; i++) {
    const isSet = i < numSamples && steadyMask[i] === 1;

    if (isSet && segStart === -1) {
      segStart = i;
    } else if (!isSet && segStart !== -1) {
      const length = i - segStart;
      if (length >= minSegmentSamples) {
        const startTime = segStart < throttle.time.length ? throttle.time[segStart] : segStart / sampleRateHz;
        const endTime = (i - 1) < throttle.time.length ? throttle.time[i - 1] : (i - 1) / sampleRateHz;
        const duration = endTime - startTime;

        // Compute average throttle
        let thrSum = 0;
        for (let j = segStart; j < i; j++) {
          thrSum += normalizeThrottle(throttle.values[j]);
        }

        segments.push({
          startIndex: segStart,
          endIndex: i,
          durationSeconds: duration > 0 ? duration : length / sampleRateHz,
          averageThrottle: thrSum / length,
        });
      }
      segStart = -1;
    }
  }

  // Sort by duration, longest first
  segments.sort((a, b) => b.durationSeconds - a.durationSeconds);

  return segments;
}

/**
 * Normalize throttle to 0-1 range.
 * Betaflight setpoint throttle is typically 0-1000 or 1000-2000 depending on log version.
 */
function normalizeThrottle(value: number): number {
  if (value > 1000) {
    // 1000-2000 range (RC pulse width)
    return (value - 1000) / 1000;
  }
  if (value > 100) {
    // 0-1000 range
    return value / 1000;
  }
  if (value > 1) {
    // 0-100 percentage range
    return value / 100;
  }
  // Already 0-1 range
  return value;
}

/**
 * Compute standard deviation of a sub-range of a Float64Array.
 */
function computeStd(arr: Float64Array, start: number, end: number): number {
  const n = end - start;
  if (n <= 1) return 0;

  let sum = 0;
  for (let i = start; i < end; i++) {
    sum += arr[i];
  }
  const mean = sum / n;

  let variance = 0;
  for (let i = start; i < end; i++) {
    const d = arr[i] - mean;
    variance += d * d;
  }

  return Math.sqrt(variance / n);
}

// Export for testing
export { normalizeThrottle, computeStd };
