/**
 * Transfer function estimation via Wiener deconvolution.
 *
 * Estimates the closed-loop transfer function H(f) = gyro/setpoint from any
 * flight data (not just stick-snap flights). Produces a Bode plot (magnitude
 * + phase vs frequency) and derives:
 *   - System bandwidth (-3 dB point)
 *   - Phase margin
 *   - Peak resonance (underdamping indicator)
 *   - Synthetic step response via IFFT
 *
 * Mathematical basis:
 *   H(f) = Syx(f) / (Sxx(f) + λ)
 * where Syx is the cross-spectral density, Sxx is the input auto-spectrum,
 * and λ is a noise-floor-based regularization parameter.
 */
import FFT from 'fft.js';
import type { BlackboxFlightData } from '@shared/types/blackbox.types';
import type {
  TransferFunction,
  FrequencyDomainMetrics,
  AxisTransferFunction,
  TransferFunctionResult,
} from '@shared/types/analysis.types';
import { applyHanningWindow } from './FFTCompute';
import {
  TRANSFER_FUNCTION_WINDOW_SIZE,
  WIENER_REGULARIZATION_RATIO,
  TRANSFER_FUNCTION_MIN_INPUT_ENERGY,
  TRANSFER_FUNCTION_MAX_HZ,
  FFT_OVERLAP,
} from './constants';

const AXIS_NAMES = ['roll', 'pitch', 'yaw'] as const;

/**
 * Estimate transfer functions for all three axes from flight data.
 *
 * @param flightData - Parsed Blackbox flight data
 * @returns Transfer function results per axis (may be undefined for axes with insufficient data)
 */
export function estimateTransferFunctions(
  flightData: BlackboxFlightData
): TransferFunctionResult | undefined {
  const sampleRate = flightData.sampleRateHz;

  // Need at least one full window of data
  if (flightData.gyro[0].values.length < TRANSFER_FUNCTION_WINDOW_SIZE) {
    return undefined;
  }

  const result: TransferFunctionResult = {};
  let hasAny = false;

  for (let axis = 0; axis < 3; axis++) {
    const setpoint = flightData.setpoint[axis].values;
    const gyro = flightData.gyro[axis].values;

    const tf = computeAxisTransferFunction(setpoint, gyro, sampleRate);
    if (tf) {
      const metrics = extractFrequencyMetrics(tf, sampleRate);
      const axisResult: AxisTransferFunction = {
        axis: AXIS_NAMES[axis],
        transferFunction: tf,
        metrics,
      };
      result[AXIS_NAMES[axis]] = axisResult;
      hasAny = true;
    }
  }

  return hasAny ? result : undefined;
}

/**
 * Compute the transfer function for a single axis using Welch-style averaging
 * of windowed Wiener deconvolution estimates.
 */
