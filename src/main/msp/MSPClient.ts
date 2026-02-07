import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
import { MSPConnection } from './MSPConnection';
import { MSPCommand, CLI_COMMANDS } from './commands';
import type { PortInfo, ApiVersionInfo, BoardInfo, FCInfo, Configuration, ConnectionStatus } from '@shared/types/common.types';
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
      await this.connection.sendCLICommand(CLI_COMMANDS.SAVE);
      // Don't exit CLI - FC will reboot
      this.connectionStatus = { connected: false };
      this.emit('connection-changed', this.connectionStatus);
    } catch (error) {
      logger.error('Failed to save and reboot:', error);
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
