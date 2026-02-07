import { MSPMessage, MSPResponse, MSP_PROTOCOL } from './types';
import { MSPError } from '../utils/errors';

export class MSPProtocol {
  /**
   * Encode MSP message to send to FC
   */
  encode(command: number, data: Buffer = Buffer.alloc(0)): Buffer {
    if (data.length > MSP_PROTOCOL.MAX_PAYLOAD_SIZE) {
      throw new MSPError(`Payload too large: ${data.length} > ${MSP_PROTOCOL.MAX_PAYLOAD_SIZE}`);
    }

    const size = data.length;
    const buffer = Buffer.alloc(6 + size);

    buffer[0] = MSP_PROTOCOL.PREAMBLE1; // '$'
    buffer[1] = MSP_PROTOCOL.PREAMBLE2; // 'M'
    buffer[2] = MSP_PROTOCOL.DIRECTION_TO_FC; // '<'
    buffer[3] = size; // payload size
    buffer[4] = command; // command ID

    // Copy payload
    if (size > 0) {
      data.copy(buffer, 5);
    }

    // Calculate checksum (XOR of size, command, and all data bytes)
    let checksum = size ^ command;
    for (let i = 0; i < size; i++) {
      checksum ^= data[i];
    }
    buffer[5 + size] = checksum;

    return buffer;
  }

  /**
   * Decode MSP response from FC
   */
  decode(buffer: Buffer): MSPResponse | null {
    if (buffer.length < 6) {
      return null; // Incomplete message
    }

    // Check preamble
    if (buffer[0] !== MSP_PROTOCOL.PREAMBLE1 || buffer[1] !== MSP_PROTOCOL.PREAMBLE2) {
      throw new MSPError('Invalid MSP preamble');
    }

    const direction = buffer[2];
    const isError = direction === MSP_PROTOCOL.ERROR;

    if (direction !== MSP_PROTOCOL.DIRECTION_FROM_FC && !isError) {
      throw new MSPError(`Invalid MSP direction: 0x${direction.toString(16)}`);
    }

    const size = buffer[3];
    const command = buffer[4];

    // Check if we have complete message
    if (buffer.length < 6 + size) {
      return null; // Incomplete message
    }

    // Extract data
    const data = buffer.slice(5, 5 + size);

    // Verify checksum
    const receivedChecksum = buffer[5 + size];
    let calculatedChecksum = size ^ command;
    for (let i = 0; i < size; i++) {
      calculatedChecksum ^= data[i];
    }

    if (receivedChecksum !== calculatedChecksum) {
      throw new MSPError(
        `Checksum mismatch: received 0x${receivedChecksum.toString(16)}, calculated 0x${calculatedChecksum.toString(16)}`
      );
    }

    return {
      command,
      data,
      error: isError
    };
  }

  /**
   * Parse multiple messages from buffer
   */
  parseBuffer(buffer: Buffer): { messages: MSPResponse[]; remaining: Buffer } {
    const messages: MSPResponse[] = [];
    let offset = 0;

    while (offset < buffer.length) {
      // Find preamble
      let preambleIndex = -1;
      for (let i = offset; i < buffer.length - 1; i++) {
        if (buffer[i] === MSP_PROTOCOL.PREAMBLE1 && buffer[i + 1] === MSP_PROTOCOL.PREAMBLE2) {
          preambleIndex = i;
          break;
        }
      }

      if (preambleIndex === -1) {
        // No more messages
        break;
      }

      offset = preambleIndex;

      // Try to decode message
      try {
        const message = this.decode(buffer.slice(offset));
        if (message) {
          messages.push(message);
          const size = buffer[offset + 3];
          offset += 6 + size; // Move past this message
        } else {
          // Incomplete message, save remaining
          break;
        }
      } catch (error) {
        // Invalid message, skip preamble and continue
        offset += 2;
      }
    }

    return {
      messages,
      remaining: buffer.slice(offset)
    };
  }
}
