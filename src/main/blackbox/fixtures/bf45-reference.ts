/**
 * Synthetic BF 4.5 reference BBL fixture for integration testing.
 *
 * Layout:
 * - Session 1: ~50 I-frames with known gyro values → LOG_END → 50 bytes garbage
 * - Session 2: ~30 I-frames with known gyro values → LOG_END
 *
 * All gyro values are within physical limits (|value| < 2000 deg/s).
 * Looptime: 125µs (8kHz), gyro_scale: 1.0 (BF 4.5 native deg/s).
 */

/** Encode unsigned value as variable-byte */
function encodeUVB(value: number): number[] {
  const bytes: number[] = [];
  let v = value;
  while (v >= 0x80) {
    bytes.push((v & 0x7F) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7F);
  return bytes;
}

/** Encode signed value as zigzag VB */
function encodeSVB(value: number): number[] {
  const zigzag = (value << 1) ^ (value >> 31);
  return encodeUVB(zigzag >>> 0);
}

function buildSession(
  sessionNum: number,
  frameCount: number,
  gyroBase: [number, number, number],
  gyroAmplitude: number
): Buffer {
  const parts: Buffer[] = [];

  const headers = [
    'H Product:Blackbox flight data recorder by Nicholas Sherlock',
    'H Data version:2',
    'H I interval:32',
    'H P interval:1/2',
    'H Firmware type:Betaflight',
    'H Firmware revision:4.5.1',
    'H looptime:125',
    'H gyro_scale:0x3f800000',
    'H minthrottle:1070',
    'H vbatref:420',
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

  // Generate frames with smooth sinusoidal gyro motion
  for (let f = 0; f < frameCount; f++) {
    const frame: number[] = [0x49]; // I-frame marker

    const loopIter = f * 32;
    const time = loopIter * 125; // µs

    frame.push(...encodeUVB(loopIter));
    frame.push(...encodeUVB(time));

    // Gyro: sinusoidal variation within physical limits
    const phase = (f / frameCount) * Math.PI * 4;
    const gyroRoll = Math.round(gyroBase[0] + gyroAmplitude * Math.sin(phase));
    const gyroPitch = Math.round(gyroBase[1] + gyroAmplitude * Math.cos(phase));
    const gyroYaw = Math.round(gyroBase[2] + gyroAmplitude * 0.3 * Math.sin(phase * 0.5));

    frame.push(...encodeSVB(gyroRoll));
    frame.push(...encodeSVB(gyroPitch));
    frame.push(...encodeSVB(gyroYaw));

    // Setpoint: constant hover-like values
    frame.push(...encodeSVB(0));    // roll setpoint
    frame.push(...encodeSVB(0));    // pitch setpoint
    frame.push(...encodeSVB(0));    // yaw setpoint
    frame.push(...encodeSVB(1500)); // throttle setpoint

    parts.push(Buffer.from(frame));
  }

  // LOG_END event
  parts.push(Buffer.from([0x45, 0xFF]));

  return Buffer.concat(parts);
}

function buildGarbage(byteCount: number): Buffer {
  // Garbage data that contains frame marker bytes to simulate old flash data
  const garbage = Buffer.alloc(byteCount);
  for (let i = 0; i < byteCount; i++) {
    // Mix of random-ish bytes including some that look like frame markers
    garbage[i] = [0x49, 0x50, 0x45, 0xAB, 0xCD, 0x00, 0xFF, 0x12][i % 8];
  }
  return garbage;
}

/** Expected frame counts per session */
export const EXPECTED_SESSION_1_FRAMES = 50;
export const EXPECTED_SESSION_2_FRAMES = 30;

/** Expected looptime in µs */
export const EXPECTED_LOOPTIME = 125;

/** Maximum expected absolute gyro value in the fixture */
export const EXPECTED_MAX_GYRO = 1500;

/**
 * Build the complete reference BBL fixture buffer.
 *
 * Session 1: 50 frames, gyro base [100, -50, 20], amplitude 800
 * → garbage (50 bytes)
 * Session 2: 30 frames, gyro base [-200, 150, -30], amplitude 600
 */
export function buildReferenceFixture(): Buffer {
  const session1 = buildSession(0, EXPECTED_SESSION_1_FRAMES, [100, -50, 20], 800);
  const garbage = buildGarbage(50);
  const session2 = buildSession(1, EXPECTED_SESSION_2_FRAMES, [-200, 150, -30], 600);

  return Buffer.concat([session1, garbage, session2]);
}
