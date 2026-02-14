import { ipcMain } from 'electron';
import { IPCChannel, IPCResponse } from '@shared/types/ipc.types';
import type { PortInfo, ConnectionStatus } from '@shared/types/common.types';
import type { HandlerDependencies } from './types';
import { createResponse } from './types';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/errors';

/**
 * Registers all connection-related IPC handlers.
 * Handles port listing, connect/disconnect operations, and connection status.
 */
export function registerConnectionHandlers(deps: HandlerDependencies): void {
  ipcMain.handle(IPCChannel.CONNECTION_LIST_PORTS, async (): Promise<IPCResponse<PortInfo[]>> => {
    try {
      if (!deps.mspClient) {
        throw new Error('MSP client not initialized');
      }
      const ports = await deps.mspClient.listPorts();
      return createResponse<PortInfo[]>(ports);
    } catch (error) {
      logger.error('Failed to list ports:', error);
      return createResponse<PortInfo[]>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(
    IPCChannel.CONNECTION_CONNECT,
    async (_, portPath: string): Promise<IPCResponse<void>> => {
      try {
        if (!deps.mspClient) {
          throw new Error('MSP client not initialized');
        }
        await deps.mspClient.connect(portPath);
        return createResponse<void>(undefined);
      } catch (error) {
        logger.error('Failed to connect:', error);
        return createResponse<void>(undefined, getErrorMessage(error));
      }
    }
  );

  ipcMain.handle(IPCChannel.CONNECTION_DISCONNECT, async (): Promise<IPCResponse<void>> => {
    try {
      if (!deps.mspClient) {
        throw new Error('MSP client not initialized');
      }
      await deps.mspClient.disconnect();
      return createResponse<void>(undefined);
    } catch (error) {
      logger.error('Failed to disconnect:', error);
      return createResponse<void>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(
    IPCChannel.CONNECTION_GET_STATUS,
    async (): Promise<IPCResponse<ConnectionStatus>> => {
      try {
        if (!deps.mspClient) {
          throw new Error('MSP client not initialized');
        }
        const status = deps.mspClient.getConnectionStatus();
        return createResponse<ConnectionStatus>(status);
      } catch (error) {
        logger.error('Failed to get connection status:', error);
        return createResponse<ConnectionStatus>(undefined, getErrorMessage(error));
      }
    }
  );
}
