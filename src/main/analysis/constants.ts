/**
 * Constants for FFT analysis, filter tuning, and PID step-response analysis.
 * All thresholds are tunable — adjust based on real-world data.
 */

// ---- FFT Parameters ----

/** FFT window size in samples. 4096 at 8 kHz → 0.5s window, ~2 Hz resolution */
export const FFT_WINDOW_SIZE = 4096;

/** Overlap ratio for Welch's method (0.5 = 50%) */
export const FFT_OVERLAP = 0.5;

/** Minimum frequency of interest in Hz (below this is mostly vibration/drift) */
export const FREQUENCY_MIN_HZ = 20;

/** Maximum frequency of interest in Hz (above this is typically aliased/irrelevant) */
export const FREQUENCY_MAX_HZ = 1000;

// ---- Segment Selection ----

/** Minimum throttle percentage to consider "in flight" (0-1 scale, 0.15 = 15%) */
export const THROTTLE_MIN_FLIGHT = 0.15;

/** Maximum throttle percentage for "hover" detection (0-1 scale) */
export const THROTTLE_MAX_HOVER = 0.75;

/** Maximum gyro standard deviation (deg/s) for a "steady" segment */
export const GYRO_STEADY_MAX_STD = 50;

/** Minimum segment duration in seconds */
export const SEGMENT_MIN_DURATION_S = 0.5;

/** Target window duration in seconds for gyro variance check */
export const SEGMENT_WINDOW_DURATION_S = 0.15;

// ---- Throttle Sweep Detection ----

/** Minimum throttle range covered by a sweep (0-1 scale, 0.4 = 40%) */
export const SWEEP_MIN_THROTTLE_RANGE = 0.4;

/** Minimum sweep duration in seconds */
export const SWEEP_MIN_DURATION_S = 2.0;

/** Maximum sweep duration in seconds */
export const SWEEP_MAX_DURATION_S = 15.0;

/** Maximum throttle regression residual for "monotonic" classification */
export const SWEEP_MAX_RESIDUAL = 0.15;

// ---- Noise Analysis ----

/** Peak detection: minimum prominence above local noise floor in dB */
export const PEAK_PROMINENCE_DB = 6;

/** Number of bins on each side for local noise floor estimation */
export const PEAK_LOCAL_WINDOW_BINS = 50;

/** Percentile for noise floor estimation (0.25 = lower quartile) */
export const NOISE_FLOOR_PERCENTILE = 0.25;

/** Noise level thresholds in dB (noise floor above these values) */
export const NOISE_LEVEL_HIGH_DB = -30;
export const NOISE_LEVEL_MEDIUM_DB = -50;

// ---- Peak Classification Frequency Bands ----

/** Frame resonance: typically 80-200 Hz */
export const FRAME_RESONANCE_MIN_HZ = 80;
export const FRAME_RESONANCE_MAX_HZ = 200;

/** Electrical noise: typically above 500 Hz */
export const ELECTRICAL_NOISE_MIN_HZ = 500;

/** Motor harmonic detection: tolerance as fraction of expected harmonic frequency */
export const MOTOR_HARMONIC_TOLERANCE_RATIO = 0.05;

/** Motor harmonic detection: minimum tolerance in Hz (FFT bin resolution floor) */
export const MOTOR_HARMONIC_TOLERANCE_MIN_HZ = 5;

/** Minimum number of equally-spaced peaks to classify as motor harmonics */
export const MOTOR_HARMONIC_MIN_PEAKS = 3;

// ---- Filter Recommendation Safety Bounds ----

/** Absolute minimum gyro lowpass 1 cutoff in Hz (BF guide: 50 very noisy, 80 slightly noisy) */
export const GYRO_LPF1_MIN_HZ = 75;

/** Absolute maximum gyro lowpass 1 cutoff in Hz */
export const GYRO_LPF1_MAX_HZ = 300;

/** Absolute minimum D-term lowpass 1 cutoff in Hz (BF guide: "70-90 Hz range") */
export const DTERM_LPF1_MIN_HZ = 70;

/** Absolute maximum D-term lowpass 1 cutoff in Hz */
export const DTERM_LPF1_MAX_HZ = 200;

// ---- RPM Filter Conditional Bounds ----

/** Maximum gyro LPF1 cutoff when RPM filter is active (Hz) */
export const GYRO_LPF1_MAX_HZ_RPM = 500;

/** Maximum D-term LPF1 cutoff when RPM filter is active (Hz) */
export const DTERM_LPF1_MAX_HZ_RPM = 300;

/** Recommended dynamic notch count with RPM filter active (frame resonance only) */
export const DYN_NOTCH_COUNT_WITH_RPM = 1;

/** Recommended dynamic notch Q with RPM filter active */
export const DYN_NOTCH_Q_WITH_RPM = 500;

/** Default dynamic notch count without RPM filter (must track motor noise) */
export const DYN_NOTCH_COUNT_WITHOUT_RPM = 3;

/** Default dynamic notch Q without RPM filter */
export const DYN_NOTCH_Q_WITHOUT_RPM = 300;

/** dB level for extreme noise (maps to minimum cutoff in noise-based targeting) */
export const NOISE_FLOOR_VERY_NOISY_DB = -10;

