import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { createWindow, getMainWindow } from './window';
import { MSPClient } from './msp/MSPClient';
import { SnapshotManager } from './storage/SnapshotManager';
import { registerIPCHandlers, setMSPClient, setSnapshotManager, sendConnectionChanged } from './ipc/handlers';
import { logger } from './utils/logger';
import { SNAPSHOT } from '@shared/constants';

let mspClient: MSPClient;
let snapshotManager: SnapshotManager;

async function initialize(): Promise<void> {
  // Create MSP client
  mspClient = new MSPClient();

  // Create snapshot manager
  const storagePath = join(app.getPath('userData'), SNAPSHOT.STORAGE_DIR);
  snapshotManager = new SnapshotManager(storagePath, mspClient);
  await snapshotManager.initialize();

  // Set up IPC handlers
  setMSPClient(mspClient);
  setSnapshotManager(snapshotManager);
  registerIPCHandlers();

  // Listen for connection changes
  mspClient.on('connection-changed', (status) => {
    const window = getMainWindow();
    if (window) {
      sendConnectionChanged(window, status);
    }
  });

  // Auto-create baseline on first connection
  mspClient.on('connected', async () => {
    try {
      await snapshotManager.createBaselineIfMissing();
    } catch (error) {
      logger.error('Failed to create baseline:', error);
    }
  });

  logger.info('Application initialized');
}

app.whenReady().then(async () => {
  await initialize();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  // Cleanup
  if (mspClient?.isConnected()) {
    await mspClient.disconnect();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (mspClient?.isConnected()) {
    await mspClient.disconnect();
  }
});
