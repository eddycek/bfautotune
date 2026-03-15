import { ipcMain } from 'electron';
import { IPCChannel, IPCResponse } from '@shared/types/ipc.types';
import { createResponse } from './types';
import { checkForUpdates, quitAndInstall } from '../../updater';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/errors';

export function registerUpdateHandlers(): void {
  ipcMain.handle(IPCChannel.UPDATE_CHECK, async (): Promise<IPCResponse<void>> => {
    try {
      await checkForUpdates();
      return createResponse(undefined);
    } catch (err) {
      logger.error('Failed to check for updates:', err);
      return createResponse<void>(undefined, getErrorMessage(err));
    }
  });

  ipcMain.handle(IPCChannel.UPDATE_INSTALL, async (): Promise<IPCResponse<void>> => {
    try {
      quitAndInstall();
      return createResponse(undefined);
    } catch (err) {
      logger.error('Failed to install update:', err);
      return createResponse<void>(undefined, getErrorMessage(err));
    }
  });
}
