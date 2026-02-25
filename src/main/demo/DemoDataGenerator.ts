/**
 * Demo data generator for offline UX testing.
 *
 * Generates realistic BBL (Blackbox Log) binary data that:
 * - Parses successfully through the real BlackboxParser
 * - Produces meaningful results from FilterAnalyzer (FFT noise peaks)
 * - Produces meaningful results from PIDAnalyzer (step responses)
 *
 * Uses the same VB encoding functions as bf45-reference.ts fixture.
 *
 * IMPORTANT: iInterval must produce a sample rate matching the P interval header.
 * The parser computes sampleRateHz = 1e6 / (looptime * pInterval * pDenom).
 * With P interval:1/2 and looptime:125 → sampleRateHz = 4000 Hz → iInterval must be 2.
 * A mismatch causes StepDetector timing calculations to reject all steps.
 */

import { logger } from '../utils/logger';

// ── VB Encoding (matches bf45-reference.ts) ────────────────────────

/** Encode unsigned value as variable-byte */
function encodeUVB(value: number): number[] {
  const bytes: number[] = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  return bytes;
}

/** Encode signed value as zigzag VB */
function encodeSVB(value: number): number[] {
  const zigzag = (value << 1) ^ (value >> 31);
  return encodeUVB(zigzag >>> 0);
}

// ── Noise Generation ───────────────────────────────────────────────

/**
 * Generate Gaussian-distributed random noise using Box-Muller transform.
 */
