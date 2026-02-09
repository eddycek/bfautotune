import {
  BBLFrameType,
} from '@shared/types/blackbox.types';
import type {
  BBLLogHeader,
  BlackboxFlightData,
  BlackboxLogSession,
  BlackboxParseResult,
  BlackboxParseProgress,
  TimeSeries,
} from '@shared/types/blackbox.types';
import {
  FRAME_MARKER,
  VALID_FRAME_MARKERS,
  HEADER_PREFIX,
  FIELD_NAMES,
  EVENT_TYPE,
  MAX_RESYNC_BYTES,
  MAX_FRAME_LENGTH,
  END_OF_LOG_MESSAGE,
  MAX_ITERATION_JUMP,
  MAX_TIME_JUMP_US,
  MAX_I_FRAME_TIME_BACKWARD_US,
  MAX_I_FRAME_ITER_BACKWARD,
  MAX_CONSECUTIVE_CORRUPT_FRAMES,
  PROGRESS_INTERVAL,
  YIELD_INTERVAL,
} from './constants';
import { StreamReader } from './StreamReader';
import { HeaderParser } from './HeaderParser';
import { FrameParser } from './FrameParser';

/**
 * Error thrown when BBL parsing fails fatally.
 */
export class BlackboxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlackboxParseError';
  }
}

/**
 * Top-level BBL file parser.
 *
 * Handles:
 * - Multi-log detection (a single .bbl file can contain multiple flight sessions)
 * - Frame iteration with corruption recovery (resync to next frame marker)
 * - Flight data extraction into Float64Array time series
 * - Progress reporting for UI feedback
 * - Yielding to event loop to avoid blocking Electron
 */
export class BlackboxParser {
  /**
   * Parse a BBL file buffer into structured flight data.
   *
   * @param data - Raw BBL file buffer
   * @param onProgress - Optional callback for progress updates
   * @returns Parse result with sessions, timing, and status
   */
  static async parse(
    data: Buffer,
    onProgress?: (progress: BlackboxParseProgress) => void
  ): Promise<BlackboxParseResult> {
    const startTime = Date.now();

    if (!data || data.length === 0) {
      throw new BlackboxParseError('Empty file');
    }

    // Strip dataflash page headers if present (MSP download artifacts)
    data = BlackboxParser.stripFlashHeaders(data);

    // Find all log session boundaries
    const sessionBoundaries = BlackboxParser.findSessionBoundaries(data);

    if (sessionBoundaries.length === 0) {
      throw new BlackboxParseError('No valid BBL header found');
    }

    const sessions: BlackboxLogSession[] = [];

    for (let i = 0; i < sessionBoundaries.length; i++) {
      const start = sessionBoundaries[i];
      const end = i + 1 < sessionBoundaries.length
        ? sessionBoundaries[i + 1]
        : data.length;

      const session = await BlackboxParser.parseSession(
        data, start, end, i,
        (bytesProcessed) => {
          onProgress?.({
            bytesProcessed: start + bytesProcessed,
            totalBytes: data.length,
            percent: Math.round(((start + bytesProcessed) / data.length) * 100),
            currentSession: i,
          });
        }
      );

      if (session) {
        sessions.push(session);
      }
    }

    if (sessions.length === 0) {
      return {
        sessions: [],
        fileSize: data.length,
        parseTimeMs: Date.now() - startTime,
        success: false,
        error: 'No parseable flight data found',
      };
    }

    return {
      sessions,
      fileSize: data.length,
      parseTimeMs: Date.now() - startTime,
      success: true,
    };
  }

  /**
   * Find the start offset of each log session in the file.
   * Sessions start with header lines beginning with "H Product:".
   */
  static findSessionBoundaries(data: Buffer): number[] {
    const boundaries: number[] = [];
    const marker = Buffer.from('H Product:');
    let searchFrom = 0;

    while (searchFrom < data.length) {
      const idx = data.indexOf(marker, searchFrom);
      if (idx === -1) break;
      boundaries.push(idx);
      searchFrom = idx + marker.length;
    }

    return boundaries;
  }

