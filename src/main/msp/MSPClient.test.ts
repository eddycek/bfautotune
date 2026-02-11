import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MSPClient } from './MSPClient';
import { MSPCommand } from './types';

// Mock dependencies
vi.mock('serialport', () => ({
  SerialPort: { list: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../utils/errors', () => ({
  ConnectionError: class extends Error { constructor(m: string) { super(m); } },
  MSPError: class extends Error { constructor(m: string) { super(m); } },
}));

vi.mock('@shared/constants', () => ({
  MSP: { DEFAULT_BAUD_RATE: 115200 },
  BETAFLIGHT: { VENDOR_IDS: [] },
}));

describe('MSPClient.extractFlashPayload', () => {
  it('strips 7-byte header (BF 4.1+ with compression flag)', () => {
    // [4B addr=0][2B size=5][1B comp=0][5 bytes data]
    const buf = Buffer.alloc(12);
    buf.writeUInt32LE(0, 0);    // address
    buf.writeUInt16LE(5, 4);    // dataSize = 5
    buf[6] = 0;                 // isCompressed = false
    buf[7] = 0x48; // 'H'
    buf[8] = 0x20; // ' '
    buf[9] = 0x50; // 'P'
    buf[10] = 0x72; // 'r'
    buf[11] = 0x6F; // 'o'

    const result = MSPClient.extractFlashPayload(buf);
    expect(result.length).toBe(5);
    expect(result[0]).toBe(0x48); // 'H'
    expect(result.toString()).toBe('H Pro');
  });

  it('strips 6-byte header (no compression flag)', () => {
    // [4B addr=0][2B size=4][4 bytes data]
    const buf = Buffer.alloc(10);
    buf.writeUInt32LE(0, 0);
    buf.writeUInt16LE(4, 4);
    buf[6] = 0x48;
    buf[7] = 0x20;
    buf[8] = 0x50;
    buf[9] = 0x72;

    const result = MSPClient.extractFlashPayload(buf);
    expect(result.length).toBe(4);
    expect(result[0]).toBe(0x48);
  });

  it('handles compressed response (warns but returns data)', () => {
    // [4B addr][2B size=3][1B comp=1][3 bytes compressed data]
    const buf = Buffer.alloc(10);
    buf.writeUInt32LE(100, 0);
    buf.writeUInt16LE(3, 4);
    buf[6] = 1; // isCompressed = true
    buf[7] = 0xAA;
    buf[8] = 0xBB;
    buf[9] = 0xCC;

    const result = MSPClient.extractFlashPayload(buf);
    expect(result.length).toBe(3);
    expect(result[0]).toBe(0xAA);
  });

  it('returns raw data for buffers shorter than 6 bytes', () => {
    const buf = Buffer.from([0x01, 0x02, 0x03]);
    const result = MSPClient.extractFlashPayload(buf);
    expect(result).toBe(buf);
  });

  it('correctly strips header for typical 180-byte chunk', () => {
    // Simulates a real download chunk: 7-byte header + 180 bytes flash data
    const flashData = Buffer.alloc(180);
    for (let i = 0; i < 180; i++) flashData[i] = i & 0xFF;

    const response = Buffer.alloc(187);
    response.writeUInt32LE(0, 0);
    response.writeUInt16LE(180, 4);
    response[6] = 0; // no compression
    flashData.copy(response, 7);

    const result = MSPClient.extractFlashPayload(response);
    expect(result.length).toBe(180);
    expect(Buffer.compare(result, flashData)).toBe(0);
  });
});

describe('MSPClient.getFilterConfiguration', () => {
  let client: MSPClient;
  let mockSendCommand: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new MSPClient();
    mockSendCommand = vi.fn();
    // Access the private connection and stub sendCommand
    (client as any).connection = {
      sendCommand: mockSendCommand,
      isOpen: vi.fn().mockReturnValue(true),
      on: vi.fn(),
    };
  });

  it('parses valid MSP_FILTER_CONFIG response into correct CurrentFilterSettings', async () => {
    // Build a 47-byte response buffer matching Betaflight 4.4+ layout
    // Layout (from betaflight-configurator MSPHelper.js):
    //  0: U8  gyro_lpf1 (legacy)   1: U16 dterm_lpf1
    // 20: U16 gyro_lpf1 (full)    22: U16 gyro_lpf2
    // 26: U16 dterm_lpf2          39: U16 dyn_notch_q
    // 41: U16 dyn_notch_min       43: U8  rpm_notch_harmonics
    // 44: U8  rpm_notch_min_hz    45: U16 dyn_notch_max
    const buf = Buffer.alloc(47, 0);
    buf.writeUInt16LE(250, 20); // gyro_lpf1_static_hz
    buf.writeUInt16LE(150, 1);  // dterm_lpf1_static_hz
    buf.writeUInt16LE(500, 22); // gyro_lpf2_static_hz
    buf.writeUInt16LE(150, 26); // dterm_lpf2_static_hz
    buf.writeUInt16LE(300, 39); // dyn_notch_q
    buf.writeUInt16LE(100, 41); // dyn_notch_min_hz
    buf.writeUInt8(3, 43);      // rpm_filter_harmonics
    buf.writeUInt8(100, 44);    // rpm_filter_min_hz
    buf.writeUInt16LE(600, 45); // dyn_notch_max_hz

    mockSendCommand.mockResolvedValue({ command: MSPCommand.MSP_FILTER_CONFIG, data: buf });

    const result = await client.getFilterConfiguration();

    expect(mockSendCommand).toHaveBeenCalledWith(MSPCommand.MSP_FILTER_CONFIG);
    expect(result).toEqual({
      gyro_lpf1_static_hz: 250,
      dterm_lpf1_static_hz: 150,
      gyro_lpf2_static_hz: 500,
      dterm_lpf2_static_hz: 150,
      dyn_notch_min_hz: 100,
      dyn_notch_max_hz: 600,
      dyn_notch_q: 300,
      rpm_filter_harmonics: 3,
      rpm_filter_min_hz: 100,
    });
  });

  it('throws on response shorter than 47 bytes', async () => {
    const buf = Buffer.alloc(20, 0);
    mockSendCommand.mockResolvedValue({ command: MSPCommand.MSP_FILTER_CONFIG, data: buf });

    await expect(client.getFilterConfiguration()).rejects.toThrow(
      'Invalid MSP_FILTER_CONFIG response - expected at least 47 bytes, got 20'
    );
  });

  it('handles zero values correctly (disabled filters)', async () => {
    const buf = Buffer.alloc(47, 0); // all zeros = all filters disabled
    mockSendCommand.mockResolvedValue({ command: MSPCommand.MSP_FILTER_CONFIG, data: buf });

    const result = await client.getFilterConfiguration();

    expect(result).toEqual({
      gyro_lpf1_static_hz: 0,
      dterm_lpf1_static_hz: 0,
      gyro_lpf2_static_hz: 0,
      dterm_lpf2_static_hz: 0,
      dyn_notch_min_hz: 0,
      dyn_notch_max_hz: 0,
      dyn_notch_q: 0,
      rpm_filter_harmonics: 0,
      rpm_filter_min_hz: 0,
    });
  });

  it('reads dyn_notch_count from extended response (byte 47+)', async () => {
    const buf = Buffer.alloc(48, 0);
    buf.writeUInt16LE(250, 20); // gyro_lpf1_static_hz
    buf.writeUInt16LE(150, 1);  // dterm_lpf1_static_hz
    buf.writeUInt16LE(500, 22); // gyro_lpf2_static_hz
    buf.writeUInt16LE(150, 26); // dterm_lpf2_static_hz
    buf.writeUInt16LE(300, 39); // dyn_notch_q
    buf.writeUInt16LE(100, 41); // dyn_notch_min_hz
    buf.writeUInt8(3, 43);      // rpm_filter_harmonics
    buf.writeUInt8(100, 44);    // rpm_filter_min_hz
    buf.writeUInt16LE(600, 45); // dyn_notch_max_hz
    buf.writeUInt8(1, 47);      // dyn_notch_count

    mockSendCommand.mockResolvedValue({ command: MSPCommand.MSP_FILTER_CONFIG, data: buf });

    const result = await client.getFilterConfiguration();

    expect(result.dyn_notch_count).toBe(1);
    expect(result.rpm_filter_harmonics).toBe(3);
  });

  it('does not include dyn_notch_count for minimal 47-byte response', async () => {
    const buf = Buffer.alloc(47, 0);
    buf.writeUInt8(3, 43); // rpm_filter_harmonics

    mockSendCommand.mockResolvedValue({ command: MSPCommand.MSP_FILTER_CONFIG, data: buf });

    const result = await client.getFilterConfiguration();

    expect(result.rpm_filter_harmonics).toBe(3);
    expect(result.dyn_notch_count).toBeUndefined();
  });
});

