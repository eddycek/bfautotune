/**
 * Chirp flight analysis for BF 4.6+ system identification.
 *
 * Detects chirp excitation signals (swept-sine) from BBL headers or setpoint
 * pattern, then computes the closed-loop transfer function via cross-spectral
 * density: H(f) = Sxy(f) / Sxx(f) with coherence checking.
 */
import FFT from 'fft.js';
import type { BlackboxFlightData } from '@shared/types/blackbox.types';
import type {
  ChirpFlightMetadata,
  ChirpAnalysisResult,
  AxisChirpAnalysis,
  TransferFunction,
  CoherenceFunction,
  ChirpBodeMetrics,
} from '@shared/types/analysis.types';
import { applyHanningWindow } from './FFTCompute';
import {
  CHIRP_FFT_WINDOW_SIZE,
  CHIRP_MIN_FREQUENCY_HZ,
  CHIRP_MAX_FREQUENCY_HZ,
  CHIRP_MIN_DURATION_S,
  CHIRP_MIN_COHERENCE,
  CHIRP_DETECTION_WINDOW_SIZE,
  CHIRP_MIN_SWEEP_OCTAVES,
  CHIRP_MONOTONIC_RATIO,
} from './constants';

const AXIS_NAMES = ['roll', 'pitch', 'yaw'] as const;

/**
 * Detect chirp signal from BBL headers or setpoint pattern.
 */
export function detectChirpSignal(
  flightData: BlackboxFlightData,
  rawHeaders?: Map<string, string>
): ChirpFlightMetadata {
  // 1. Header-based detection (BF 4.6+ chirp/sys_id debug mode)
  if (rawHeaders) {
    const debugMode = rawHeaders.get('debug_mode')?.toUpperCase();
    if (debugMode === 'CHIRP' || debugMode === 'SYS_ID') {
      const chirpAxis = parseInt(rawHeaders.get('chirp_axis') ?? '0', 10);
      const axis = (chirpAxis >= 0 && chirpAxis <= 2 ? chirpAxis : 0) as 0 | 1 | 2;
      return {
        detected: true,
        axis,
        source: 'header',
        startIndex: 0,
        endIndex: flightData.frameCount,
        durationSeconds: flightData.durationSeconds,
      };
    }
  }

  // 2. Pattern-based detection (swept-sine in setpoint)
  for (let axisIdx = 0; axisIdx < 3; axisIdx++) {
    const result = detectSweptSine(flightData.setpoint[axisIdx].values, flightData.sampleRateHz);
    if (result) {
      return {
        detected: true,
        axis: axisIdx as 0 | 1 | 2,
        startIndex: result.startIndex,
        endIndex: result.endIndex,
        minFrequencyHz: result.minHz,
        maxFrequencyHz: result.maxHz,
        durationSeconds: (result.endIndex - result.startIndex) / flightData.sampleRateHz,
        source: 'pattern',
      };
    }
  }

  return { detected: false, source: 'none' };
}

/**
 * Detect swept-sine (chirp) pattern using short-time FFT peak tracking.
 */
function detectSweptSine(
  signal: Float64Array,
  sampleRate: number
): { startIndex: number; endIndex: number; minHz: number; maxHz: number } | undefined {
  const windowSize = CHIRP_DETECTION_WINDOW_SIZE;
  const step = windowSize / 2;
  const numWindows = Math.floor((signal.length - windowSize) / step);

  if (numWindows < 4) return undefined;

  const peakFreqs: number[] = [];
  const windowIndices: number[] = [];
  const minBin = Math.ceil((CHIRP_MIN_FREQUENCY_HZ * windowSize) / sampleRate);
  const maxBinLimit = Math.floor((CHIRP_MAX_FREQUENCY_HZ * windowSize) / sampleRate);

  for (let w = 0; w < numWindows; w++) {
    const start = w * step;
    const segment = signal.subarray(start, start + windowSize);

    // Skip silent segments
    let energy = 0;
    for (let i = 0; i < segment.length; i++) {
      energy += segment[i] * segment[i];
    }
    if (energy / segment.length < 1) continue;

    const windowed = applyHanningWindow(segment);
    const fft = new FFT(windowSize);
    const out = fft.createComplexArray();
    fft.realTransform(out, windowed);

    // Find peak frequency bin
    let maxMag = 0;
    let maxBin = 0;
    for (let i = minBin; i <= maxBinLimit && i < windowSize / 2; i++) {
      const re = out[2 * i];
      const im = out[2 * i + 1];
      const mag = re * re + im * im;
      if (mag > maxMag) {
        maxMag = mag;
        maxBin = i;
      }
    }

    if (maxBin > 0) {
      peakFreqs.push((maxBin * sampleRate) / windowSize);
      windowIndices.push(start);
    }
  }

  if (peakFreqs.length < 4) return undefined;

  // Check for monotonically increasing frequency
  let increasing = 0;
  for (let i = 1; i < peakFreqs.length; i++) {
    if (peakFreqs[i] > peakFreqs[i - 1]) increasing++;
  }
  if (increasing / (peakFreqs.length - 1) < CHIRP_MONOTONIC_RATIO) return undefined;

  // Check frequency range covers enough octaves
  const minFreq = Math.min(...peakFreqs);
  const maxFreq = Math.max(...peakFreqs);
  if (minFreq <= 0 || Math.log2(maxFreq / minFreq) < CHIRP_MIN_SWEEP_OCTAVES) return undefined;

  // Check duration
  const duration =
    (windowIndices[windowIndices.length - 1] - windowIndices[0] + windowSize) / sampleRate;
  if (duration < CHIRP_MIN_DURATION_S) return undefined;

  return {
    startIndex: windowIndices[0],
    endIndex: windowIndices[windowIndices.length - 1] + windowSize,
    minHz: minFreq,
    maxHz: maxFreq,
  };
}