  /**
   * Parse a single log session from the buffer.
   */
  private static async parseSession(
    data: Buffer,
    start: number,
    end: number,
    sessionIndex: number,
    onBytesProcessed?: (bytes: number) => void
  ): Promise<BlackboxLogSession | null> {
    const reader = new StreamReader(data, start, end);
    const warnings: string[] = [];

    // Parse header
    const header = HeaderParser.parse(reader);

    if (header.iFieldDefs.length === 0) {
      return null; // No I-frame fields → not a valid session
    }

    const frameParser = new FrameParser(header);

    // Parse frames
    const iFrames: number[][] = [];
    const pFrames: number[][] = [];
    let corruptedFrameCount = 0;
    let consecutiveCorrupt = 0;
    let frameCount = 0;

    // Track previous frames for P-frame prediction
    let previousIFrame: number[] | null = null;
    let previousFrame: number[] | null = null;
    let previousFrame2: number[] | null = null;

    // Field indices for iteration/time validation
    const loopIterIdx = header.iFieldDefs.findIndex(d => d.name === FIELD_NAMES.LOOP_ITERATION);
    const timeIdx = header.iFieldDefs.findIndex(d => d.name === FIELD_NAMES.TIME);
    let lastIteration = -1;
    let lastTime = -1;

    while (!reader.eof) {
      const frameStartOffset = reader.offset;

      // Bail out if too many consecutive corrupt frames
      if (consecutiveCorrupt >= MAX_CONSECUTIVE_CORRUPT_FRAMES) {
        warnings.push(`Stopped parsing after ${MAX_CONSECUTIVE_CORRUPT_FRAMES} consecutive corrupt frames`);
        break;
      }

      // Report progress
      if (frameCount % PROGRESS_INTERVAL === 0) {
        onBytesProcessed?.(reader.offset - start);
      }

      // Yield to event loop periodically
      if (frameCount % YIELD_INTERVAL === 0 && frameCount > 0) {
        await BlackboxParser.yield();
      }

      const markerByte = reader.readByte();
      if (markerByte === -1) break;

      try {
        switch (markerByte) {
          case FRAME_MARKER.INTRA: {
            const values = frameParser.parseIFrame(reader);
            const frameSize = reader.offset - frameStartOffset;

            if (frameSize > MAX_FRAME_LENGTH) {
              corruptedFrameCount++;
              consecutiveCorrupt++;
              // Size invalid → binary decode likely misaligned
              previousFrame = null;
              previousFrame2 = null;
              reader.setOffset(frameStartOffset + 1);
              BlackboxParser.resync(reader);
              break;
            }

            // I-frames carry absolute values, so they reset tracking state.
            // Only reject on large FORWARD jumps (likely corruption).
            // Backward time/iteration is expected when P-frame predictors
            // have drifted — the I-frame is correct, our tracking is stale.
            if (!BlackboxParser.isIFrameValid(values, loopIterIdx, timeIdx, lastIteration, lastTime)) {
              corruptedFrameCount++;
              consecutiveCorrupt++;
              previousFrame = null;
              previousFrame2 = null;
              reader.setOffset(frameStartOffset + 1);
              BlackboxParser.resync(reader);
              break;
            }

            iFrames.push(values);
            // I-frames reset prediction state: both prev and prev2 point to the
            // I-frame. This matches BF viewer behavior where mainHistory[1] and [2]
            // are both set to the I-frame after parsing it. Without this, the first
            // P-frame after an I-frame would use STRAIGHT_LINE with the old P-frame
            // as prev2, causing ~993µs time drift per I-interval.
            previousFrame = values;
            previousFrame2 = values;
            previousIFrame = values;
            frameCount++;
            consecutiveCorrupt = 0;
            if (loopIterIdx >= 0) lastIteration = values[loopIterIdx];
            if (timeIdx >= 0) lastTime = values[timeIdx];
            break;
          }

          case FRAME_MARKER.INTER: {
            if (!previousFrame) {
              BlackboxParser.resync(reader);
              corruptedFrameCount++;
              consecutiveCorrupt++;
              break;
            }
            const values = frameParser.parsePFrame(reader, previousFrame, previousFrame2);
            const frameSize = reader.offset - frameStartOffset;

            if (frameSize > MAX_FRAME_LENGTH ||
                !BlackboxParser.isFrameValid(values, loopIterIdx, timeIdx, lastIteration, lastTime)) {
              corruptedFrameCount++;
              consecutiveCorrupt++;
              previousFrame = null; // Force wait for next I-frame
              previousFrame2 = null;
              reader.setOffset(frameStartOffset + 1);
              BlackboxParser.resync(reader);
              break;
            }

            pFrames.push(values);
            previousFrame2 = previousFrame;
            previousFrame = values;
            frameCount++;
            consecutiveCorrupt = 0;
            if (loopIterIdx >= 0) lastIteration = values[loopIterIdx];
            if (timeIdx >= 0) lastTime = values[timeIdx];
            break;
          }

          case FRAME_MARKER.SLOW: {
            // Parse but don't store slow frames (not needed for PID analysis)
            frameParser.parseSFrame(reader);
            break;
          }

          case FRAME_MARKER.EVENT: {
            const eventType = BlackboxParser.parseEventFrame(reader);
            if (eventType === EVENT_TYPE.LOG_END) {
              // Session ended — stop reading to avoid garbage flash data
              reader.setOffset(reader.end);
            }
            break;
          }

          case FRAME_MARKER.GPS:
          case FRAME_MARKER.GPS_HOME: {
            // Skip GPS frames - not needed for PID analysis
            // GPS frames use their own field definitions; for now, skip by resyncing
            BlackboxParser.resync(reader);
            break;
          }

          default: {
            // Unknown byte - try to resync
            if (!BlackboxParser.resync(reader)) {
              // Can't find another frame marker - end of usable data
              break;
            }
            corruptedFrameCount++;
            consecutiveCorrupt++;
            break;
          }
        }
      } catch {
        // Frame decode error - try to resync
        corruptedFrameCount++;
        consecutiveCorrupt++;
        reader.setOffset(frameStartOffset + 1);
        if (!BlackboxParser.resync(reader)) break;
      }
    }

    // Final progress
    onBytesProcessed?.(reader.offset - start);

    const totalFrames = iFrames.length + pFrames.length;
    if (totalFrames === 0) {
      warnings.push('No valid frames decoded');
      return null;
    }

    // Extract flight data
    const flightData = BlackboxParser.extractFlightData(
      header, iFrames, pFrames, warnings
    );

    return {
      index: sessionIndex,
      header,
      flightData,
      corruptedFrameCount,
      warnings,
    };
  }