describe('MSPClient.getFeedforwardConfiguration', () => {
  let client: MSPClient;
  let mockSendCommand: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new MSPClient();
    mockSendCommand = vi.fn();
    (client as any).connection = {
      sendCommand: mockSendCommand,
      isOpen: vi.fn().mockReturnValue(true),
      on: vi.fn(),
    };
  });

  it('parses valid MSP_PID_ADVANCED response into FeedforwardConfiguration', async () => {
    // Build a 45-byte response buffer matching BF 4.3+ layout
    const buf = Buffer.alloc(45, 0);
    buf.writeUInt8(50, 8);         // feedforwardTransition
    buf.writeUInt16LE(120, 24);    // feedforwardRoll
    buf.writeUInt16LE(120, 26);    // feedforwardPitch
    buf.writeUInt16LE(80, 28);     // feedforwardYaw
    buf.writeUInt8(37, 41);        // feedforwardSmoothFactor
    buf.writeUInt8(15, 42);        // feedforwardBoost
    buf.writeUInt8(100, 43);       // feedforwardMaxRateLimit
    buf.writeUInt8(7, 44);         // feedforwardJitterFactor

    mockSendCommand.mockResolvedValue({ command: MSPCommand.MSP_PID_ADVANCED, data: buf });

    const result = await client.getFeedforwardConfiguration();

    expect(mockSendCommand).toHaveBeenCalledWith(MSPCommand.MSP_PID_ADVANCED);
    expect(result).toEqual({
      transition: 50,
      rollGain: 120,
      pitchGain: 120,
      yawGain: 80,
      boost: 15,
      smoothFactor: 37,
      jitterFactor: 7,
      maxRateLimit: 100,
    });
  });

  it('throws on response shorter than 45 bytes', async () => {
    const buf = Buffer.alloc(30, 0);
    mockSendCommand.mockResolvedValue({ command: MSPCommand.MSP_PID_ADVANCED, data: buf });

    await expect(client.getFeedforwardConfiguration()).rejects.toThrow(
      'Invalid MSP_PID_ADVANCED response - expected at least 45 bytes, got 30'
    );
  });

  it('handles zero values (FF disabled)', async () => {
    const buf = Buffer.alloc(45, 0);
    mockSendCommand.mockResolvedValue({ command: MSPCommand.MSP_PID_ADVANCED, data: buf });

    const result = await client.getFeedforwardConfiguration();

    expect(result.boost).toBe(0);
    expect(result.rollGain).toBe(0);
    expect(result.transition).toBe(0);
  });
});