export function computeAxisTransferFunction(
  setpoint: Float64Array,
  gyro: Float64Array,
  sampleRate: number,
  windowSize: number = TRANSFER_FUNCTION_WINDOW_SIZE
): TransferFunction | undefined {
  const n = Math.min(setpoint.length, gyro.length);
  if (n < windowSize) return undefined;

  const step = Math.floor(windowSize * (1 - FFT_OVERLAP));
  const numWindows = Math.floor((n - windowSize) / step) + 1;
  if (numWindows <= 0) return undefined;

  const numBins = windowSize / 2 + 1;
  const freqResolution = sampleRate / windowSize;

  // Accumulate cross-spectrum and auto-spectrum across windows
  const sxxAccum = new Float64Array(numBins); // |X(f)|^2 averaged
  const syxRealAccum = new Float64Array(numBins); // Re(Y·conj(X)) averaged
  const syxImagAccum = new Float64Array(numBins); // Im(Y·conj(X)) averaged
  let validWindows = 0;

  const fft = new FFT(windowSize);

  for (let w = 0; w < numWindows; w++) {
    const start = w * step;
    const spSegment = setpoint.subarray(start, start + windowSize);
    const gyroSegment = gyro.subarray(start, start + windowSize);

    // Check setpoint has sufficient energy (skip idle segments)
    const energy = computeEnergy(spSegment);
    if (energy < TRANSFER_FUNCTION_MIN_INPUT_ENERGY) continue;

    // Window both signals
    const spWindowed = applyHanningWindow(spSegment);
    const gyroWindowed = applyHanningWindow(gyroSegment);

    // FFT
    const spFFT = fft.createComplexArray();
    const gyroFFT = fft.createComplexArray();
    fft.realTransform(spFFT, spWindowed);
    fft.completeSpectrum(spFFT);
    fft.realTransform(gyroFFT, gyroWindowed);
    fft.completeSpectrum(gyroFFT);

    // Accumulate spectra
    for (let i = 0; i < numBins; i++) {
      const xRe = spFFT[2 * i];
      const xIm = spFFT[2 * i + 1];
      const yRe = gyroFFT[2 * i];
      const yIm = gyroFFT[2 * i + 1];

      // Auto-spectrum: |X(f)|^2
      sxxAccum[i] += xRe * xRe + xIm * xIm;

      // Cross-spectrum: Y(f) · conj(X(f))
      syxRealAccum[i] += yRe * xRe + yIm * xIm;
      syxImagAccum[i] += yIm * xRe - yRe * xIm;
    }
    validWindows++;
  }

  if (validWindows === 0) return undefined;

  // Average spectra
  for (let i = 0; i < numBins; i++) {
    sxxAccum[i] /= validWindows;
    syxRealAccum[i] /= validWindows;
    syxImagAccum[i] /= validWindows;
  }

  // Compute regularization parameter (λ = ratio * mean(Sxx))
  let meanSxx = 0;
  for (let i = 0; i < numBins; i++) {
    meanSxx += sxxAccum[i];
  }
  meanSxx /= numBins;
  const lambda = WIENER_REGULARIZATION_RATIO * meanSxx;

  // Compute transfer function H(f) = Syx(f) / (Sxx(f) + λ)
  const frequencies = new Float64Array(numBins);
  const magnitude = new Float64Array(numBins);
  const phase = new Float64Array(numBins);

  for (let i = 0; i < numBins; i++) {
    frequencies[i] = i * freqResolution;

    const denom = sxxAccum[i] + lambda;
    const hRe = syxRealAccum[i] / denom;
    const hIm = syxImagAccum[i] / denom;

    magnitude[i] = Math.sqrt(hRe * hRe + hIm * hIm);
    phase[i] = (Math.atan2(hIm, hRe) * 180) / Math.PI;
  }

  return { frequencies, magnitude, phase };
}

/**
 * Extract frequency-domain metrics from a transfer function.
 */
export function extractFrequencyMetrics(
  tf: TransferFunction,
  sampleRate: number
): FrequencyDomainMetrics {
  const { frequencies, magnitude, phase } = tf;
  const maxFreqIdx = findMaxFreqIndex(frequencies, TRANSFER_FUNCTION_MAX_HZ);

  // Find DC gain (magnitude at lowest non-zero frequency bin)
  const dcGain = magnitude.length > 1 ? magnitude[1] : 1;

  // Find -3dB bandwidth: frequency where |H| drops below 0.707 * dcGain
  const threshold3dB = 0.707 * dcGain;
  let bandwidth3dB = frequencies[maxFreqIdx]; // default to max if never drops
  for (let i = 1; i < maxFreqIdx; i++) {
    if (magnitude[i] < threshold3dB) {
      // Linear interpolation between bins
      const f0 = frequencies[i - 1];
      const f1 = frequencies[i];
      const m0 = magnitude[i - 1];
      const m1 = magnitude[i];
      if (m0 !== m1) {
        bandwidth3dB = f0 + ((threshold3dB - m0) / (m1 - m0)) * (f1 - f0);
      } else {
        bandwidth3dB = f0;
      }
      break;
    }
  }

  // Phase margin: phase at bandwidth frequency (margin = 180 + phase)
  const bwIdx = findClosestIndex(frequencies, bandwidth3dB);
  const phaseAtBw = bwIdx < phase.length ? phase[bwIdx] : -180;
  const phaseMargin = 180 + phaseAtBw;

  // Peak resonance: maximum magnitude in the analysis range
  let peakResonance = 0;
  let peakResonanceFrequency = 0;
  for (let i = 1; i < maxFreqIdx; i++) {
    if (magnitude[i] > peakResonance) {
      peakResonance = magnitude[i];
      peakResonanceFrequency = frequencies[i];
    }
  }

  // Normalize peak resonance relative to DC gain
  const normalizedPeakResonance = dcGain > 0 ? peakResonance / dcGain : peakResonance;

  // Synthetic step response via IFFT
  const { overshoot, riseTimeMs } = computeSyntheticStepResponse(tf, sampleRate);

  return {
    bandwidth3dB: Math.round(bandwidth3dB * 10) / 10,
    phaseMargin: Math.round(phaseMargin * 10) / 10,
    peakResonance: Math.round(normalizedPeakResonance * 1000) / 1000,
    peakResonanceFrequency: Math.round(peakResonanceFrequency * 10) / 10,
    estimatedOvershoot: Math.round(overshoot * 10) / 10,
    estimatedRiseTimeMs: Math.round(riseTimeMs * 10) / 10,
  };
}