  /**
   * Parse an event frame by reading its type and associated data.
   * Returns the event type so the caller can act on LOG_END.
   */
  private static parseEventFrame(reader: StreamReader): number {
    const eventType = reader.readByte();
    if (eventType === -1) return -1;

    switch (eventType) {
      case EVENT_TYPE.SYNC_BEEP:
        // 4-byte timestamp
        reader.skip(4);
        break;
      case EVENT_TYPE.LOG_END: {
        // Betaflight writes "End of log\0" after the event type byte.
        // Validate this string to avoid false positives from random 0xFF bytes.
        const endMsg = reader.readBytes(END_OF_LOG_MESSAGE.length);
        const endStr = endMsg.toString('ascii');
        if (endStr !== END_OF_LOG_MESSAGE) {
          // False positive — not a real LOG_END, just a random 0xFF byte
          return -1;
        }
        break;
      }
      case EVENT_TYPE.DISARM:
        // 4-byte reason
        reader.skip(4);
        break;
      case EVENT_TYPE.FLIGHT_MODE:
        // 4-byte flags + 4-byte lastFlags
        reader.skip(8);
        break;
      case EVENT_TYPE.INFLIGHT_ADJUSTMENT:
        // Variable - read adjustment function (1 byte) + value (4 bytes)
        reader.skip(5);
        break;
      case EVENT_TYPE.LOGGING_RESUME:
        // 4-byte currentTime + 4-byte loopIteration
        reader.skip(8);
        break;
      default:
        // Unknown event - try to find next frame marker
        BlackboxParser.resync(reader);
        break;
    }

    return eventType;
  }

  /**
   * Scan ahead to find the next valid frame marker byte.
   * Returns true if a marker was found, false if EOF.
   */
  private static resync(reader: StreamReader): boolean {
    const maxScan = Math.min(reader.bytesRemaining, MAX_RESYNC_BYTES);

    for (let i = 0; i < maxScan; i++) {
      const byte = reader.peek();
      if (byte === -1) return false;

      if (VALID_FRAME_MARKERS.has(byte)) {
        return true;
      }
      reader.skip(1);
    }

    return false;
  }

