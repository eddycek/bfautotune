import { describe, it, expect } from 'vitest';
import { StreamReader } from './StreamReader';

describe('StreamReader', () => {
  describe('constructor and properties', () => {
    it('initializes with correct offset and end', () => {
      const buf = Buffer.from([1, 2, 3, 4, 5]);
      const reader = new StreamReader(buf);
      expect(reader.offset).toBe(0);
      expect(reader.end).toBe(5);
      expect(reader.bytesRemaining).toBe(5);
      expect(reader.eof).toBe(false);
    });

    it('supports custom offset and end', () => {
      const buf = Buffer.from([1, 2, 3, 4, 5]);
      const reader = new StreamReader(buf, 1, 4);
      expect(reader.offset).toBe(1);
      expect(reader.end).toBe(4);
      expect(reader.bytesRemaining).toBe(3);
    });
  });

  describe('readByte', () => {
    it('reads bytes sequentially', () => {
      const buf = Buffer.from([0xAA, 0xBB, 0xCC]);
      const reader = new StreamReader(buf);
      expect(reader.readByte()).toBe(0xAA);
      expect(reader.readByte()).toBe(0xBB);
      expect(reader.readByte()).toBe(0xCC);
      expect(reader.offset).toBe(3);
    });

    it('returns -1 at EOF', () => {
      const buf = Buffer.from([0x42]);
      const reader = new StreamReader(buf);
      reader.readByte();
      expect(reader.readByte()).toBe(-1);
      expect(reader.eof).toBe(true);
    });
  });

  describe('peek', () => {
    it('returns next byte without advancing', () => {
      const buf = Buffer.from([0x10, 0x20]);
      const reader = new StreamReader(buf);
      expect(reader.peek()).toBe(0x10);
      expect(reader.peek()).toBe(0x10);
      expect(reader.offset).toBe(0);
    });

    it('returns -1 at EOF', () => {
      const buf = Buffer.alloc(0);
      const reader = new StreamReader(buf);
      expect(reader.peek()).toBe(-1);
    });
  });

  describe('skip', () => {
    it('advances the cursor', () => {
      const buf = Buffer.from([1, 2, 3, 4, 5]);
      const reader = new StreamReader(buf);
      reader.skip(3);
      expect(reader.offset).toBe(3);
      expect(reader.readByte()).toBe(4);
    });
  });

  describe('setOffset', () => {
    it('sets the read position', () => {
      const buf = Buffer.from([0, 1, 2, 3]);
      const reader = new StreamReader(buf);
      reader.setOffset(2);
      expect(reader.readByte()).toBe(2);
    });
  });

  describe('readUnsignedVB', () => {
    it('reads single-byte value (no continuation)', () => {
      // 0x05 = 0b00000101 → value = 5
      const buf = Buffer.from([0x05]);
      const reader = new StreamReader(buf);
      expect(reader.readUnsignedVB()).toBe(5);
    });

    it('reads zero', () => {
      const buf = Buffer.from([0x00]);
      const reader = new StreamReader(buf);
      expect(reader.readUnsignedVB()).toBe(0);
    });

    it('reads two-byte value with continuation', () => {
      // 0x80 | 0x01 = 0x81 (continuation), then 0x01
      // value = (0x01) | (0x01 << 7) = 1 + 128 = 129
      const buf = Buffer.from([0x81, 0x01]);
      const reader = new StreamReader(buf);
      expect(reader.readUnsignedVB()).toBe(129);
    });

    it('reads 127 as single byte', () => {
      const buf = Buffer.from([0x7F]);
      const reader = new StreamReader(buf);
      expect(reader.readUnsignedVB()).toBe(127);
    });

    it('reads 128 as two bytes', () => {
      // 128 = 0x80 → encoded as [0x80 | 0x00, 0x01] = [0x80, 0x01]
      const buf = Buffer.from([0x80, 0x01]);
      const reader = new StreamReader(buf);
      expect(reader.readUnsignedVB()).toBe(128);
    });

    it('reads 300 correctly', () => {
      // 300 = 0x012C
      // low 7 bits: 0x2C = 44, continuation bit set → 0xAC
      // next 7 bits: 0x02, no continuation → 0x02
      const buf = Buffer.from([0xAC, 0x02]);
      const reader = new StreamReader(buf);
      expect(reader.readUnsignedVB()).toBe(300);
    });

    it('reads large value across 3 bytes', () => {
      // 16384 = 0x4000
      // Byte 0: (0x00 | 0x80) = 0x80 (continuation)
      // Byte 1: (0x00 | 0x80) = 0x80 (continuation)
      // Byte 2: 0x01
      const buf = Buffer.from([0x80, 0x80, 0x01]);
      const reader = new StreamReader(buf);
      expect(reader.readUnsignedVB()).toBe(16384);
    });

    it('handles EOF gracefully during multi-byte read', () => {
      // Continuation bit set but no more bytes
      const buf = Buffer.from([0x80]);
      const reader = new StreamReader(buf);
      // Should return partial value (0)
      expect(reader.readUnsignedVB()).toBe(0);
    });
  });

  describe('readSignedVB', () => {
    it('reads zero', () => {
      const buf = Buffer.from([0x00]);
      const reader = new StreamReader(buf);
      expect(reader.readSignedVB()).toBe(0);
    });

    it('reads positive values (zigzag: unsigned 2 → signed 1)', () => {
      // ZigZag: signed 1 → unsigned 2
      const buf = Buffer.from([0x02]);
      const reader = new StreamReader(buf);
      expect(reader.readSignedVB()).toBe(1);
    });

    it('reads negative values (zigzag: unsigned 1 → signed -1)', () => {
      // ZigZag: signed -1 → unsigned 1
      const buf = Buffer.from([0x01]);
      const reader = new StreamReader(buf);
      expect(reader.readSignedVB()).toBe(-1);
    });

    it('reads -2 (zigzag: unsigned 3 → signed -2)', () => {
      const buf = Buffer.from([0x03]);
      const reader = new StreamReader(buf);
      expect(reader.readSignedVB()).toBe(-2);
    });

    it('reads larger positive value', () => {
      // signed 50 → unsigned 100 → VB: [100]
      const buf = Buffer.from([0x64]);
      const reader = new StreamReader(buf);
      expect(reader.readSignedVB()).toBe(50);
    });

    it('reads larger negative value', () => {
      // signed -50 → unsigned 99 → VB: [99]
      const buf = Buffer.from([0x63]);
      const reader = new StreamReader(buf);
      expect(reader.readSignedVB()).toBe(-50);
    });
  });

  describe('readS16', () => {
    it('reads positive 16-bit value', () => {
      const buf = Buffer.alloc(2);
      buf.writeInt16LE(1000, 0);
      const reader = new StreamReader(buf);
      expect(reader.readS16()).toBe(1000);
    });

    it('reads negative 16-bit value', () => {
      const buf = Buffer.alloc(2);
      buf.writeInt16LE(-500, 0);
      const reader = new StreamReader(buf);
      expect(reader.readS16()).toBe(-500);
    });

    it('returns 0 if insufficient bytes', () => {
      const buf = Buffer.from([0x42]);
      const reader = new StreamReader(buf);
      expect(reader.readS16()).toBe(0);
    });
  });

  describe('readS32', () => {
    it('reads positive 32-bit value', () => {
      const buf = Buffer.alloc(4);
      buf.writeInt32LE(100000, 0);
      const reader = new StreamReader(buf);
      expect(reader.readS32()).toBe(100000);
    });

    it('reads negative 32-bit value', () => {
      const buf = Buffer.alloc(4);
      buf.writeInt32LE(-100000, 0);
      const reader = new StreamReader(buf);
      expect(reader.readS32()).toBe(-100000);
    });
  });

  describe('readLine', () => {
    it('reads a line terminated by newline', () => {
      const buf = Buffer.from('Hello World\nSecond line\n');
      const reader = new StreamReader(buf);
      expect(reader.readLine()).toBe('Hello World');
      expect(reader.readLine()).toBe('Second line');
    });

    it('strips trailing carriage return', () => {
      const buf = Buffer.from('Hello\r\nWorld\r\n');
      const reader = new StreamReader(buf);
      expect(reader.readLine()).toBe('Hello');
      expect(reader.readLine()).toBe('World');
    });

    it('returns remaining data without final newline', () => {
      const buf = Buffer.from('No newline');
      const reader = new StreamReader(buf);
      expect(reader.readLine()).toBe('No newline');
    });

    it('returns null at EOF', () => {
      const buf = Buffer.alloc(0);
      const reader = new StreamReader(buf);
      expect(reader.readLine()).toBeNull();
    });
  });

  describe('readBytes', () => {
    it('reads requested number of bytes', () => {
      const buf = Buffer.from([1, 2, 3, 4, 5]);
      const reader = new StreamReader(buf);
      const result = reader.readBytes(3);
      expect(result).toEqual(Buffer.from([1, 2, 3]));
      expect(reader.offset).toBe(3);
    });

    it('reads only available bytes if less than requested', () => {
      const buf = Buffer.from([1, 2]);
      const reader = new StreamReader(buf);
      const result = reader.readBytes(5);
      expect(result).toEqual(Buffer.from([1, 2]));
    });
  });

  describe('slice', () => {
    it('creates a sub-reader for the specified range', () => {
      const buf = Buffer.from([10, 20, 30, 40, 50]);
      const reader = new StreamReader(buf);
      const sub = reader.slice(1, 4);
      expect(sub.offset).toBe(1);
      expect(sub.end).toBe(4);
      expect(sub.readByte()).toBe(20);
      expect(sub.readByte()).toBe(30);
      expect(sub.readByte()).toBe(40);
      expect(sub.readByte()).toBe(-1);
    });

    it('clamps end to parent end', () => {
      const buf = Buffer.from([1, 2, 3]);
      const reader = new StreamReader(buf, 0, 3);
      const sub = reader.slice(0, 100);
      expect(sub.end).toBe(3);
    });
  });
});
