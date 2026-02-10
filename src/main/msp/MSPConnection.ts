import { SerialPort } from 'serialport';
import { EventEmitter } from 'events';
import { MSPProtocol } from './MSPProtocol';
import { MSPResponse } from './types';
import { ConnectionError, TimeoutError } from '../utils/errors';
import { logger } from '../utils/logger';
import { MSP } from '@shared/constants';

export class MSPConnection extends EventEmitter {
  private port: SerialPort | null = null;
  private protocol: MSPProtocol;
  private buffer: Buffer = Buffer.alloc(0);
  private responseQueue: Map<number, { resolve: (response: MSPResponse) => void; timeout: NodeJS.Timeout }> = new Map();
  private cliMode: boolean = false;
  private cliBuffer: string = '';

  constructor() {
    super();
    this.protocol = new MSPProtocol();
  }

  async open(portPath: string, baudRate: number = MSP.DEFAULT_BAUD_RATE): Promise<void> {
    if (this.port?.isOpen) {
      throw new ConnectionError('Port already open');
    }

    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: portPath,
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
      }, (error) => {
        if (error) {
          reject(new ConnectionError(`Failed to open port: ${error.message}`, error));
          return;
        }

        this.setupListeners();
        logger.info(`Connected to ${portPath} at ${baudRate} baud`);
        this.emit('connected');
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    if (!this.port?.isOpen) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.port!.close((error) => {
        if (error) {
          reject(new ConnectionError(`Failed to close port: ${error.message}`, error));
          return;
        }

        this.port = null;
        this.buffer = Buffer.alloc(0);
        this.responseQueue.clear();
        this.cliMode = false;
        this.cliBuffer = '';
        logger.info('Disconnected');
        this.emit('disconnected');
        resolve();
      });
    });
  }

  isOpen(): boolean {
    return this.port?.isOpen ?? false;
  }

  isInCLI(): boolean {
    return this.cliMode;
  }

  /** Write a CLI command without waiting for prompt. Used for `save` which reboots the FC. */
  async writeCLIRaw(command: string): Promise<void> {
    if (!this.cliMode) {
      throw new ConnectionError('Not in CLI mode');
    }
    return new Promise((resolve, reject) => {
      this.port!.write(`${command}\r\n`, (error) => {
        if (error) {
          reject(new ConnectionError(`Failed to write CLI command: ${error.message}`, error));
          return;
        }
        this.port!.drain(() => resolve());
      });
    });
  }

  async sendCommand(command: number, data: Buffer = Buffer.alloc(0), timeout: number = MSP.COMMAND_TIMEOUT): Promise<MSPResponse> {
    if (!this.isOpen()) {
      throw new ConnectionError('Port not open');
    }

    // If we're in CLI mode, try to exit gracefully first
    if (this.cliMode) {
      logger.info('Exiting CLI mode before MSP command');
      try {
        await this.exitCLI();
      } catch (error) {
        logger.warn('Failed to exit CLI mode gracefully, forcing MSP mode');
        this.cliMode = false;
        this.cliBuffer = '';
      }
    }

    const message = this.protocol.encode(command, data);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.responseQueue.delete(command);
        reject(new TimeoutError(`MSP command ${command} timed out`));
      }, timeout);

      this.responseQueue.set(command, { resolve, timeout: timeoutId });

      this.port!.write(message, (error) => {
        if (error) {
          this.responseQueue.delete(command);
          clearTimeout(timeoutId);
          reject(new ConnectionError(`Failed to write: ${error.message}`, error));
        }
      });
    });
  }

  async enterCLI(): Promise<void> {
    if (!this.isOpen()) {
      throw new ConnectionError('Port not open');
    }

    this.cliMode = true;
    this.cliBuffer = '';

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new TimeoutError('CLI mode entry timed out'));
      }, MSP.COMMAND_TIMEOUT);

      const listener = (data: string) => {
        if (data.includes('#')) {
          clearTimeout(timeoutId);
          this.removeListener('cli-data', listener);
          resolve();
        }
      };

      this.on('cli-data', listener);
      this.port!.write('#\r\n');
    });
  }

  async exitCLI(): Promise<void> {
    if (!this.cliMode) {
      return;
    }

    // IMPORTANT: In Betaflight, 'exit' command REBOOTS the FC (same as 'save' but
    // without saving). There is NO way to leave CLI mode without rebooting.
    // So we just reset the local state flag — the FC remains in CLI mode until
    // physically disconnected or rebooted. MSP commands will fail until then,
    // but sendCommand() checks cliMode and calls this first.
    return new Promise((resolve) => {
      this.cliBuffer = '';
      this.cliMode = false;
      resolve();
    });
  }

  async forceExitCLI(): Promise<void> {
    // Force reset CLI mode flag without sending any commands.
    // Used during connection to clear stale state. If the FC is actually stuck
    // in CLI mode, it will be resolved by the physical disconnect/reconnect cycle.
    // We cannot send 'exit' because it reboots the FC.
    return new Promise((resolve) => {
      this.cliMode = false;
      this.cliBuffer = '';
      resolve();
    });
  }

  async sendCLICommand(command: string, timeout: number = 10000): Promise<string> {
    if (!this.cliMode) {
      throw new ConnectionError('Not in CLI mode');
    }

    return new Promise((resolve, reject) => {
      this.cliBuffer = '';

      const timeoutId = setTimeout(() => {
        this.removeListener('cli-data', listener);
        reject(new TimeoutError(`CLI command timed out: ${command}`));
      }, timeout);

      const listener = (data: string) => {
        this.cliBuffer += data;
        // Wait for CLI prompt at end of accumulated buffer.
        // The prompt is "# " after a newline. We must check the accumulated
        // buffer (not individual chunks) to avoid false-matching comment
        // lines like "# master" or "# profile 0" in diff/dump output.
        const trimmed = this.cliBuffer.trimEnd();
        if (trimmed.endsWith('\n#') || trimmed === '#') {
          clearTimeout(timeoutId);
          this.removeListener('cli-data', listener);
          resolve(this.cliBuffer);
        }
      };

      this.on('cli-data', listener);
      this.port!.write(`${command}\r\n`);
    });
  }

  private setupListeners(): void {
    if (!this.port) return;

    this.port.on('data', (data: Buffer) => {
      if (this.cliMode) {
        const text = data.toString('utf-8');
        this.emit('cli-data', text);
      } else {
        this.handleMSPData(data);
      }
    });

    this.port.on('error', (error) => {
      logger.error('Serial port error:', error);
      this.emit('error', error);
    });

    this.port.on('close', () => {
      logger.info('Port closed');
      this.emit('disconnected');
    });
  }

  private handleMSPData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);

    const { messages, remaining } = this.protocol.parseBuffer(this.buffer);
    this.buffer = remaining;

    for (const message of messages) {
      if (message.error) {
        logger.warn(`MSP error response for command ${message.command}`);
      }

      const pending = this.responseQueue.get(message.command);
      if (pending) {
        clearTimeout(pending.timeout);
        this.responseQueue.delete(message.command);
        pending.resolve(message);
      } else {
        this.emit('unsolicited', message);
      }
    }
  }
}