/**
 * Compute cross-spectral density transfer function and coherence using Welch's method.
 *
 * H(f) = Sxy(f) / Sxx(f)
 * γ²(f) = |Sxy(f)|² / (Sxx(f) · Syy(f))
 */
export function computeCrossSpectralTransfer(
  input: Float64Array,
  output: Float64Array,
  sampleRate: number,
  windowSize: number = CHIRP_FFT_WINDOW_SIZE
): { transferFunction: TransferFunction; coherence: CoherenceFunction } | undefined {
  const N = Math.min(input.length, output.length);
  if (N < windowSize) return undefined;

  const step = Math.floor(windowSize / 2);
  const numWindows = Math.floor((N - windowSize) / step) + 1;
  if (numWindows < 1) return undefined;

  const numBins = windowSize / 2 + 1;

  // Accumulators
  const sxxAcc = new Float64Array(numBins);
  const syyAcc = new Float64Array(numBins);
  const sxyRealAcc = new Float64Array(numBins);
  const sxyImagAcc = new Float64Array(numBins);

  for (let w = 0; w < numWindows; w++) {
    const start = w * step;
    const xWindowed = applyHanningWindow(input.subarray(start, start + windowSize));
    const yWindowed = applyHanningWindow(output.subarray(start, start + windowSize));

    const fft = new FFT(windowSize);
    const xOut = fft.createComplexArray();
    const yOut = fft.createComplexArray();
    fft.realTransform(xOut, xWindowed);
    fft.completeSpectrum(xOut);
    fft.realTransform(yOut, yWindowed);
    fft.completeSpectrum(yOut);

    for (let i = 0; i < numBins; i++) {
      const xRe = xOut[2 * i];
      const xIm = xOut[2 * i + 1];
      const yRe = yOut[2 * i];
      const yIm = yOut[2 * i + 1];

      // Sxx += |X|²
      sxxAcc[i] += xRe * xRe + xIm * xIm;
      // Syy += |Y|²
      syyAcc[i] += yRe * yRe + yIm * yIm;
      // Sxy += conj(X) · Y
      sxyRealAcc[i] += xRe * yRe + xIm * yIm;
      sxyImagAcc[i] += xRe * yIm - xIm * yRe;
    }
  }

  const frequencies = new Float64Array(numBins);
  const magnitude = new Float64Array(numBins);
  const phase = new Float64Array(numBins);
  const coherence = new Float64Array(numBins);
  const freqRes = sampleRate / windowSize;

  for (let i = 0; i < numBins; i++) {
    frequencies[i] = i * freqRes;

    const sxx = sxxAcc[i] / numWindows;
    const syy = syyAcc[i] / numWindows;
    const sxyR = sxyRealAcc[i] / numWindows;
    const sxyI = sxyImagAcc[i] / numWindows;

    // H(f) = Sxy / Sxx
    if (sxx > 1e-12) {
      const hRe = sxyR / sxx;
      const hIm = sxyI / sxx;
      magnitude[i] = Math.sqrt(hRe * hRe + hIm * hIm);
      phase[i] = Math.atan2(hIm, hRe) * (180 / Math.PI);
    }

    // γ²(f) = |Sxy|² / (Sxx · Syy)
    const sxyMagSq = sxyR * sxyR + sxyI * sxyI;
    const denom = sxx * syy;
    coherence[i] = denom > 1e-24 ? sxyMagSq / denom : 0;
  }

  return {
    transferFunction: { frequencies, magnitude, phase },
    coherence: { frequencies: frequencies.slice(), coherence },
  };
}

/**
 * Extract Bode metrics from a transfer function.
 */
