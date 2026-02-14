/**
 * MockSerialPort — simulates SerialPort for testing MSPConnection.
 *
 * Captures written bytes for assertion and allows injecting data events
 * to simulate FC responses. Does NOT require actual serial hardware.
 */

import { EventEmitter } from 'events';

export class MockSerialPort extends EventEmitter {
  public isOpen = false;
  public writtenData: Buffer[] = [];
  public path: string;
  public baudRate: number;

  private _openCallback: ((error?: Error | null) => void) | null = null;
  private _closeCallback: ((error?: Error | null) => void) | null = null;
  private _shouldFailOpen = false;
  private _shouldFailClose = false;
  private _shouldFailWrite = false;

  constructor(
    opts: { path: string; baudRate: number; [key: string]: any },
    callback?: (error?: Error | null) => void
  ) {
    super();
    this.path = opts.path;
    this.baudRate = opts.baudRate;
    this._openCallback = callback || null;

    // Auto-resolve open in next tick (simulates async port open)
    if (!this._shouldFailOpen && callback) {
      process.nextTick(() => {
        this.isOpen = true;
        callback(null);
      });
    }
  }

  write(data: string | Buffer, callback?: (error?: Error | null) => void): boolean {
    if (this._shouldFailWrite) {
      const err = new Error('Write failed');
      if (callback) callback(err);
      return false;
    }

    const buf = typeof data === 'string' ? Buffer.from(data) : data;
    this.writtenData.push(buf);
    if (callback) process.nextTick(() => callback(null));
    return true;
  }

  drain(callback?: (error?: Error | null) => void): void {
    if (callback) process.nextTick(() => callback(null));
  }

  close(callback?: (error?: Error | null) => void): void {
    if (this._shouldFailClose) {
      if (callback) process.nextTick(() => callback(new Error('Close failed')));
      return;
    }

    this.isOpen = false;
    if (callback) process.nextTick(() => callback(null));
  }

  // ─── Test helpers ────────────────────────────────────────────

  /** Simulate receiving data from FC */
  injectData(data: Buffer | string): void {
    const buf = typeof data === 'string' ? Buffer.from(data) : data;
    this.emit('data', buf);
  }

  /** Simulate port error */
  injectError(error: Error): void {
    this.emit('error', error);
  }

  /** Simulate port close event (e.g. FC disconnected) */
  injectClose(): void {
    this.isOpen = false;
    this.emit('close');
  }

  /** Configure to fail on next open */
  failOpen(): void {
    this._shouldFailOpen = true;
    if (this._openCallback) {
      process.nextTick(() => this._openCallback!(new Error('Failed to open port')));
    }
  }

  /** Configure to fail on writes */
  failWrites(): void {
    this._shouldFailWrite = true;
  }

  /** Configure to fail on close */
  failClose(): void {
    this._shouldFailClose = true;
  }

  /** Get all written data concatenated */
  getAllWrittenBytes(): Buffer {
    return Buffer.concat(this.writtenData);
  }

  /** Clear captured write data */
  clearWritten(): void {
    this.writtenData = [];
  }
}

/**
 * Creates a vi.mock factory for 'serialport' that returns MockSerialPort instances.
 * Usage: store `lastCreatedPort` to access the mock port in tests.
 */
export let lastCreatedPort: MockSerialPort | null = null;

export function createSerialPortMock(): any {
  return {
    SerialPort: class extends MockSerialPort {
      constructor(opts: any, callback?: any) {
        super(opts, callback);
        lastCreatedPort = this as any;
      }

      static list = async () => [];
    },
  };
}
