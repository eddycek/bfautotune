import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { createWindow, getMainWindow } from './window';
import { MSPClient } from './msp/MSPClient';
import { SnapshotManager } from './storage/SnapshotManager';
import { ProfileManager } from './storage/ProfileManager';
import { registerIPCHandlers, setMSPClient, setSnapshotManager, setProfileManager, sendConnectionChanged, sendProfileChanged, sendNewFCDetected } from './ipc/handlers';
import { logger } from './utils/logger';
import { SNAPSHOT, PROFILE } from '@shared/constants';

let mspClient: MSPClient;
let snapshotManager: SnapshotManager;
let profileManager: ProfileManager;

async function initialize(): Promise<void> {
  // Create MSP client
  mspClient = new MSPClient();

  // Create profile manager
  const profileStoragePath = join(app.getPath('userData'), PROFILE.STORAGE_DIR);
  profileManager = new ProfileManager(profileStoragePath);
  await profileManager.initialize();

  // Create snapshot manager
  const snapshotStoragePath = join(app.getPath('userData'), SNAPSHOT.STORAGE_DIR);
  snapshotManager = new SnapshotManager(snapshotStoragePath, mspClient);
  await snapshotManager.initialize();

  // Link profile manager to snapshot manager
  snapshotManager.setProfileManager(profileManager);

  // Set up IPC handlers
  setMSPClient(mspClient);
  setSnapshotManager(snapshotManager);
  setProfileManager(profileManager);
  registerIPCHandlers();

  // Listen for connection changes
  mspClient.on('connection-changed', (status) => {
    const window = getMainWindow();
    if (window) {
      sendConnectionChanged(window, status);
    }
  });

  // Auto-detect profile and create baseline on connection
  mspClient.on('connected', async () => {
    try {
      // Get FC serial number
      const fcSerial = await mspClient.getFCSerialNumber();
      const fcInfo = await mspClient.getFCInfo();
      logger.info(`Connected to FC with serial: ${fcSerial}`);

      // Find or prompt for profile
      const existingProfile = await profileManager.findProfileBySerial(fcSerial);

      const window = getMainWindow();
      if (existingProfile) {
        // Known drone - set as current profile
        const profile = await profileManager.setCurrentProfile(existingProfile.id);
        logger.info(`Profile loaded: ${existingProfile.name}`);

        // Notify UI of profile change
        if (window) {
          sendProfileChanged(window, profile);
        }
      } else {
        // New drone - notify UI to show ProfileWizard modal
        logger.info('New FC detected - profile creation needed');
        if (window) {
          sendNewFCDetected(window, fcSerial, fcInfo);
        }
      }

      // Create baseline if missing (for current profile)
      await snapshotManager.createBaselineIfMissing();
    } catch (error) {
      logger.error('Failed to handle connection:', error);
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
