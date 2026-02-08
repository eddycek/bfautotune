/**
 * Types for FFT-based noise analysis, filter tuning, and PID step-response analysis.
 */

import type { PIDConfiguration } from './pid.types';


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
  step: 'segmenting' | 'fft' | 'analyzing' | 'recommending' | 'detecting' | 'measuring' | 'scoring';
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
  dyn_notch_min_hz: 100,
  dyn_notch_max_hz: 600,
};

// ---- PID Step Response Analysis Types ----

/** A detected step input event in the setpoint */
export interface StepEvent {
  /** Axis index: 0=roll, 1=pitch, 2=yaw */
  axis: 0 | 1 | 2;
  /** Sample index where the step begins */
  startIndex: number;
  /** Sample index for the end of the response window */
  endIndex: number;
  /** Step size in deg/s */
  magnitude: number;
  /** Direction of the step */
  direction: 'positive' | 'negative';
}

/** Metrics extracted from a single step response */
export interface StepResponse {
  /** The step event this response corresponds to */
  step: StepEvent;
  /** Time from 10% to 90% of final value in ms */
  riseTimeMs: number;
  /** (peak - target) / target * 100 */
  overshootPercent: number;
  /** Time to stay within +/-2% of target in ms */
  settlingTimeMs: number;
  /** Delay from setpoint change to first gyro movement in ms */
  latencyMs: number;
  /** Number of oscillations before settling */
  ringingCount: number;
  /** Absolute max gyro value in response window */
  peakValue: number;
  /** Final settled gyro value */
  steadyStateValue: number;
}

/** Aggregated step response metrics for one axis */
export interface AxisStepProfile {
  /** Individual step responses */
  responses: StepResponse[];
  /** Mean overshoot percentage across all steps */
  meanOvershoot: number;
  /** Mean rise time in ms */
  meanRiseTimeMs: number;
  /** Mean settling time in ms */
  meanSettlingTimeMs: number;
  /** Mean latency in ms */
  meanLatencyMs: number;
}

/** A single PID recommendation */
export interface PIDRecommendation {
  /** Betaflight CLI setting name (e.g. "pid_roll_d") */
  setting: string;
  /** Current value on the FC */
  currentValue: number;
  /** Recommended new value */
  recommendedValue: number;
  /** Beginner-friendly explanation */
  reason: string;
  /** What aspect this affects */
  impact: 'response' | 'stability' | 'both';
  /** How confident the recommendation is */
  confidence: 'high' | 'medium' | 'low';
}

/** Complete PID analysis result */
export interface PIDAnalysisResult {
  /** Step response profile for roll axis */
  roll: AxisStepProfile;
  /** Step response profile for pitch axis */
  pitch: AxisStepProfile;
  /** Step response profile for yaw axis */
  yaw: AxisStepProfile;
  /** PID tuning recommendations */
  recommendations: PIDRecommendation[];
  /** 1-2 sentence summary for beginners */
  summary: string;
  /** Time taken for analysis in ms */
  analysisTimeMs: number;
  /** Which session was analyzed */
  sessionIndex: number;
  /** Total steps detected across all axes */
  stepsDetected: number;
  /** Current PID configuration used for analysis */
  currentPIDs: PIDConfiguration;
}