  /**
   * Extract flight data time series from decoded frames.
   *
   * Combines I-frames and P-frames into a single continuous time series,
   * mapping field names to the appropriate output channels.
   */
  private static extractFlightData(
    header: BBLLogHeader,
    iFrames: number[][],
    pFrames: number[][],
    warnings: string[]
  ): BlackboxFlightData {
    // Build a unified frame list in order
    // I-frames and P-frames alternate: I, P, P, P, ... I, P, P, P, ...
    // Since we collected them in-order, merge them back
    const allFrames = BlackboxParser.mergeFrames(iFrames, pFrames, header);
    const frameCount = allFrames.length;

    // Build field index maps for both I and P frames
    // We use I-frame field definitions as the canonical list
    const fieldMap = new Map<string, number>();
    for (let i = 0; i < header.iFieldDefs.length; i++) {
      fieldMap.set(header.iFieldDefs[i].name, i);
    }

    // Calculate timing
    const timeFieldIdx = fieldMap.get(FIELD_NAMES.TIME);

    // Compute sample rate from looptime and P interval header.
    // "P interval:N/D" → N = pInterval (blackbox_p_ratio), D = pDenom (pid_process_denom)
    // looptime = gyro loop period in µs, PID rate = gyro_rate / pDenom,
    // blackbox rate = PID rate / pInterval = 1e6 / (looptime * pDenom * pInterval)
    // e.g., looptime=125µs (8kHz gyro) with P interval:4/1 → 8000/4 = 2000 Hz
    const pDiv = Math.max(1, header.pInterval) * Math.max(1, header.pDenom);
    const sampleRateHz = 1_000_000 / (header.looptime * pDiv);
    const dt = (header.looptime * pDiv) / 1_000_000; // seconds per logged frame

    // Build time array. The raw time field from flash can contain corrupted
    // values (jumps, negative deltas, huge spikes). We use it when it looks
    // monotonically increasing, but fall back to synthesized time from frame
    // index when corruption is detected.
    const timeArray = new Float64Array(frameCount);
    if (timeFieldIdx !== undefined) {
      // First pass: extract raw times and check for monotonicity
      let usable = true;
      for (let i = 0; i < frameCount; i++) {
        timeArray[i] = allFrames[i][timeFieldIdx] / 1_000_000;
      }
      // Validate: time should be roughly monotonically increasing.
      // Allow small jitter but reject large backward jumps or huge forward leaps.
      for (let i = 1; i < frameCount; i++) {
        const delta = timeArray[i] - timeArray[i - 1];
        // Reject if time goes backward by more than 1s, or jumps forward
        // by more than 10s in a single frame step
        if (delta < -1 || delta > 10) {
          usable = false;
          break;
        }
      }
      if (!usable) {
        // Time field is corrupted - synthesize from frame index
        for (let i = 0; i < frameCount; i++) {
          timeArray[i] = i * dt;
        }
      }
    } else {
      // No time field - synthesize from frame index
      for (let i = 0; i < frameCount; i++) {
        timeArray[i] = i * dt;
      }
    }

    const durationSeconds = frameCount > 1
      ? timeArray[frameCount - 1] - timeArray[0]
      : frameCount * dt;

    // Helper to extract a channel
    function extractChannel(fieldName: string): TimeSeries {
      const idx = fieldMap.get(fieldName);
      const values = new Float64Array(frameCount);
      if (idx !== undefined) {
        for (let i = 0; i < frameCount; i++) {
          values[i] = allFrames[i][idx] ?? 0;
        }
      }
      return { time: timeArray, values };
    }

    // Extract gyro (3 axes)
    const gyro: [TimeSeries, TimeSeries, TimeSeries] = [
      extractChannel(`${FIELD_NAMES.GYRO_ADC_PREFIX}0]`),
      extractChannel(`${FIELD_NAMES.GYRO_ADC_PREFIX}1]`),
      extractChannel(`${FIELD_NAMES.GYRO_ADC_PREFIX}2]`),
    ];

    // Extract setpoint (4 channels: roll, pitch, yaw, throttle)
    // Try "setpoint[N]" first, fall back to "rcCommand[N]"
    const setpointNames = [0, 1, 2, 3].map(i => {
      const sp = `${FIELD_NAMES.SETPOINT_PREFIX}${i}]`;
      if (fieldMap.has(sp)) return sp;
      const rc = `${FIELD_NAMES.RC_COMMAND_PREFIX}${i}]`;
      if (fieldMap.has(rc)) return rc;
      return sp; // will just produce zeros
    });
    const setpoint: [TimeSeries, TimeSeries, TimeSeries, TimeSeries] = [
      extractChannel(setpointNames[0]),
      extractChannel(setpointNames[1]),
      extractChannel(setpointNames[2]),
      extractChannel(setpointNames[3]),
    ];

    // Extract PID terms
    const pidP: [TimeSeries, TimeSeries, TimeSeries] = [
      extractChannel(`${FIELD_NAMES.AXIS_P_PREFIX}0]`),
      extractChannel(`${FIELD_NAMES.AXIS_P_PREFIX}1]`),
      extractChannel(`${FIELD_NAMES.AXIS_P_PREFIX}2]`),
    ];
    const pidI: [TimeSeries, TimeSeries, TimeSeries] = [
      extractChannel(`${FIELD_NAMES.AXIS_I_PREFIX}0]`),
      extractChannel(`${FIELD_NAMES.AXIS_I_PREFIX}1]`),
      extractChannel(`${FIELD_NAMES.AXIS_I_PREFIX}2]`),
    ];
    const pidD: [TimeSeries, TimeSeries, TimeSeries] = [
      extractChannel(`${FIELD_NAMES.AXIS_D_PREFIX}0]`),
      extractChannel(`${FIELD_NAMES.AXIS_D_PREFIX}1]`),
      extractChannel(`${FIELD_NAMES.AXIS_D_PREFIX}2]`),
    ];
    const pidF: [TimeSeries, TimeSeries, TimeSeries] = [
      extractChannel(`${FIELD_NAMES.AXIS_F_PREFIX}0]`),
      extractChannel(`${FIELD_NAMES.AXIS_F_PREFIX}1]`),
      extractChannel(`${FIELD_NAMES.AXIS_F_PREFIX}2]`),
    ];

    // Extract motor values
    const motor: [TimeSeries, TimeSeries, TimeSeries, TimeSeries] = [
      extractChannel(`${FIELD_NAMES.MOTOR_PREFIX}0]`),
      extractChannel(`${FIELD_NAMES.MOTOR_PREFIX}1]`),
      extractChannel(`${FIELD_NAMES.MOTOR_PREFIX}2]`),
      extractChannel(`${FIELD_NAMES.MOTOR_PREFIX}3]`),
    ];

    // Extract debug values (up to 8)
    const debug: TimeSeries[] = [];
    for (let i = 0; i < 8; i++) {
      const name = `${FIELD_NAMES.DEBUG_PREFIX}${i}]`;
      if (fieldMap.has(name)) {
        debug.push(extractChannel(name));
      }
    }

    // Warn about missing critical fields
    if (!fieldMap.has(`${FIELD_NAMES.GYRO_ADC_PREFIX}0]`)) {
      warnings.push('Missing gyroADC fields - gyro data will be empty');
    }

    // Gyro data quality diagnostics
    const axisNames = ['roll', 'pitch', 'yaw'];
    for (let axis = 0; axis < 3; axis++) {
      const vals = gyro[axis].values;
      if (vals.length === 0) continue;

      let min = Infinity, max = -Infinity, sum = 0, zeroCount = 0;
      for (let i = 0; i < vals.length; i++) {
        const v = vals[i];
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
        if (v === 0) zeroCount++;
      }
      const mean = sum / vals.length;
      const range = max - min;

      if (range < 1) {
        warnings.push(`gyro ${axisNames[axis]}: constant value ${min} — likely parsing error`);
      } else if (zeroCount > vals.length * 0.9) {
        warnings.push(`gyro ${axisNames[axis]}: ${((zeroCount / vals.length) * 100).toFixed(0)}% zeros — likely parsing error`);
      } else if (max > 32000 || min < -32000) {
        warnings.push(`gyro ${axisNames[axis]}: extreme range [${min.toFixed(0)}, ${max.toFixed(0)}] — possible corruption`);
      }
    }

    return {
      gyro,
      setpoint,
      pidP,
      pidI,
      pidD,
      pidF,
      motor,
      debug,
      sampleRateHz,
      durationSeconds,
      frameCount,
    };
  }

