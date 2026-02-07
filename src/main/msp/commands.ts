import { MSPCommand } from './types';

export { MSPCommand };

export const CLI_COMMANDS = {
  ENTER: '#',
  EXIT: 'exit',
  DIFF: 'diff all',
  DUMP: 'dump',
  SAVE: 'save'
} as const;

export function isValidMSPCommand(command: number): boolean {
  return Object.values(MSPCommand).includes(command);
}
