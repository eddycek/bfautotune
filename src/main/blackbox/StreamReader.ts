import { MAX_VB_BYTES } from './constants';

/**
 * Binary stream reader with cursor management for BBL file parsing.
 * Reads from a Buffer with an advancing offset pointer.
 * Provides methods for reading variable-byte encoded integers,
 * raw bytes, and ASCII lines (for header parsing).
 */
export class StreamReader {
  private buffer: Buffer;
  private _offset: number;
  private _end: number;

  constructor(buffer: Buffer, offset = 0, end?: number) {
    this.buffer = buffer;
    this._offset = offset;
    this._end = end ?? buffer.length;
  }

  /** Current read position */
  get offset(): number {
    return this._offset;
  }

  /** End boundary of the readable region */
  get end(): number {
    return this._end;
  }

  /** Number of bytes remaining to read */
  get bytesRemaining(): number {
    return this._end - this._offset;
  }

  /** Whether the reader has reached the end */
  get eof(): boolean {
    return this._offset >= this._end;
  }

  /** Set the read position */
  setOffset(offset: number): void {
    this._offset = offset;
  }

  /**
   * Read a single byte and advance the cursor.
   * Returns -1 if at EOF.
   */
  readByte(): number {
    if (this._offset >= this._end) return -1;
    return this.buffer[this._offset++];
  }

  /**
   * Peek at the next byte without advancing the cursor.
   * Returns -1 if at EOF.
   */
  peek(): number {
    if (this._offset >= this._end) return -1;
    return this.buffer[this._offset];
  }

  /**
   * Skip n bytes forward.
   */
  skip(n: number): void {
    this._offset += n;
  }

  /**
   * Read an unsigned variable-byte encoded integer.
   * Each byte uses the MSB as a continuation flag.
   * Betaflight encoding: 7 bits of data per byte, LSB first.
   */
  readUnsignedVB(): number {
    let result = 0;
    let shift = 0;

    for (let i = 0; i < MAX_VB_BYTES; i++) {
      if (this._offset >= this._end) return result;
      const b = this.buffer[this._offset++];
      result |= (b & 0x7F) << shift;
      if ((b & 0x80) === 0) return result;
      shift += 7;
    }

    return result;
  }

  /**
   * Read a signed variable-byte encoded integer.
   * Uses ZigZag encoding: (n << 1) ^ (n >> 31)
   * So the unsigned value maps: 0→0, 1→-1, 2→1, 3→-2, 4→2, ...
   */
  readSignedVB(): number {
    const unsigned = this.readUnsignedVB();
    // ZigZag decode
    return (unsigned >>> 1) ^ -(unsigned & 1);
  }

  /**
   * Read a 16-bit signed integer (little-endian).
   */
  readS16(): number {
    if (this._offset + 2 > this._end) return 0;
    const value = this.buffer.readInt16LE(this._offset);
    this._offset += 2;
    return value;
  }

  /**
   * Read a 32-bit signed integer (little-endian).
   */
  readS32(): number {
    if (this._offset + 4 > this._end) return 0;
    const value = this.buffer.readInt32LE(this._offset);
    this._offset += 4;
    return value;
  }

  /**
   * Read a line of ASCII text (terminated by \n).
   * Returns the line content without the newline.
   * Returns null if at EOF before finding any content.
   */
  readLine(): string | null {
    if (this._offset >= this._end) return null;

    const start = this._offset;
    while (this._offset < this._end) {
      if (this.buffer[this._offset] === 0x0A) { // '\n'
        const line = this.buffer.toString('ascii', start, this._offset);
        this._offset++; // skip the newline
        return line.replace(/\r$/, ''); // strip trailing \r
      }
      this._offset++;
    }

    // Reached end without newline - return remaining data as a line
    if (this._offset > start) {
      return this.buffer.toString('ascii', start, this._offset);
    }
    return null;
  }

  /**
   * Read a header line, stripping flash corruption blocks.
   *
   * Betaflight dataflash writes page markers (~7 bytes with 0x00 and 0xB4)
   * into the data stream. These appear mid-line in header text and must be
   * removed to recover the original ASCII content.
   *
   * Pattern: any run of bytes where most are < 0x20 (except tab) or = 0xB4,
   * surrounded by printable ASCII on both sides.
   */
  readHeaderLine(): string | null {
    if (this._offset >= this._end) return null;

    const chars: number[] = [];
    const start = this._offset;

    while (this._offset < this._end) {
      const b = this.buffer[this._offset];

      if (b === 0x0A) { // newline
        this._offset++;
        break;
      }

      this._offset++;

      // Skip non-printable bytes (flash corruption), keep printable ASCII
      // Printable range: 0x20-0x7E, plus tab (0x09)
      if ((b >= 0x20 && b <= 0x7E) || b === 0x09) {
        chars.push(b);
      }
      // else: silently drop the byte (corruption)
    }

    if (chars.length === 0 && this._offset === start) return null;

    return String.fromCharCode(...chars).replace(/\r$/, '');
  }

  /**
   * Read n raw bytes into a new Buffer.
   */
  readBytes(n: number): Buffer {
    const available = Math.min(n, this._end - this._offset);
    const result = this.buffer.subarray(this._offset, this._offset + available);
    this._offset += available;
    return result;
  }

  /**
   * Create a sub-reader for a slice of the buffer.
   * Useful for parsing a specific region (e.g., a single log session).
   */
  slice(start: number, end: number): StreamReader {
    return new StreamReader(this.buffer, start, Math.min(end, this._end));
  }
}