  /**
   * Merge I-frames and P-frames into a single ordered sequence.
   *
   * In the BBL format, I-frames are absolute and P-frames are deltas.
   * Both I and P frame field lists have the same logical fields but may
   * use different encodings/predictors. Here we use I-frame field defs
   * as the canonical schema and map P-frame values onto the same indices.
   *
   * For simplicity, we interleave them based on how they were decoded
   * (which is already in file order).
   */
  private static mergeFrames(
    iFrames: number[][],
    pFrames: number[][],
    header: BBLLogHeader
  ): number[][] {
    // Build P→I field index mapping
    const pToIMap = BlackboxParser.buildFieldMapping(
      header.pFieldDefs.map(d => d.name),
      header.iFieldDefs.map(d => d.name)
    );

    const fieldCount = header.iFieldDefs.length;
    const allFrames: number[][] = [];

    // We need to reconstruct the original order.
    // Since P-frames come between I-frames, and we know the I-interval,
    // we can interleave them. However, the simplest correct approach
    // is to use the loop iteration value to sort them.
    const loopIterIdxI = header.iFieldDefs.findIndex(d => d.name === FIELD_NAMES.LOOP_ITERATION);
    const loopIterIdxP = header.pFieldDefs.findIndex(d => d.name === FIELD_NAMES.LOOP_ITERATION);

    // If we can't find loop iteration, just concatenate in order
    if (loopIterIdxI === -1) {
      for (const frame of iFrames) allFrames.push(frame);
      for (const frame of pFrames) {
        const mapped = BlackboxParser.mapPFrameToISchema(frame, pToIMap, fieldCount);
        allFrames.push(mapped);
      }
      return allFrames;
    }

    // Build (loopIteration, values) pairs for sorting
    type FrameEntry = { loopIter: number; values: number[] };
    const entries: FrameEntry[] = [];

    for (const frame of iFrames) {
      entries.push({ loopIter: frame[loopIterIdxI], values: frame });
    }

    for (const frame of pFrames) {
      const mapped = BlackboxParser.mapPFrameToISchema(frame, pToIMap, fieldCount);
      const loopIter = loopIterIdxP >= 0 ? frame[loopIterIdxP] : 0;
      entries.push({ loopIter, values: mapped });
    }

    // Sort by loop iteration
    entries.sort((a, b) => a.loopIter - b.loopIter);

    return entries.map(e => e.values);
  }

