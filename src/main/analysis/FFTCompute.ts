/**
 * FFT computation module for gyro noise analysis.
 *
 * Provides windowed FFT, power spectral density via Welch's method,
 * and frequency bin calculation. Uses fft.js for the core transform.
 */
import FFT from 'fft.js';
import type { PowerSpectrum } from '@shared/types/analysis.types';
import { FFT_WINDOW_SIZE, FFT_OVERLAP, FREQUENCY_MIN_HZ, FREQUENCY_MAX_HZ } from './constants';

/**
 * Apply a Hanning window to a signal segment in-place.
 * w(n) = 0.5 * (1 - cos(2*pi*n / (N-1)))
 */
export function applyHanningWindow(signal: Float64Array): Float64Array {
  const N = signal.length;
  const windowed = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    windowed[i] = signal[i] * w;
  }
  return windowed;
}

/**
 * Compute the magnitude spectrum (in dB) from a real-valued signal segment.
 *
 * @param segment - Time-domain samples (length must be power of 2)
 * @param sampleRate - Sample rate in Hz
 * @param applyWindow - Whether to apply Hanning window (default true)
 * @returns PowerSpectrum with frequencies and magnitudes in dB
 */
export function computeSegmentSpectrum(
  segment: Float64Array,
  sampleRate: number,
  applyWindow = true
): PowerSpectrum {
  const N = segment.length;
  if (N === 0 || (N & (N - 1)) !== 0) {
    throw new Error(`FFT size must be a power of 2, got ${N}`);
  }

  // Apply window
  const windowed = applyWindow ? applyHanningWindow(segment) : segment;

  // Run real FFT
  const fft = new FFT(N);
  const out = fft.createComplexArray();
  fft.realTransform(out, windowed);
  fft.completeSpectrum(out);

  // Compute magnitudes for positive frequencies (0 to N/2 inclusive)
  const numBins = N / 2 + 1;
  const frequencies = new Float64Array(numBins);
  const magnitudes = new Float64Array(numBins);
  const freqResolution = sampleRate / N;

  for (let i = 0; i < numBins; i++) {
    frequencies[i] = i * freqResolution;

    // Complex magnitude: sqrt(re^2 + im^2)
    const re = out[2 * i];
    const im = out[2 * i + 1];
    const mag = Math.sqrt(re * re + im * im) / N;

    // Convert to dB (with floor to avoid -Infinity)
    magnitudes[i] = mag > 1e-12 ? 20 * Math.log10(mag) : -240;
  }

  return { frequencies, magnitudes };
}

/**
 * Compute the power spectral density using Welch's method.
 *
 * Splits the signal into overlapping windows, computes FFT on each,
 * and averages the magnitude spectra. This reduces variance in the estimate.
 *
 * @param signal - Full time-domain signal
 * @param sampleRate - Sample rate in Hz
 * @param windowSize - FFT window size (must be power of 2)
 * @returns Averaged PowerSpectrum
 */
export function computePowerSpectrum(
  signal: Float64Array,
  sampleRate: number,
  windowSize: number = FFT_WINDOW_SIZE
): PowerSpectrum {
  if (signal.length < windowSize) {
    // Signal shorter than one window — use next smaller power of 2
    const smallerSize = nextPowerOf2(signal.length);
    if (smallerSize < 16) {
      throw new Error(`Signal too short for FFT: ${signal.length} samples`);
    }
    return computeSegmentSpectrum(
      signal.subarray(0, smallerSize),
      sampleRate,
      true
    );
  }

  const step = Math.floor(windowSize * (1 - FFT_OVERLAP));
  const numWindows = Math.floor((signal.length - windowSize) / step) + 1;

  if (numWindows <= 0) {
    return computeSegmentSpectrum(
      signal.subarray(0, windowSize),
      sampleRate,
      true
    );
  }

  // Accumulate spectra
  const numBins = windowSize / 2 + 1;
  const avgMagnitudes = new Float64Array(numBins); // in linear scale for averaging
  let frequencies: Float64Array | null = null;

  for (let w = 0; w < numWindows; w++) {
    const start = w * step;
    const segment = signal.subarray(start, start + windowSize);
    const spectrum = computeSegmentSpectrum(segment, sampleRate, true);

    if (!frequencies) {
      frequencies = spectrum.frequencies;
    }

    // Average in linear power domain (convert dB back to linear for averaging)
    for (let i = 0; i < numBins; i++) {
      avgMagnitudes[i] += Math.pow(10, spectrum.magnitudes[i] / 20);
    }
  }

  // Convert averaged linear magnitudes back to dB
  const magnitudes = new Float64Array(numBins);
  for (let i = 0; i < numBins; i++) {
    const avg = avgMagnitudes[i] / numWindows;
    magnitudes[i] = avg > 1e-12 ? 20 * Math.log10(avg) : -240;
  }

  return { frequencies: frequencies!, magnitudes };
}

/**
 * Trim a power spectrum to only include frequencies within the range of interest.
 */
export function trimSpectrum(
  spectrum: PowerSpectrum,
  minHz: number = FREQUENCY_MIN_HZ,
  maxHz: number = FREQUENCY_MAX_HZ
): PowerSpectrum {
  const { frequencies, magnitudes } = spectrum;

  // Find first index >= minHz and last index <= maxHz
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < frequencies.length; i++) {
    if (frequencies[i] >= minHz && startIdx === -1) {
      startIdx = i;
    }
    if (frequencies[i] <= maxHz) {
      endIdx = i;
    }
  }

  // No bins in range
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return {
      frequencies: new Float64Array(0),
      magnitudes: new Float64Array(0),
    };
  }

  return {
    frequencies: frequencies.slice(startIdx, endIdx + 1),
    magnitudes: magnitudes.slice(startIdx, endIdx + 1),
  };
}

/**
 * Find the largest power of 2 less than or equal to n.
 */
function nextPowerOf2(n: number): number {
  let p = 1;
  while (p * 2 <= n) {
    p *= 2;
  }
  return p;
}
