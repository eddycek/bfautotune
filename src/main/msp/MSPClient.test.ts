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
    // 26: U16 dterm_lpf2          41: U16 dyn_notch_min
    // 45: U16 dyn_notch_max
    const buf = Buffer.alloc(47, 0);
    buf.writeUInt16LE(250, 20); // gyro_lpf1_static_hz
    buf.writeUInt16LE(150, 1);  // dterm_lpf1_static_hz
    buf.writeUInt16LE(500, 22); // gyro_lpf2_static_hz
    buf.writeUInt16LE(150, 26); // dterm_lpf2_static_hz
    buf.writeUInt16LE(100, 41); // dyn_notch_min_hz
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
    });
  });
});
