export enum MSPCommand {
  MSP_API_VERSION = 1,
  MSP_FC_VARIANT = 2,
  MSP_FC_VERSION = 3,
  MSP_BOARD_INFO = 4,
  MSP_BUILD_INFO = 5,
  MSP_NAME = 10,
  MSP_SET_NAME = 11,
  MSP_REBOOT = 68,
  MSP_STATUS = 101,
  MSP_PID = 112,
  MSP_STATUS_EX = 150,
  MSP_UID = 160,
  MSP_SET_PID = 202,
  MSP_EEPROM_WRITE = 250
}

export interface MSPMessage {
  command: number;
  data: Buffer;
}

export interface MSPResponse {
  command: number;
  data: Buffer;
  error?: boolean;
}

export const MSP_PROTOCOL = {
  PREAMBLE1: 0x24, // '$'
  PREAMBLE2: 0x4d, // 'M'
  DIRECTION_TO_FC: 0x3c, // '<'
  DIRECTION_FROM_FC: 0x3e, // '>'
  ERROR: 0x21, // '!'
  MAX_PAYLOAD_SIZE: 256
} as const;
