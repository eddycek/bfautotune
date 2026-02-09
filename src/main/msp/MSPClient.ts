import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
import { MSPConnection } from './MSPConnection';
import { MSPCommand, CLI_COMMANDS } from './commands';
import type { PortInfo, ApiVersionInfo, BoardInfo, FCInfo, Configuration, ConnectionStatus } from '@shared/types/common.types';
import type { PIDConfiguration } from '@shared/types/pid.types';
import type { CurrentFilterSettings } from '@shared/types/analysis.types';
import type { BlackboxInfo } from '@shared/types/blackbox.types';
import { ConnectionError, MSPError } from '../utils/errors';
import { logger } from '../utils/logger';
import { MSP, BETAFLIGHT } from '@shared/constants';

export class MSPClient extends EventEmitter {
  private connection: MSPConnection;
  private connectionStatus: ConnectionStatus = { connected: false };
  private currentPort: string | null = null;

  constructor() {
    super();
    this.connection = new MSPConnection();

    this.connection.on('connected', () => {
      this.emit('connected');
    });

    this.connection.on('disconnected', () => {
      this.connectionStatus = { connected: false };
      this.currentPort = null;
      this.emit('disconnected');
    });

    this.connection.on('error', (error) => {
      this.emit('error', error);
    });
  }

  async listPorts(): Promise<PortInfo[]> {
    try {
      const ports = await SerialPort.list();
      logger.info(`Found ${ports.length} serial ports:`, ports);

      // Filter for likely Betaflight devices
      const filtered = ports.filter(port => {
        if (!port.vendorId) return false;
        const vid = `0x${port.vendorId}`;
        return BETAFLIGHT.VENDOR_IDS.some(id => id.toLowerCase() === vid.toLowerCase());
      });

      logger.info(`Filtered to ${filtered.length} Betaflight-compatible ports`);

      // If no filtered ports, return all ports with vendorId
      const result = filtered.length > 0 ? filtered : ports.filter(p => p.vendorId);

      return result.map(port => ({
        path: port.path,
        manufacturer: port.manufacturer,
        serialNumber: port.serialNumber,
        pnpId: port.pnpId,
        locationId: port.locationId,
        productId: port.productId,
        vendorId: port.vendorId
      }));
    } catch (error) {
      logger.error('Failed to list ports:', error);
      throw new ConnectionError('Failed to enumerate serial ports', error);
    }
  }