/**
 * Compute a synthetic step response from the transfer function via IFFT.
 *
 * Method: H(f) represents the frequency response. To get the step response,
 * we divide H(f) by j*2πf (step = integral of impulse response) and IFFT.
 * Simpler approach: IFFT of H(f) gives impulse response, then cumsum for step.
 */
export function computeSyntheticStepResponse(
  tf: TransferFunction,
  sampleRate: number
): { overshoot: number; riseTimeMs: number } {
  const numBins = tf.magnitude.length;
  const N = (numBins - 1) * 2; // Original FFT size

  if (N < 16) return { overshoot: 0, riseTimeMs: 0 };

  const fft = new FFT(N);

  // Reconstruct complex H(f) from magnitude and phase
  const hComplex = fft.createComplexArray();
  for (let i = 0; i < numBins; i++) {
    const mag = tf.magnitude[i];
    const phaseRad = (tf.phase[i] * Math.PI) / 180;
    hComplex[2 * i] = mag * Math.cos(phaseRad);
    hComplex[2 * i + 1] = mag * Math.sin(phaseRad);
  }
  // Mirror for negative frequencies (conjugate symmetry)
  for (let i = numBins; i < N; i++) {
    const mirrorIdx = N - i;
    hComplex[2 * i] = hComplex[2 * mirrorIdx];
    hComplex[2 * i + 1] = -hComplex[2 * mirrorIdx + 1];
  }

  // IFFT → impulse response
  const impulse = fft.createComplexArray();
  fft.inverseTransform(impulse, hComplex);

  // Extract real part of impulse response
  const impulseReal = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    impulseReal[i] = impulse[2 * i];
  }

  // Cumulative sum → step response
  const stepResponse = new Float64Array(N);
  stepResponse[0] = impulseReal[0];
  for (let i = 1; i < N; i++) {
    stepResponse[i] = stepResponse[i - 1] + impulseReal[i];
  }

  // Only look at first 500 samples (~60-125ms depending on sample rate)
  const lookAhead = Math.min(500, N);
  const dtMs = 1000 / sampleRate;

  // Find steady state (last quarter of window)
  const quarterStart = Math.floor(lookAhead * 0.75);
  let steadyState = 0;
  for (let i = quarterStart; i < lookAhead; i++) {
    steadyState += stepResponse[i];
  }
  steadyState /= lookAhead - quarterStart;

  if (Math.abs(steadyState) < 1e-10) return { overshoot: 0, riseTimeMs: 0 };

  // Peak value
  let peak = 0;
  for (let i = 0; i < lookAhead; i++) {
    if (Math.abs(stepResponse[i]) > Math.abs(peak)) {
      peak = stepResponse[i];
    }
  }

  const overshoot = Math.max(
    0,
    ((Math.abs(peak) - Math.abs(steadyState)) / Math.abs(steadyState)) * 100
  );

  // Rise time (10% to 90%)
  const low = 0.1 * steadyState;
  const high = 0.9 * steadyState;
  let tLow = -1;
  let tHigh = -1;

  for (let i = 0; i < lookAhead; i++) {
    if (
      tLow < 0 &&
      ((steadyState > 0 && stepResponse[i] >= low) || (steadyState < 0 && stepResponse[i] <= low))
    ) {
      tLow = i;
    }
    if (
      tHigh < 0 &&
      ((steadyState > 0 && stepResponse[i] >= high) || (steadyState < 0 && stepResponse[i] <= high))
    ) {
      tHigh = i;
    }
  }

  const riseTimeMs = tLow >= 0 && tHigh > tLow ? (tHigh - tLow) * dtMs : 0;

  return { overshoot, riseTimeMs };
}

/** Compute energy (sum of squares) of a signal. */
function computeEnergy(signal: Float64Array): number {
  let e = 0;
  for (let i = 0; i < signal.length; i++) {
    e += signal[i] * signal[i];
  }
  return e / signal.length;
}

/** Find the index of the frequency bin closest to but not exceeding maxHz. */
function findMaxFreqIndex(frequencies: Float64Array, maxHz: number): number {
  for (let i = frequencies.length - 1; i >= 0; i--) {
    if (frequencies[i] <= maxHz) return i + 1;
  }
  return frequencies.length;
}

/** Find the index of the frequency bin closest to the target frequency. */
function findClosestIndex(frequencies: Float64Array, targetHz: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < frequencies.length; i++) {
    const dist = Math.abs(frequencies[i] - targetHz);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}