export function extractBodeMetrics(
  tf: TransferFunction,
  sampleRate: number
): ChirpBodeMetrics {
  const maxFreq = Math.min(sampleRate / 2, CHIRP_MAX_FREQUENCY_HZ);

  // DC gain (use bin 1 if bin 0 is zero — DC offset artifacts)
  const dcMag = tf.magnitude[1] > 0 ? tf.magnitude[1] : tf.magnitude[0] > 0 ? tf.magnitude[0] : 1;

  // -3dB bandwidth
  let bandwidth3dB = maxFreq;
  const threshold = dcMag * Math.SQRT1_2;
  for (let i = 2; i < tf.frequencies.length; i++) {
    if (tf.frequencies[i] > maxFreq) break;
    if (tf.magnitude[i] < threshold && tf.magnitude[i - 1] >= threshold) {
      const f0 = tf.frequencies[i - 1];
      const f1 = tf.frequencies[i];
      const m0 = tf.magnitude[i - 1];
      const m1 = tf.magnitude[i];
      const ratio = m0 - m1 > 1e-12 ? (m0 - threshold) / (m0 - m1) : 0;
      bandwidth3dB = f0 + ratio * (f1 - f0);
      break;
    }
  }

  // Peak resonance (skip DC)
  let peakResonance = 0;
  let peakResonanceFrequency = 0;
  for (let i = 1; i < tf.frequencies.length; i++) {
    if (tf.frequencies[i] > maxFreq) break;
    if (tf.magnitude[i] > peakResonance) {
      peakResonance = tf.magnitude[i];
      peakResonanceFrequency = tf.frequencies[i];
    }
  }

  // Phase margin: phase at unity gain crossover + 180°
  let phaseMargin = 90;
  for (let i = 2; i < tf.frequencies.length; i++) {
    if (tf.frequencies[i] > maxFreq) break;
    if (tf.magnitude[i - 1] >= 1 && tf.magnitude[i] < 1) {
      const m0 = tf.magnitude[i - 1];
      const m1 = tf.magnitude[i];
      const ratio = m0 - m1 > 1e-12 ? (m0 - 1) / (m0 - m1) : 0;
      const crossoverPhase = tf.phase[i - 1] + ratio * (tf.phase[i] - tf.phase[i - 1]);
      phaseMargin = 180 + crossoverPhase;
      break;
    }
  }

  // Gain margin: 1/|H| at -180° phase crossover
  let gainMargin = 20;
  for (let i = 2; i < tf.frequencies.length; i++) {
    if (tf.frequencies[i] > maxFreq) break;
    if (tf.phase[i - 1] > -180 && tf.phase[i] <= -180) {
      const p0 = tf.phase[i - 1];
      const p1 = tf.phase[i];
      const ratio = p0 - p1 > 1e-12 ? (p0 - -180) / (p0 - p1) : 0;
      const crossoverMag = tf.magnitude[i - 1] + ratio * (tf.magnitude[i] - tf.magnitude[i - 1]);
      if (crossoverMag > 1e-12) {
        gainMargin = 20 * Math.log10(1 / crossoverMag);
      }
      break;
    }
  }

  return { bandwidth3dB, phaseMargin, gainMargin, peakResonance, peakResonanceFrequency };
}

/**
 * Run chirp analysis on flight data.
 *
 * @returns ChirpAnalysisResult if a chirp signal is detected, undefined otherwise
 */
export function analyzeChirp(
  flightData: BlackboxFlightData,
  rawHeaders?: Map<string, string>
): ChirpAnalysisResult | undefined {
  const metadata = detectChirpSignal(flightData, rawHeaders);
  if (!metadata.detected || metadata.axis === undefined) {
    return undefined;
  }

  const startIdx = metadata.startIndex ?? 0;
  const endIdx = metadata.endIndex ?? flightData.frameCount;

  const axisIdx = metadata.axis;
  const input = flightData.setpoint[axisIdx].values.subarray(startIdx, endIdx);
  const output = flightData.gyro[axisIdx].values.subarray(startIdx, endIdx);

  const result = computeCrossSpectralTransfer(input, output, flightData.sampleRateHz);
  if (!result) return undefined;

  const metrics = extractBodeMetrics(result.transferFunction, flightData.sampleRateHz);

  // Compute mean coherence in the chirp frequency range
  const minHz = metadata.minFrequencyHz ?? CHIRP_MIN_FREQUENCY_HZ;
  const maxHz = metadata.maxFrequencyHz ?? CHIRP_MAX_FREQUENCY_HZ;
  let cohSum = 0;
  let cohCount = 0;
  for (let i = 0; i < result.coherence.frequencies.length; i++) {
    const f = result.coherence.frequencies[i];
    if (f >= minHz && f <= maxHz) {
      cohSum += result.coherence.coherence[i];
      cohCount++;
    }
  }
  const meanCoherence = cohCount > 0 ? cohSum / cohCount : 0;

  const axes: AxisChirpAnalysis[] = [
    {
      axis: AXIS_NAMES[axisIdx],
      transferFunction: result.transferFunction,
      coherence: result.coherence,
      metrics,
      meanCoherence,
    },
  ];

  return { metadata, axes };
}