  /**
   * Build a mapping from P-frame field indices to I-frame field indices.
   * Returns an array where mapping[pIdx] = iIdx (or -1 if no match).
   */
  private static buildFieldMapping(pNames: string[], iNames: string[]): number[] {
    const iNameMap = new Map<string, number>();
    for (let i = 0; i < iNames.length; i++) {
      iNameMap.set(iNames[i], i);
    }

    return pNames.map(name => iNameMap.get(name) ?? -1);
  }

  /**
   * Map a P-frame's values onto the I-frame field schema.
   */
  private static mapPFrameToISchema(
    pValues: number[],
    pToIMap: number[],
    fieldCount: number
  ): number[] {
    const result = new Array(fieldCount).fill(0);
    for (let p = 0; p < pValues.length && p < pToIMap.length; p++) {
      const iIdx = pToIMap[p];
      if (iIdx >= 0) {
        result[iIdx] = pValues[p];
      }
    }
    return result;
  }

  /**
   * Check if an I-frame has reasonable temporal values.
   *
   * I-frames carry absolute values. Small backward jumps relative to our
   * tracking state are normal (P-frame predictor rounding causes drift).
   * Large backward jumps indicate garbage data from old flash sessions.
   * Large forward jumps indicate corruption.
   */
  private static isIFrameValid(
    values: number[],
    loopIterIdx: number,
    timeIdx: number,
    lastIteration: number,
    lastTime: number
  ): boolean {
    if (loopIterIdx >= 0 && lastIteration >= 0) {
      const iteration = values[loopIterIdx];
      // Reject large forward jump
      if (iteration >= lastIteration + MAX_ITERATION_JUMP) {
        return false;
      }
      // Reject large backward jump (garbage data, not drift)
      if (iteration < lastIteration - MAX_I_FRAME_ITER_BACKWARD) {
        return false;
      }
    }
    if (timeIdx >= 0 && lastTime >= 0) {
      const time = values[timeIdx];
      // Reject large forward jump
      if (time >= lastTime + MAX_TIME_JUMP_US) {
        return false;
      }
      // Reject large backward jump (garbage data, not drift)
      if (time < lastTime - MAX_I_FRAME_TIME_BACKWARD_US) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if a decoded P-frame has reasonable temporal values.
   *
   * Matches the validation strategy of betaflight/blackbox-log-viewer:
   * - Only checks iteration and time continuity (no sensor value thresholds)
   * - Frame size is checked separately by the caller (MAX_FRAME_LENGTH)
   *
   * The official viewer does NOT validate individual field values because
   * fields like debug[], motor[] (ERPM), and others can legitimately
   * exceed any fixed threshold.
   */
  private static isFrameValid(
    values: number[],
    loopIterIdx: number,
    timeIdx: number,
    lastIteration: number,
    lastTime: number
  ): boolean {
    // Check loop iteration: must not go backward or jump too far forward
    if (loopIterIdx >= 0 && lastIteration >= 0) {
      const iteration = values[loopIterIdx];
      if (iteration < lastIteration || iteration >= lastIteration + MAX_ITERATION_JUMP) {
        return false;
      }
    }

    // Check time: must not go backward or jump too far forward
    if (timeIdx >= 0 && lastTime >= 0) {
      const time = values[timeIdx];
      if (time < lastTime || time >= lastTime + MAX_TIME_JUMP_US) {
        return false;
      }
    }

    return true;
  }

  /**
   * Strip MSP_DATAFLASH_READ response headers from raw flash dump.
   *
   * Files saved before the readBlackboxChunk fix contain interleaved
   * response headers and flash data. This strips them for backward compat.
   *
   * Response header formats:
   *   7-byte (BF 4.1+ with USE_HUFFMAN): [4B addr LE] [2B dataSize LE] [1B isCompressed] [data...]
   *   6-byte (older / no compression):    [4B addr LE] [2B dataSize LE] [data...]
   *
   * Detection: if the file starts with 'H' (0x48), it's already clean BBL data.
   * Otherwise, try to detect the response header format and strip it.
   */
  static stripFlashHeaders(data: Buffer): Buffer {
    if (data.length < 7) return data;

    // If file starts directly with BBL header marker, it's already clean
    if (data[0] === 0x48) {
      return data;
    }

    // Try 7-byte header format: [4B addr][2B dataSize][1B comp][data]
    // First chunk's data should start with 'H' (0x48)
    const dataSize7 = data.readUInt16LE(4);
    if (data.length > 7 && data[7] === 0x48 && dataSize7 > 0 && dataSize7 < 4096) {
      return BlackboxParser.stripHeadersWithSize(data, 7);
    }

    // Try 6-byte header format: [4B addr][2B dataSize][data]
    const dataSize6 = data.readUInt16LE(4);
    if (data.length > 6 && data[6] === 0x48 && dataSize6 > 0 && dataSize6 < 4096) {
      return BlackboxParser.stripHeadersWithSize(data, 6);
    }

    // No recognized header format — return as-is
    return data;
  }

  /**
   * Strip fixed-size response headers from concatenated MSP responses.
   */
  private static stripHeadersWithSize(data: Buffer, headerSize: number): Buffer {
    const chunks: Buffer[] = [];
    let offset = 0;

    while (offset + headerSize <= data.length) {
      // Read dataSize from bytes 4-5 (uint16 LE) relative to current offset
      if (offset + 6 > data.length) break;
      const dataSize = data.readUInt16LE(offset + 4);

      if (dataSize === 0 || dataSize > 4096) {
        // Invalid — append remaining data as-is
        chunks.push(data.subarray(offset));
        break;
      }

      const payloadStart = offset + headerSize;
      const payloadEnd = Math.min(payloadStart + dataSize, data.length);
      chunks.push(data.subarray(payloadStart, payloadEnd));

      offset = payloadEnd;
    }

    // Append any trailing bytes
    if (offset < data.length && (chunks.length === 0 || offset + 6 > data.length)) {
      chunks.push(data.subarray(offset));
    }

    return Buffer.concat(chunks);
  }

  /**
   * Yield to the event loop to keep Electron responsive.
   */
  private static yield(): Promise<void> {
    return new Promise(resolve => setImmediate(resolve));
  }
}