  async connect(portPath: string, baudRate: number = MSP.DEFAULT_BAUD_RATE): Promise<void> {
    if (this.connection.isOpen()) {
      throw new ConnectionError('Already connected');
    }

    try {
      await this.connection.open(portPath, baudRate);
      this.currentPort = portPath;

      // Wait a bit for FC to stabilize
      await this.delay(500);

      // Try to exit CLI mode if FC is stuck there from previous session
      try {
        await this.connection.forceExitCLI();
        await this.delay(500);
      } catch (error) {
        // Ignore errors - FC might not be in CLI mode
        logger.debug('CLI exit attempt (this is normal):', error);
      }

      // Try to get FC information with retry logic
      let fcInfo;
      let retries = 2;

      while (retries > 0) {
        try {
          fcInfo = await this.getFCInfo();
          break; // Success!
        } catch (error) {
          retries--;
          if (retries === 0) {
            // Last attempt failed - close port and throw error
            logger.error('Failed to get FC info after retries, closing port');
            await this.connection.close();
            this.connectionStatus = { connected: false };
            this.currentPort = null;
            throw new ConnectionError('FC not responding to MSP commands. Please disconnect and reconnect the FC.', error);
          }

          // Retry - try to reset FC state
          logger.warn(`FC not responding, attempting reset (${retries} retries left)...`);
          try {
            await this.connection.forceExitCLI();
            await this.delay(1000);
          } catch {}
        }
      }

      this.connectionStatus = {
        connected: true,
        portPath,
        fcInfo
      };

      logger.info('Connected to FC:', fcInfo);
      this.emit('connection-changed', this.connectionStatus);
    } catch (error) {
      this.connectionStatus = { connected: false };
      this.currentPort = null;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnect requested');

    if (!this.connection.isOpen()) {
      logger.warn('Port already closed, updating status');
      this.connectionStatus = { connected: false };
      this.currentPort = null;
      this.emit('connection-changed', this.connectionStatus);
      return;
    }

    try {
      logger.info('Closing connection...');
      await this.connection.close();

      // Wait a bit for the port to fully release
      // This prevents "FC not responding" errors when reconnecting immediately
      await new Promise(resolve => setTimeout(resolve, 1000));

      this.connectionStatus = { connected: false };
      this.currentPort = null;
      logger.info('Emitting connection-changed event (disconnected)');
      this.emit('connection-changed', this.connectionStatus);
      logger.info('Disconnect completed');
    } catch (error) {
      logger.error('Error during disconnect:', error);
      // Still update status even if close fails
      this.connectionStatus = { connected: false };
      this.currentPort = null;
      this.emit('connection-changed', this.connectionStatus);
      throw error;
    }
  }

  async reconnect(): Promise<void> {
    if (!this.currentPort) {
      throw new ConnectionError('No previous connection to reconnect to');
    }

    const port = this.currentPort;
    await this.disconnect();
    await this.delay(1000);
    await this.connect(port);
  }

  isConnected(): boolean {
    return this.connection.isOpen();
  }

  getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  async getApiVersion(): Promise<ApiVersionInfo> {
    const response = await this.connection.sendCommand(MSPCommand.MSP_API_VERSION);

    if (response.data.length < 3) {
      throw new MSPError('Invalid API_VERSION response');
    }

    return {
      protocol: response.data[0],
      major: response.data[1],
      minor: response.data[2]
    };
  }

  async getFCVariant(): Promise<string> {
    const response = await this.connection.sendCommand(MSPCommand.MSP_FC_VARIANT);
    return response.data.toString('utf-8', 0, 4);
  }

  async getFCVersion(): Promise<string> {
    const response = await this.connection.sendCommand(MSPCommand.MSP_FC_VERSION);

    if (response.data.length < 3) {
      throw new MSPError('Invalid FC_VERSION response');
    }

    return `${response.data[0]}.${response.data[1]}.${response.data[2]}`;
  }

  async getBoardInfo(): Promise<BoardInfo> {
    const response = await this.connection.sendCommand(MSPCommand.MSP_BOARD_INFO);

    if (response.data.length < 9) {
      throw new MSPError('Invalid BOARD_INFO response');
    }

    const boardIdentifier = response.data.toString('utf-8', 0, 4);
    const boardVersion = response.data.readUInt16LE(4);
    const boardType = response.data[6];
    const targetNameLength = response.data[7];

    let offset = 8;
    const targetName = response.data.toString('utf-8', offset, offset + targetNameLength);
    offset += targetNameLength;

    let boardName = '';
    let manufacturerId = '';
    let signature: number[] = [];
    let mcuTypeId = 0;
    let configurationState = 0;

    // Some boards don't have boardName field, check if we have enough data
    if (offset < response.data.length) {
      const boardNameLength = response.data[offset];
      offset += 1;

      if (boardNameLength > 0 && offset + boardNameLength <= response.data.length) {
        const rawBoardName = response.data.toString('utf-8', offset, offset + boardNameLength);
        // Filter out null bytes and control characters
        boardName = rawBoardName.replace(/[\x00-\x1F\x7F]/g, '').trim();
        offset += boardNameLength;
      }
    }

    // Get manufacturer ID if available
    if (offset < response.data.length) {
      const manufacturerIdLength = response.data[offset];
      offset += 1;

      if (manufacturerIdLength > 0 && offset + manufacturerIdLength <= response.data.length) {
        manufacturerId = response.data.toString('utf-8', offset, offset + manufacturerIdLength);
        offset += manufacturerIdLength;
      }
    }

    // Get signature if available
    if (offset < response.data.length) {
      const signatureLength = response.data[offset];
      offset += 1;

      if (signatureLength > 0 && offset + signatureLength <= response.data.length) {
        signature = Array.from(response.data.slice(offset, offset + signatureLength));
        offset += signatureLength;
      }
    }

    // Get MCU type and configuration state if available
    if (offset < response.data.length) {
      mcuTypeId = response.data[offset];
      if (offset + 1 < response.data.length) {
        configurationState = response.data[offset + 1];
      }
    }

    // Fallback: use targetName if boardName is empty
    if (!boardName) {
      boardName = targetName;
    }

    return {
      boardIdentifier,
      boardVersion,
      boardType,
      targetName,
      boardName,
      manufacturerId,
      signature,
      mcuTypeId,
      configurationState
    };
  }

  async getUID(): Promise<string> {
    const response = await this.connection.sendCommand(MSPCommand.MSP_UID);

    if (response.data.length < 12) {
      throw new MSPError('Invalid UID response');
    }

    // Convert UID bytes to hex string
    const uid = Array.from(response.data.slice(0, 12))
      .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
      .join('');

    return uid;
  }

  async getFCInfo(): Promise<FCInfo> {
    const [apiVersion, variant, version, boardInfo] = await Promise.all([
      this.getApiVersion(),
      this.getFCVariant(),
      this.getFCVersion(),
      this.getBoardInfo()
    ]);

    return {
      variant,
      version,
      target: boardInfo.targetName,
      boardName: boardInfo.boardName,
      apiVersion
    };
  }

  async getFCSerialNumber(): Promise<string> {
    return this.getUID();
  }

  async exportCLIDiff(): Promise<string> {
    const wasInCLI = this.connection.isInCLI();

    try {
      if (!wasInCLI) {
        await this.connection.enterCLI();
      }
      const output = await this.connection.sendCLICommand(CLI_COMMANDS.DIFF, 10000);

      // Don't exit CLI - it causes port to close on some FCs
      // Instead, just leave it in CLI mode and next MSP command will handle it

      return this.cleanCLIOutput(output);
    } catch (error) {
      // Try to recover but don't fail if exit fails
      try {
        if (!wasInCLI) {
          await this.connection.exitCLI();
        }
      } catch {}
      throw error;
    }
  }

  async exportCLIDump(): Promise<string> {
    const wasInCLI = this.connection.isInCLI();

    try {
      if (!wasInCLI) {
        await this.connection.enterCLI();
      }
      const output = await this.connection.sendCLICommand(CLI_COMMANDS.DUMP, 15000);

      // Don't exit CLI - it causes port to close on some FCs
      // Instead, just leave it in CLI mode and next MSP command will handle it

      return this.cleanCLIOutput(output);
    } catch (error) {
      // Try to recover but don't fail if exit fails
      try {
        if (!wasInCLI) {
          await this.connection.exitCLI();
        }
      } catch {}
      throw error;
    }
  }

  async saveAndReboot(): Promise<void> {
    try {
      await this.connection.enterCLI();
      // Use writeCLIRaw instead of sendCLICommand because `save` causes
      // FC to reboot — the CLI prompt never comes back, so waiting for
      // it would always time out.
      await this.connection.writeCLIRaw(CLI_COMMANDS.SAVE);
      // Give FC a moment to process the save command before we update state
      await new Promise(resolve => setTimeout(resolve, 500));
      this.connectionStatus = { connected: false };
      this.emit('connection-changed', this.connectionStatus);
    } catch (error) {
      logger.error('Failed to save and reboot:', error);
      throw error;
    }
  }

  /**
   * Read PID configuration from flight controller
   * @returns Current PID values for roll, pitch, yaw axes
   */
  async getPIDConfiguration(): Promise<PIDConfiguration> {
    const response = await this.connection.sendCommand(MSPCommand.MSP_PID);

    if (response.data.length < 9) {
      throw new MSPError('Invalid MSP_PID response - expected at least 9 bytes');
    }

    // Parse roll, pitch, yaw (first 9 bytes)
    // Format: Roll P/I/D (0-2), Pitch P/I/D (3-5), Yaw P/I/D (6-8)
    const config: PIDConfiguration = {
      roll: {
        P: response.data[0],
        I: response.data[1],
        D: response.data[2]
      },
      pitch: {
        P: response.data[3],
        I: response.data[4],
        D: response.data[5]
      },
      yaw: {
        P: response.data[6],
        I: response.data[7],
        D: response.data[8]
      }
    };

    logger.info('PID configuration read:', config);
    return config;
  }

  /**
   * Read filter configuration from flight controller
   * @returns Current filter settings (gyro LPF, D-term LPF, dynamic notch)
   */
  async getFilterConfiguration(): Promise<CurrentFilterSettings> {
    const response = await this.connection.sendCommand(MSPCommand.MSP_FILTER_CONFIG);

    if (response.data.length < 47) {
      throw new MSPError(
        `Invalid MSP_FILTER_CONFIG response - expected at least 47 bytes, got ${response.data.length}`
      );
    }

    // Betaflight 4.4+ MSP_FILTER_CONFIG binary layout
    // (from betaflight-configurator MSPHelper.js parsing order):
    //  0: U8  gyro_lpf1_static_hz (legacy, low byte only)
    //  1: U16 dterm_lpf1_static_hz
    //  3: U16 yaw_lowpass_hz
    //  5: U16 gyro_notch_hz
    //  7: U16 gyro_notch_cutoff
    //  9: U16 dterm_notch_hz
    // 11: U16 dterm_notch_cutoff
    // 13: U16 gyro_notch2_hz
    // 15: U16 gyro_notch2_cutoff
    // 17: U8  dterm_lpf1_type
    // 18: U8  gyro_hardware_lpf
    // 19: U8  (deprecated)
    // 20: U16 gyro_lpf1_static_hz (full uint16)
    // 22: U16 gyro_lpf2_static_hz
    // 24: U8  gyro_lpf1_type
    // 25: U8  gyro_lpf2_type
    // 26: U16 dterm_lpf2_static_hz
    // 28: U8  dterm_lpf2_type
    // 29: U16 gyro_lowpass_dyn_min_hz
    // 31: U16 gyro_lowpass_dyn_max_hz
    // 33: U16 dterm_lowpass_dyn_min_hz
    // 35: U16 dterm_lowpass_dyn_max_hz
    // 37: U8  dyn_notch_range (deprecated)
    // 38: U8  dyn_notch_width_percent (deprecated)
    // 39: U16 dyn_notch_q
    // 41: U16 dyn_notch_min_hz
    // 43: U8  rpm_notch_harmonics
    // 44: U8  rpm_notch_min_hz
    // 45: U16 dyn_notch_max_hz
    const settings: CurrentFilterSettings = {
      gyro_lpf1_static_hz: response.data.readUInt16LE(20),
      dterm_lpf1_static_hz: response.data.readUInt16LE(1),
      gyro_lpf2_static_hz: response.data.readUInt16LE(22),
      dterm_lpf2_static_hz: response.data.readUInt16LE(26),
      dyn_notch_min_hz: response.data.readUInt16LE(41),
      dyn_notch_max_hz: response.data.readUInt16LE(45),
    };

    logger.info('Filter configuration read:', settings);
    return settings;
  }

  /**
   * Write PID configuration to flight controller RAM (not persisted)
   * @param config PID values to write
   */
  async setPIDConfiguration(config: PIDConfiguration): Promise<void> {
    // Create 30-byte buffer for all PID values (Betaflight MSP_SET_PID format)
    const data = Buffer.alloc(30);

    // Roll (bytes 0-2)
    data[0] = Math.round(config.roll.P);
    data[1] = Math.round(config.roll.I);
    data[2] = Math.round(config.roll.D);

    // Pitch (bytes 3-5)
    data[3] = Math.round(config.pitch.P);
    data[4] = Math.round(config.pitch.I);
    data[5] = Math.round(config.pitch.D);

    // Yaw (bytes 6-8)
    data[6] = Math.round(config.yaw.P);
    data[7] = Math.round(config.yaw.I);
    data[8] = Math.round(config.yaw.D);

    // Bytes 9-29: other PIDs (leave as 0 - won't affect FC if unchanged)

    const response = await this.connection.sendCommand(MSPCommand.MSP_SET_PID, data);

    if (response.error) {
      throw new MSPError('Failed to set PID configuration');
    }

    logger.info('PID configuration updated successfully:', config);
  }

  /**
   * Get Blackbox dataflash storage information
   * Returns flash capacity, used space, and whether logs are available
   */
  async getBlackboxInfo(): Promise<BlackboxInfo> {
    if (!this.isConnected()) {
      throw new ConnectionError('Flight controller not connected');
    }

    try {
      const response = await this.connection.sendCommand(MSPCommand.MSP_DATAFLASH_SUMMARY);

      logger.debug('Blackbox response:', {
        error: response.error,
        dataLength: response.data.length,
        dataHex: response.data.toString('hex')
      });

      if (response.error) {
        logger.warn('Blackbox MSP error response');
        return {
          supported: false,
          totalSize: 0,
          usedSize: 0,
          hasLogs: false,
          freeSize: 0,
          usagePercent: 0
        };
      }

      // Some FCs return shorter responses - handle gracefully
      if (response.data.length < 13) {
        logger.warn(`Blackbox response too short: ${response.data.length} bytes`);
        return {
          supported: false,
          totalSize: 0,
          usedSize: 0,
          hasLogs: false,
          freeSize: 0,
          usagePercent: 0
        };
      }

      // Parse dataflash summary response (13 bytes total)
      // Byte 0: ready flag (bit 0 = flash ready, bit 1 = supported)
      // Bytes 1-4: flags (uint32)
      // Bytes 5-8: total size in bytes (uint32)
      // Bytes 9-12: used size in bytes (uint32)
      const ready = response.data.readUInt8(0);
      const flags = response.data.readUInt32LE(1);
      const totalSize = response.data.readUInt32LE(5);
      const usedSize = response.data.readUInt32LE(9);

      logger.debug('Blackbox parsed:', { ready, flags, totalSize, usedSize, readyHex: ready.toString(16), flagsHex: flags.toString(16) });

      // Check if supported (ready bit 1 = 0x02)
      const supported = (ready & 0x02) !== 0;

      // Check for invalid values (0x80000000 = "not available" on some FCs)
      const INVALID_SIZE = 0x80000000;
      if (totalSize === INVALID_SIZE || usedSize === INVALID_SIZE) {
        if (supported) {
          // Blackbox is supported but size info not available (possibly SD card or external storage)
          logger.warn('Blackbox supported but size info invalid (0x80000000) - might use SD card');
          return {
            supported: true,
            totalSize: 0,
            usedSize: 0,
            hasLogs: false,
            freeSize: 0,
            usagePercent: 0
          };
        } else {
          // Not supported and invalid sizes
          logger.warn('Blackbox not supported (invalid sizes and flag not set)');
          return {
            supported: false,
            totalSize: 0,
            usedSize: 0,
            hasLogs: false,
            freeSize: 0,
            usagePercent: 0
          };
        }
      }

      // If not supported by flags, return false
      if (!supported) {
        logger.warn('Blackbox not supported (flags bit 1 not set)');
        return {
          supported: false,
          totalSize: 0,
          usedSize: 0,
          hasLogs: false,
          freeSize: 0,
          usagePercent: 0
        };
      }

      // Blackbox is supported by flags, but totalSize is 0
      if (totalSize === 0) {
        logger.warn('Blackbox supported but totalSize is 0 - flash not configured or empty');
        return {
          supported: true,
          totalSize: 0,
          usedSize: 0,
          hasLogs: false,
          freeSize: 0,
          usagePercent: 0
        };
      }

      // Normal case with valid sizes
      const hasLogs = usedSize > 0; // Logs exist if any space is used (even if 100% full)
      const freeSize = totalSize - usedSize;
      const usagePercent = totalSize > 0 ? Math.round((usedSize / totalSize) * 100) : 0;

      const info: BlackboxInfo = {
        supported,
        totalSize,
        usedSize,
        hasLogs,
        freeSize,
        usagePercent
      };

      logger.info('Blackbox info:', info);
      return info;
    } catch (error) {
      logger.error('Failed to get Blackbox info:', error);
      // Return unsupported state instead of throwing
      return {
        supported: false,
        totalSize: 0,
        usedSize: 0,
        hasLogs: false,
        freeSize: 0,
        usagePercent: 0
      };
    }
  }

  /**
   * Test if FC supports MSP_DATAFLASH_READ by attempting minimal read
   * @returns Object with success status and diagnostic info
   */
  async testBlackboxRead(): Promise<{ success: boolean; message: string; data?: string }> {
    if (!this.isConnected()) {
      return { success: false, message: 'FC not connected' };
    }

    try {
      logger.info('Testing MSP_DATAFLASH_READ with minimal request (10 bytes from address 0)...');

      // Try to read just 10 bytes from address 0
      const request = Buffer.alloc(6);
      request.writeUInt32LE(0, 0); // address = 0
      request.writeUInt16LE(10, 4); // size = 10 bytes

      logger.debug(`Test request hex: ${request.toString('hex')}`);

      // Short timeout for test (5 seconds)
      const response = await this.connection.sendCommand(MSPCommand.MSP_DATAFLASH_READ, request, 5000);

      logger.info(`Test SUCCESS! Received ${response.data.length} bytes: ${response.data.toString('hex')}`);

      return {
        success: true,
        message: `FC responded with ${response.data.length} bytes`,
        data: response.data.toString('hex')
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Test FAILED: ${message}`);

      return {
        success: false,
        message: `Test failed: ${message}`
      };
    }
  }

  /**
   * Read a chunk of Blackbox data from flash storage.
   *
   * MSP_DATAFLASH_READ response format:
   *   [4B readAddress LE] [2B dataSize LE] [1B isCompressed (BF 4.1+)] [dataSize bytes]
   *
   * We strip the response header and return only the raw flash data.
   *
   * @param address - Start address to read from
   * @param size - Number of bytes to read (max 4096)
   * @returns Buffer containing only the flash data (header stripped)
   */
  async readBlackboxChunk(address: number, size: number): Promise<Buffer> {
    if (!this.isConnected()) {
      throw new ConnectionError('Flight controller not connected');
    }

    // Max size with MSP jumbo frames
    if (size > 8192) {
      throw new Error('Chunk size cannot exceed 8192 bytes (MSP jumbo frame limit)');
    }

    try {
      // Build request: address (uint32 LE) + size (uint16 LE)
      const request = Buffer.alloc(6);
      request.writeUInt32LE(address, 0);
      request.writeUInt16LE(size, 4);

      // Use 5 second timeout - fail fast so adaptive chunking can adjust quickly
      const response = await this.connection.sendCommand(MSPCommand.MSP_DATAFLASH_READ, request, 5000);

      // Strip MSP_DATAFLASH_READ response header to return only flash data.
      // Without this, downloadBlackboxLog would use chunk.length (which includes
      // the header) as the flash address offset, skipping bytes on every read.
      return MSPClient.extractFlashPayload(response.data);
    } catch (error) {
      logger.error(`Failed to read Blackbox chunk at ${address}: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  /**
   * Extract raw flash data from an MSP_DATAFLASH_READ response payload.
   *
   * Response format (BF 4.1+ with USE_HUFFMAN):
   *   [4B readAddress] [2B dataSize] [1B isCompressed] [data...]
   *
   * Older format (no compression support):
   *   [4B readAddress] [2B dataSize] [data...]
   *
   * Detects header size by comparing response length with dataSize field.
   */
  static extractFlashPayload(responseData: Buffer): Buffer {
    if (responseData.length < 6) {
      return responseData;
    }

    const dataSize = responseData.readUInt16LE(4);

    // Detect 7-byte header (with compression flag) vs 6-byte header
    if (responseData.length === 7 + dataSize && responseData.length >= 7) {
      const isCompressed = responseData[6];
      if (isCompressed) {
        logger.warn('Compressed dataflash response detected — compression not yet supported, data may be corrupted');
      }
      return responseData.subarray(7, 7 + dataSize);
    }

    if (responseData.length === 6 + dataSize) {
      return responseData.subarray(6, 6 + dataSize);
    }

    // Unknown format — return everything after minimum 6-byte header
    logger.warn(`Unexpected dataflash response size: ${responseData.length} bytes, expected ${6 + dataSize} or ${7 + dataSize}`);
    return responseData.subarray(6);
  }

  /**
   * Download entire Blackbox log from flash storage
   * @param onProgress - Optional callback for progress updates (0-100)
   * @returns Buffer containing all log data
   */
  async downloadBlackboxLog(onProgress?: (progress: number) => void): Promise<Buffer> {
    if (!this.isConnected()) {
      throw new ConnectionError('Flight controller not connected');
    }

    try {
      // Get flash info to know how much to download
      const info = await this.getBlackboxInfo();

      if (!info.supported || !info.hasLogs || info.usedSize === 0) {
        throw new Error('No Blackbox logs available to download');
      }

      logger.info(`Starting Blackbox download: ${info.usedSize} bytes`);

      const chunks: Buffer[] = [];
      let bytesRead = 0;

      // Conservative adaptive chunking with recovery delays
      // Start with known-working size, gradually increase with caution
      let currentChunkSize = 180; // Start conservative (between 128 working and 256 timeout)
      const minChunkSize = 128; // Known working minimum
      const maxChunkSize = 240; // Conservative max (under 256 timeout threshold)
      let consecutiveSuccesses = 0;
      let consecutiveFailures = 0;

      // Read flash in chunks with adaptive sizing
      while (bytesRead < info.usedSize) {
        const remaining = info.usedSize - bytesRead;
        const requestSize = Math.min(currentChunkSize, remaining);

        try {
          const chunk = await this.readBlackboxChunk(bytesRead, requestSize);
          chunks.push(chunk);
          bytesRead += chunk.length;
          consecutiveSuccesses++;
          consecutiveFailures = 0;

          // After 50 successful chunks, cautiously try increasing chunk size by 10 bytes
          if (consecutiveSuccesses >= 50 && currentChunkSize < maxChunkSize) {
            const newSize = Math.min(currentChunkSize + 10, maxChunkSize);
            logger.info(`Increasing chunk size: ${currentChunkSize} → ${newSize} bytes`);
            currentChunkSize = newSize;
            consecutiveSuccesses = 0;
          }

          // Report progress
          if (onProgress) {
            const progress = Math.round((bytesRead / info.usedSize) * 100);
            onProgress(progress);

            // Log only at 5% intervals to reduce overhead
            if (progress % 5 === 0 && progress > 0) {
              logger.info(`Downloaded ${bytesRead}/${info.usedSize} bytes (${progress}%) - chunk size: ${currentChunkSize}B`);
            }
          }

          // Tiny delay to keep FC stable
          await new Promise(resolve => setTimeout(resolve, 5));
        } catch (error) {
          // Chunk failed - reduce size and retry with recovery delay
          consecutiveFailures++;
          consecutiveSuccesses = 0;

          if (consecutiveFailures > 5) {
            // Too many failures, abort
            logger.error(`Too many consecutive failures (${consecutiveFailures}) at chunk size ${currentChunkSize}, aborting`);
            throw error;
          }

          // Reduce chunk size more conservatively
          const newSize = Math.max(Math.floor(currentChunkSize * 0.8), minChunkSize);
          logger.warn(`Chunk failed at size ${currentChunkSize} (failure ${consecutiveFailures}/5), reducing to ${newSize} bytes and retrying`);
          currentChunkSize = newSize;

          // Give FC time to recover after timeout (critical!)
          await new Promise(resolve => setTimeout(resolve, 500));

          // Don't increment bytesRead - retry same address
          continue;
        }
      }

      const fullLog = Buffer.concat(chunks);
      logger.info(`Blackbox download complete: ${fullLog.length} bytes (final chunk size: ${currentChunkSize}B)`);

      return fullLog;
    } catch (error) {
      logger.error('Failed to download Blackbox log:', error);
      throw error;
    }
  }

  /**
   * Erase all data from Blackbox flash storage
   * WARNING: This permanently deletes all logged flight data!
   */
  async eraseBlackboxFlash(): Promise<void> {
    if (!this.isConnected()) {
      throw new ConnectionError('Flight controller not connected');
    }

    try {
      logger.warn('Erasing Blackbox flash - all logged data will be permanently deleted');

      // MSP_DATAFLASH_ERASE has no payload
      const response = await this.connection.sendCommand(MSPCommand.MSP_DATAFLASH_ERASE, Buffer.alloc(0), 30000);

      if (response.error) {
        throw new MSPError('Failed to erase Blackbox flash');
      }

      logger.info('Blackbox flash erased successfully');
    } catch (error) {
      logger.error('Failed to erase Blackbox flash:', error);
      throw error;
    }
  }

  private cleanCLIOutput(output: string): string {
    // Remove CLI prompt characters and clean up
    return output
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('#') && trimmed !== '#';
      })
      .join('\n')
      .trim();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