function gaussianNoise(stddev: number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return stddev * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ── Demo BBL Builder ───────────────────────────────────────────────

interface DemoSessionConfig {
  /** Number of I-frames to generate */
  frameCount: number;
  /** Base gyro values [roll, pitch, yaw] in deg/s */
  gyroBase: [number, number, number];
  /** Noise RMS amplitude in deg/s */
  noiseAmplitude: number;
  /** Motor harmonic frequency in Hz (typically 120-200 Hz) */
  motorHarmonicHz: number;
  /** Motor harmonic amplitude in deg/s */
  motorHarmonicAmplitude: number;
  /** Electrical noise frequency in Hz (typically 500-800 Hz) */
  electricalNoiseHz: number;
  /** Electrical noise amplitude in deg/s */
  electricalNoiseAmplitude: number;
  /** Whether to inject step inputs into setpoint data (for PID analysis) */
  injectSteps: boolean;
  /** I-frame interval — must match P interval header for correct sample rate (default 2) */
  iInterval?: number;
}

/** Step event for gyro response simulation */
interface StepEvent {
  startFrame: number;
  endFrame: number;
  axis: 0 | 1 | 2; // roll, pitch, yaw
  magnitude: number; // deg/s
}

/**
 * Build a single BBL session with realistic noise and optional step inputs.
 *
 * This generates only I-frames (no P-frames) for simplicity — the parser
 * handles I-only logs just fine, and the analysis engines work on the
 * extracted TimeSeries data regardless of frame type.
 *
 * The iInterval MUST match pDiv (pInterval * pDenom from the P interval header)
 * so that BlackboxParser.sampleRateHz equals the actual data rate.
 * Default: iInterval=2 with "P interval:1/2" → pDiv=2 → 4000 Hz.
 */
function buildDemoSession(config: DemoSessionConfig): Buffer {
  const {
    frameCount,
    gyroBase,
    noiseAmplitude,
    motorHarmonicHz,
    motorHarmonicAmplitude,
    electricalNoiseHz,
    electricalNoiseAmplitude,
    injectSteps,
    iInterval = 2,
  } = config;

  const parts: Buffer[] = [];
  const looptime = 125; // µs (8 kHz)
  const sampleRateHz = 1_000_000 / (looptime * iInterval);

  // ── Headers ─────────────────────────────────────────────────────
  const headers = [
    'H Product:Blackbox flight data recorder by Nicholas Sherlock',
    'H Data version:2',
    `H I interval:${iInterval}`,
    'H P interval:1/2',
    'H Firmware type:Betaflight',
    'H Firmware revision:4.5.1',
    'H Firmware date:Jan  1 2025 00:00:00',
    `H looptime:${looptime}`,
    'H gyro_scale:0x3f800000',
    'H minthrottle:1070',
    'H maxthrottle:2000',
    'H vbatref:420',
    'H Board information:OMNIBUSF4SD',
    'H Log start datetime:2026-02-24T10:00:00.000',
    'H Craft name:DemoQuad',
    // PID settings in headers (used by extractFlightPIDs)
    'H rollPID:50,88,45',
    'H pitchPID:52,92,48',
    'H yawPID:45,90,0',
    'H feedforward_weight:120,130,80',
    'H debug_mode:GYRO_SCALED',
    'H pid_process_denom:2',
    'H blackbox_high_resolution:0',
    // RPM filter info
    'H dshot_bidir:1',
    'H rpm_filter_harmonics:3',
    'H rpm_filter_min_hz:100',
    // Dynamic notch
    'H dyn_notch_count:3',
    'H dyn_notch_q:300',
    'H dyn_notch_min_hz:100',
    'H dyn_notch_max_hz:600',
    // Field definitions
    'H Field I name:loopIteration,time,gyroADC[0],gyroADC[1],gyroADC[2],setpoint[0],setpoint[1],setpoint[2],setpoint[3]',
    'H Field I signed:0,0,1,1,1,1,1,1,1',
    'H Field I predictor:0,0,0,0,0,0,0,0,0',
    'H Field I encoding:1,1,0,0,0,0,0,0,0',
    'H Field P name:loopIteration,time,gyroADC[0],gyroADC[1],gyroADC[2],setpoint[0],setpoint[1],setpoint[2],setpoint[3]',
    'H Field P signed:0,0,1,1,1,1,1,1,1',
    'H Field P predictor:1,1,1,1,1,1,1,1,1',
    'H Field P encoding:0,0,0,0,0,0,0,0,0',
  ];
  parts.push(Buffer.from(headers.join('\n') + '\n'));

  // ── Step input schedule ─────────────────────────────────────────
  // Generate step events spread across the session for PID analysis.
  // Each step: sudden setpoint change → hold for ~200ms → return to 0.
  // 18 steps total (6 per axis) for robust PID analysis.
  const steps: StepEvent[] = [];
  if (injectSteps) {
    const holdFrames = Math.round(0.2 * sampleRateHz); // 200ms hold
    const cooldownFrames = Math.round(0.3 * sampleRateHz); // 300ms between steps (well above 100ms detector threshold)
    const stepMagnitudes = [
      200,
      -300,
      250, // roll, pitch, yaw
      -250,
      300,
      -200, // roll, pitch, yaw
      350,
      -200,
      300, // roll, pitch, yaw
      -300,
      250,
      -350, // roll, pitch, yaw
      200,
      -350,
      250, // roll, pitch, yaw
      -250,
      300,
      -200, // roll, pitch, yaw
    ];
    let nextStart = Math.round(0.5 * sampleRateHz); // Start 0.5s into the session

    for (let i = 0; i < stepMagnitudes.length && nextStart + holdFrames < frameCount - 10; i++) {
      const axis = (i % 3) as 0 | 1 | 2; // Cycle through roll, pitch, yaw
      steps.push({
        startFrame: nextStart,
        endFrame: nextStart + holdFrames,
        axis,
        magnitude: stepMagnitudes[i],
      });
      nextStart += holdFrames + cooldownFrames;
    }
  }

  // ── Frame generation ────────────────────────────────────────────
  for (let f = 0; f < frameCount; f++) {
    const frame: number[] = [0x49]; // I-frame marker

    const loopIter = f * iInterval;
    const time = loopIter * looptime; // µs
    const timeSec = time / 1_000_000;

    frame.push(...encodeUVB(loopIter));
    frame.push(...encodeUVB(time));

    // --- Gyro values: base + broadband noise + harmonic noise ---
    const gyroValues: number[] = [];
    for (let axis = 0; axis < 3; axis++) {
      let value = gyroBase[axis];

      // Broadband gyro noise (simulates natural vibration)
      value += gaussianNoise(noiseAmplitude);

      // Motor harmonic (strong peak in spectrum)
      value += motorHarmonicAmplitude * Math.sin(2 * Math.PI * motorHarmonicHz * timeSec + axis);

      // Second motor harmonic (2x frequency, lower amplitude)
      value +=
        motorHarmonicAmplitude *
        0.4 *
        Math.sin(2 * Math.PI * motorHarmonicHz * 2 * timeSec + axis * 0.5);

      // Electrical noise (high frequency)
      value +=
        electricalNoiseAmplitude * Math.sin(2 * Math.PI * electricalNoiseHz * timeSec + axis * 1.3);

      gyroValues.push(value);
    }

    // --- Simulated gyro response to step inputs ---
    // Model: latency → exponential rise → damped overshoot → settling
    if (injectSteps) {
      for (const step of steps) {
        const framesIn = f - step.startFrame;
        if (framesIn < 0) continue;
        // Stop contributing well after the step ends (decay is negligible)
        if (framesIn > step.endFrame - step.startFrame + Math.round(0.15 * sampleRateHz)) continue;

        const latencyFrames = Math.round(0.012 * sampleRateHz); // 12ms latency
        if (framesIn < latencyFrames) continue;

        const t = (framesIn - latencyFrames) / sampleRateHz; // seconds after latency
        // Exponential rise with damped sinusoidal overshoot
        const rise = 1 - Math.exp(-t * 80); // fast rise (~12ms to 63%)
        const overshoot = 0.12 * Math.exp(-t * 35) * Math.sin(t * 180);

        if (f < step.endFrame) {
          // During step hold: tracking toward target
          gyroValues[step.axis] += step.magnitude * (rise + overshoot);
        } else {
          // After step ends: decay back to 0
          const tAfterEnd = (f - step.endFrame) / sampleRateHz;
          const decayFactor = Math.exp(-tAfterEnd * 60);
          gyroValues[step.axis] += step.magnitude * decayFactor;
        }
      }
    }

    // Round gyro values after all contributions
    frame.push(...encodeSVB(Math.round(gyroValues[0])));
    frame.push(...encodeSVB(Math.round(gyroValues[1])));
    frame.push(...encodeSVB(Math.round(gyroValues[2])));

    // --- Setpoint: hover + step inputs ---
    const setpoints = [0, 0, 0]; // roll, pitch, yaw
    const activeStep = steps.find((s) => f >= s.startFrame && f < s.endFrame);
    if (activeStep) {
      setpoints[activeStep.axis] = activeStep.magnitude;
    }

    frame.push(...encodeSVB(setpoints[0])); // roll setpoint
    frame.push(...encodeSVB(setpoints[1])); // pitch setpoint
    frame.push(...encodeSVB(setpoints[2])); // yaw setpoint

    // Throttle: hover ~1500 with slight variation (sweep simulation)
    const throttleBase = 1500;
    const throttleVariation = 200 * Math.sin(2 * Math.PI * 0.1 * timeSec); // Slow sweep
    frame.push(...encodeSVB(Math.round(throttleBase + throttleVariation)));

    parts.push(Buffer.from(frame));
  }

  // ── LOG_END event ───────────────────────────────────────────────
  parts.push(Buffer.from([0x45, 0xff, ...Buffer.from('End of log\0', 'ascii')]));

  return Buffer.concat(parts);
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Generate a demo BBL buffer for filter analysis.
 *
 * Contains one session with:
 * - ~5 seconds of flight data at 4000 Hz (I-frame only, iInterval=2)
 * - Broadband noise floor
 * - Motor harmonic at ~160 Hz with 2nd harmonic at ~320 Hz
 * - Electrical noise at ~600 Hz
 * - Throttle sweeps for segment detection
 */
export function generateFilterDemoBBL(): Buffer {
  logger.info('[DEMO] Generating filter analysis demo BBL...');
  return buildDemoSession({
    frameCount: 20000, // 5s at 4000 Hz
    gyroBase: [2, -1, 0],
    noiseAmplitude: 15,
    motorHarmonicHz: 160,
    motorHarmonicAmplitude: 40,
    electricalNoiseHz: 600,
    electricalNoiseAmplitude: 8,
    injectSteps: false,
    iInterval: 2,
  });
}

/**
 * Generate a demo BBL buffer for PID analysis.
 *
 * Contains one session with:
 * - ~5 seconds of flight data at 4000 Hz (I-frame only, iInterval=2)
 * - Moderate noise floor
 * - 18 step inputs across all 3 axes (for step response detection)
 * - Simulated gyro response (12ms latency, ~12% overshoot, ~80ms settling)
 * - Lower motor harmonic (cleaner for PID analysis)
 */
export function generatePIDDemoBBL(): Buffer {
  logger.info('[DEMO] Generating PID analysis demo BBL...');
  return buildDemoSession({
    frameCount: 32000, // 8s at 4000 Hz — fits 15 step inputs (5 per axis)
    gyroBase: [0, 0, 0],
    noiseAmplitude: 8,
    motorHarmonicHz: 160,
    motorHarmonicAmplitude: 15,
    electricalNoiseHz: 600,
    electricalNoiseAmplitude: 3,
    injectSteps: true,
    iInterval: 2,
  });
}

/**
 * Generate a combined demo BBL with both filter-suitable and PID-suitable sessions.
 * Session 1: hover + noise (for filter analysis)
 * Session 2: stick snaps (for PID analysis)
 */
export function generateCombinedDemoBBL(): Buffer {
  logger.info('[DEMO] Generating combined demo BBL (filter + PID sessions)...');

  const filterSession = buildDemoSession({
    frameCount: 20000,
    gyroBase: [2, -1, 0],
    noiseAmplitude: 15,
    motorHarmonicHz: 160,
    motorHarmonicAmplitude: 40,
    electricalNoiseHz: 600,
    electricalNoiseAmplitude: 8,
    injectSteps: false,
    iInterval: 2,
  });

  // 50 bytes of garbage between sessions (normal in multi-session BBL files)
  const garbage = Buffer.alloc(50);
  for (let i = 0; i < 50; i++) {
    garbage[i] = [0x00, 0x02, 0x04, 0xab, 0xcd][i % 5];
  }

  const pidSession = buildDemoSession({
    frameCount: 32000,
    gyroBase: [0, 0, 0],
    noiseAmplitude: 8,
    motorHarmonicHz: 160,
    motorHarmonicAmplitude: 15,
    electricalNoiseHz: 600,
    electricalNoiseAmplitude: 3,
    injectSteps: true,
    iInterval: 2,
  });

  return Buffer.concat([filterSession, garbage, pidSession]);
}
