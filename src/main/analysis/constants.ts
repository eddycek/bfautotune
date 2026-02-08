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

/** Sliding window size in samples for segment variance check */
export const SEGMENT_WINDOW_SAMPLES = 512;

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

/** Motor harmonic detection: maximum spacing tolerance in Hz */
export const MOTOR_HARMONIC_TOLERANCE_HZ = 15;

/** Minimum number of equally-spaced peaks to classify as motor harmonics */
export const MOTOR_HARMONIC_MIN_PEAKS = 2;

// ---- Filter Recommendation Safety Bounds ----

/** Absolute minimum gyro lowpass 1 cutoff in Hz (BF guide: 50 very noisy, 80 slightly noisy) */
export const GYRO_LPF1_MIN_HZ = 75;

/** Absolute maximum gyro lowpass 1 cutoff in Hz */
export const GYRO_LPF1_MAX_HZ = 300;

/** Absolute minimum D-term lowpass 1 cutoff in Hz (BF guide: "70-90 Hz range") */
export const DTERM_LPF1_MIN_HZ = 70;

/** Absolute maximum D-term lowpass 1 cutoff in Hz */
export const DTERM_LPF1_MAX_HZ = 200;

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
