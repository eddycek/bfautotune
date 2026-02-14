import { IPCResponse } from '@shared/types/ipc.types';
import type { MSCManager } from '../../msc/MSCManager';

/**
 * Shared dependencies injected into handler modules.
 * Each module receives the full deps object and accesses only what it needs.
 */
export interface HandlerDependencies {
  mspClient: any;
  snapshotManager: any;
  profileManager: any;
  blackboxManager: any;
  tuningSessionManager: any;
  tuningHistoryManager: any;
  mscManager: MSCManager | null;
  /** Guard against concurrent blackbox downloads */
  isDownloadingBlackbox: boolean;
  /** Set after fix/reset — triggers clean snapshot on reconnect */
  pendingSettingsSnapshot: boolean;
}

export function createResponse<T>(data: T | undefined, error?: string): IPCResponse<T> {
  return {
    success: !error,
    data: data as T,
    error,
  } as IPCResponse<T>;
}

/**
 * Parse a `set key = value` line from CLI diff output.
 * Returns the value string, or undefined if the key is not found.
 */
export function parseDiffSetting(cliDiff: string, key: string): string | undefined {
  for (const line of cliDiff.split('\n')) {
    const match = line.match(new RegExp(`^set\\s+${key}\\s*=\\s*(.+)`, 'i'));
    if (match) return match[1].trim();
  }
  return undefined;
}