/** dB level for very clean signal (maps to maximum cutoff in noise-based targeting) */
export const NOISE_FLOOR_VERY_CLEAN_DB = -70;

/** Minimum difference to recommend a noise-based filter change (Hz) */
export const NOISE_TARGET_DEADZONE_HZ = 5;

/** Resonance peak amplitude threshold for notch/cutoff recommendation (dB above floor) */
export const RESONANCE_ACTION_THRESHOLD_DB = 12;

/** Margin below a resonance peak when lowering cutoff (Hz) */
export const RESONANCE_CUTOFF_MARGIN_HZ = 20;

// ---- Step Detection ----

/** Minimum setpoint change to count as a step (deg/s) */
export const STEP_MIN_MAGNITUDE_DEG_S = 100;

/** Minimum setpoint derivative (deg/s per second) for edge detection */
export const STEP_DERIVATIVE_THRESHOLD = 500;

/** Window after step to measure response (ms) */
export const STEP_RESPONSE_WINDOW_MS = 300;

/** Minimum gap between steps to avoid rapid reversals (ms) */
export const STEP_COOLDOWN_MS = 100;

/** Step must hold for at least this long (ms) */
export const STEP_MIN_HOLD_MS = 50;

// ---- Step Response Metrics ----

/** Settling tolerance: +/-2% of target */
export const SETTLING_TOLERANCE = 0.02;

/** Rise time low threshold (10% of final value) */
export const RISE_TIME_LOW = 0.1;

/** Rise time high threshold (90% of final value) */
export const RISE_TIME_HIGH = 0.9;

/** Threshold for detecting first movement (5% of step magnitude) */
export const LATENCY_THRESHOLD = 0.05;

// ---- PID Scoring ----

/** Target overshoot percentage (ideal) — 10-15% is normal for multirotors (PIDtoolbox) */
export const OVERSHOOT_IDEAL_PERCENT = 10;

/** Maximum acceptable overshoot percentage (BF: bounce-back = problematic) */
export const OVERSHOOT_MAX_PERCENT = 25;

/** Maximum acceptable ringing count (BF: any visible bounce-back should be addressed) */
export const RINGING_MAX_COUNT = 2;

/** Maximum acceptable settling time (ms) — feed-forward makes 150-200ms normal */
export const SETTLING_MAX_MS = 200;

// ---- PID Style Thresholds ----

import type { FlightStyle } from '@shared/types/profile.types';

export interface PIDStyleThresholds {
  overshootIdeal: number;
  overshootMax: number;
  settlingMax: number;
  ringingMax: number;
  moderateOvershoot: number;
  sluggishRise: number;
}

export const PID_STYLE_THRESHOLDS: Record<FlightStyle, PIDStyleThresholds> = {
  smooth: {
    overshootIdeal: 3,
    overshootMax: 12,
    settlingMax: 250,
    ringingMax: 1,
    moderateOvershoot: 8,
    sluggishRise: 120,
  },
  balanced: {
    overshootIdeal: 10,
    overshootMax: 25,
    settlingMax: 200,
    ringingMax: 2,
    moderateOvershoot: 15,
    sluggishRise: 80,
  },
  aggressive: {
    overshootIdeal: 18,
    overshootMax: 35,
    settlingMax: 150,
    ringingMax: 3,
    moderateOvershoot: 25,
    sluggishRise: 50,
  },
} as const;

// ---- PID Safety Bounds ----

/** Minimum P gain */
export const P_GAIN_MIN = 20;

/** Maximum P gain */
export const P_GAIN_MAX = 120;

/** Minimum D gain */
export const D_GAIN_MIN = 15;

/** Maximum D gain */
export const D_GAIN_MAX = 80;

/** Minimum I gain */
export const I_GAIN_MIN = 30;

/** Maximum I gain */
export const I_GAIN_MAX = 120;

// ---- Bayesian Optimization ----

/** Minimum number of completed tuning sessions required for Bayesian optimization */
export const BAYESIAN_MIN_HISTORY = 3;

/** GP noise variance (observation noise, accounts for measurement variability) */
export const BAYESIAN_NOISE_VARIANCE = 0.01;

/** GP kernel signal variance (amplitude of the kernel function) */
export const BAYESIAN_SIGNAL_VARIANCE = 1.0;

/** GP kernel default length scale (scaled per-axis from data range) */
export const BAYESIAN_LENGTH_SCALE_FACTOR = 0.3;

/** Grid search step size for P gain optimization */
export const BAYESIAN_P_STEP = 5;

/** Grid search step size for D gain optimization */
export const BAYESIAN_D_STEP = 5;

/** Exploration-exploitation trade-off parameter (higher = more exploration) */
export const BAYESIAN_EXPLORATION_WEIGHT = 0.1;

/** Weight for overshoot in the objective function */
export const BAYESIAN_WEIGHT_OVERSHOOT = 0.5;

/** Weight for rise time in the objective function */
export const BAYESIAN_WEIGHT_RISE_TIME = 0.3;

/** Weight for settling time in the objective function */
export const BAYESIAN_WEIGHT_SETTLING = 0.2;

/** Data quality weight reduction for poor/fair sessions */
export const BAYESIAN_POOR_QUALITY_WEIGHT = 0.5;
