/**
 * Types for FFT-based noise analysis and filter tuning recommendations.
 */

/** Power spectrum for one axis */
export interface PowerSpectrum {
  /** Frequency bins in Hz */
  frequencies: Float64Array;
  /** Magnitude values in dB */
  magnitudes: Float64Array;
}

/** A detected noise peak */
export interface NoisePeak {
  /** Peak frequency in Hz */
  frequency: number;
  /** Amplitude above local noise floor in dB */
  amplitude: number;
  /** Classification of peak source */
  type: 'frame_resonance' | 'motor_harmonic' | 'electrical' | 'unknown';
}

/** Noise characteristics for one axis */
export interface AxisNoiseProfile {
  /** Power spectrum data */
  spectrum: PowerSpectrum;
  /** Overall noise floor in dB */
  noiseFloorDb: number;
  /** Detected noise peaks */
  peaks: NoisePeak[];
}

/** Overall noise assessment across all axes */
export interface NoiseProfile {
  roll: AxisNoiseProfile;
  pitch: AxisNoiseProfile;
  yaw: AxisNoiseProfile;
  /** Summary noise level */
  overallLevel: 'low' | 'medium' | 'high';
}

/** A single filter recommendation */
export interface FilterRecommendation {
  /** Betaflight CLI setting name (e.g. "gyro_lpf1_static_hz") */
  setting: string;
  /** Current value on the FC */
  currentValue: number;
  /** Recommended new value */
  recommendedValue: number;
  /** Beginner-friendly explanation */
  reason: string;
  /** What this change affects */
  impact: 'latency' | 'noise' | 'both';
  /** How confident the recommendation is */
  confidence: 'high' | 'medium' | 'low';
}

/** Complete filter analysis result */
export interface FilterAnalysisResult {
  /** Noise profile for all axes */
  noise: NoiseProfile;
  /** List of filter tuning recommendations */
  recommendations: FilterRecommendation[];
  /** 1-2 sentence summary for beginners */
  summary: string;
  /** Time taken for analysis in ms */
  analysisTimeMs: number;
  /** Which session was analyzed */
  sessionIndex: number;
  /** How many steady flight segments were used */
  segmentsUsed: number;
}

/** A steady flight segment identified from throttle/gyro data */
export interface FlightSegment {
  /** Start sample index in the time series */
  startIndex: number;
  /** End sample index (exclusive) */
  endIndex: number;
  /** Duration in seconds */
  durationSeconds: number;
  /** Mean throttle value in this segment (0-100%) */
  averageThrottle: number;
}

/** Progress during analysis pipeline */
export interface AnalysisProgress {
  /** Current pipeline step */
  step: 'segmenting' | 'fft' | 'analyzing' | 'recommending';
  /** Completion percentage (0-100) */
  percent: number;
}

/** Input for filter analysis - current filter settings from the FC */
export interface CurrentFilterSettings {
  /** Gyro lowpass 1 cutoff in Hz (0 = disabled) */
  gyro_lpf1_static_hz: number;
  /** Gyro lowpass 2 cutoff in Hz (0 = disabled) */
  gyro_lpf2_static_hz: number;
  /** D-term lowpass 1 cutoff in Hz (0 = disabled) */
  dterm_lpf1_static_hz: number;
  /** D-term lowpass 2 cutoff in Hz (0 = disabled) */
  dterm_lpf2_static_hz: number;
  /** Dynamic notch filter minimum Hz */
  dyn_notch_min_hz: number;
  /** Dynamic notch filter maximum Hz */
  dyn_notch_max_hz: number;
}

/** Default filter settings (Betaflight 4.4+ defaults) */
export const DEFAULT_FILTER_SETTINGS: CurrentFilterSettings = {
  gyro_lpf1_static_hz: 250,
  gyro_lpf2_static_hz: 500,
  dterm_lpf1_static_hz: 150,
  dterm_lpf2_static_hz: 150,
  dyn_notch_min_hz: 150,
  dyn_notch_max_hz: 600,
};
