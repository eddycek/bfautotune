import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { createWindow, getMainWindow } from './window';
import { MSPClient } from './msp/MSPClient';
import { SnapshotManager } from './storage/SnapshotManager';
import { ProfileManager } from './storage/ProfileManager';
import { BlackboxManager } from './storage/BlackboxManager';
import { TuningSessionManager } from './storage/TuningSessionManager';
import { TuningHistoryManager } from './storage/TuningHistoryManager';
import {
  registerIPCHandlers,
  setMSPClient,
  setSnapshotManager,
  setProfileManager,
  setBlackboxManager,
  setTuningSessionManager,
  setTuningHistoryManager,
  sendConnectionChanged,
  sendProfileChanged,
  sendNewFCDetected,
  sendTuningSessionChanged,
  consumePendingSettingsSnapshot,
} from './ipc/handlers';
import { logger } from './utils/logger';
import { SNAPSHOT, PROFILE } from '@shared/constants';
import { MockMSPClient } from './demo/MockMSPClient';
import { generateFilterDemoBBL } from './demo/DemoDataGenerator';

/** Whether the app is running in demo mode (--demo flag) */
const isDemoMode = process.argv.includes('--demo');

let mspClient: MSPClient | MockMSPClient;
let snapshotManager: SnapshotManager;
let profileManager: ProfileManager;
let blackboxManager: BlackboxManager;
let tuningSessionManager: TuningSessionManager;
let tuningHistoryManager: TuningHistoryManager;

async function initialize(): Promise<void> {
  // Create MSP client (real or mock depending on demo mode)
  if (isDemoMode) {
    logger.info('=== DEMO MODE ACTIVE ===');
    const mockClient = new MockMSPClient();
    // Pre-generate demo BBL data
    const demoBBL = generateFilterDemoBBL();
    mockClient.setDemoBBLData(demoBBL);
    mockClient.setFlashHasData(true);
    mspClient = mockClient;
  } else {
    mspClient = new MSPClient();
  }

  // Create profile manager
  const profileStoragePath = join(app.getPath('userData'), PROFILE.STORAGE_DIR);
  profileManager = new ProfileManager(profileStoragePath);
  await profileManager.initialize();

  // Create snapshot manager
  const snapshotStoragePath = join(app.getPath('userData'), SNAPSHOT.STORAGE_DIR);
  // Cast needed: in demo mode, MockMSPClient implements the same interface
  // that SnapshotManager uses (getFCInfo, exportCLIDiff, isConnected)
  snapshotManager = new SnapshotManager(snapshotStoragePath, mspClient as any);
  await snapshotManager.initialize();

  // Link profile manager to snapshot manager
  snapshotManager.setProfileManager(profileManager);

  // Create Blackbox manager
  try {
    logger.info('Initializing BlackboxManager...');
    blackboxManager = new BlackboxManager();
    await blackboxManager.initialize();
    logger.info('BlackboxManager initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize BlackboxManager:', error);
    throw error;
  }

  // Create Tuning Session manager
  const tuningStoragePath = join(app.getPath('userData'), 'data/tuning');
  tuningSessionManager = new TuningSessionManager(tuningStoragePath);
  await tuningSessionManager.initialize();

  // Create Tuning History manager
  const dataPath = join(app.getPath('userData'), 'data');
  tuningHistoryManager = new TuningHistoryManager(dataPath);
  await tuningHistoryManager.initialize();

  // Set up IPC handlers
  setMSPClient(mspClient);
  setSnapshotManager(snapshotManager);
  setProfileManager(profileManager);
  setBlackboxManager(blackboxManager);
  setTuningSessionManager(tuningSessionManager);
  setTuningHistoryManager(tuningHistoryManager);
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

        // Create baseline ONLY for existing profiles
        // For new FCs, baseline will be created after profile is created
        logger.info('Creating baseline for existing profile...');
        await snapshotManager.createBaselineIfMissing();

        // After a settings fix/reset, the FC reboots and reconnects.
        // Create a clean snapshot now (MSP + CLI available, no mode conflicts).
        if (consumePendingSettingsSnapshot()) {
          try {
            logger.info('Creating post-settings-change snapshot...');
            await snapshotManager.createSnapshot('Post-settings-change (auto)', 'auto');
            logger.info('Post-settings-change snapshot created');
          } catch (err) {
            logger.warn('Failed to create post-settings-change snapshot (non-fatal):', err);
          }
        }

        // Clear MSC mode flag if it was set (FC reconnected after MSC cycle)
        if (mspClient.mscModeActive) {
          logger.info('FC reconnected after MSC mode — clearing MSC flag');
          mspClient.clearMSCMode();
        }

        // Clear reboot pending flag if it was set (FC reconnected after save reboot)
        if (mspClient.rebootPending) {
          logger.info('FC reconnected after save reboot — clearing rebootPending flag');
          mspClient.clearRebootPending();
        }

        // Smart reconnect: check tuning session state
        try {
          const session = await tuningSessionManager.getSession(existingProfile.id);
          if (session) {
            // Auto-transition from *_flight_pending → *_log_ready if flash has data
            if (
              session.phase === 'filter_flight_pending' ||
              session.phase === 'pid_flight_pending'
            ) {
              const bbInfo = await mspClient.getBlackboxInfo();

              // For flash: usedSize > 0 means logs exist
              // For SD card: usedSize is always > 0 (filesystem overhead),
              // so we skip auto-transition for SD card — user confirms via UI
              if (bbInfo.storageType === 'flash' && bbInfo.hasLogs && bbInfo.usedSize > 0) {
                const nextPhase =
                  session.phase === 'filter_flight_pending' ? 'filter_log_ready' : 'pid_log_ready';
                logger.info(
                  `Smart reconnect: flash has data, transitioning ${session.phase} → ${nextPhase}`
                );
                const updated = await tuningSessionManager.updatePhase(
                  existingProfile.id,
                  nextPhase
                );
                sendTuningSessionChanged(updated);
              } else if (bbInfo.storageType === 'sdcard' && session.eraseSkipped) {
                // User skipped erase — treat reconnect as "flew and came back"
                const nextPhase =
                  session.phase === 'filter_flight_pending' ? 'filter_log_ready' : 'pid_log_ready';
                logger.info(
                  `Smart reconnect: SD card + eraseSkipped, transitioning ${session.phase} → ${nextPhase}`
                );
                const updated = await tuningSessionManager.updatePhase(
                  existingProfile.id,
                  nextPhase,
                  { eraseSkipped: undefined }
                );
                sendTuningSessionChanged(updated);
              } else if (bbInfo.storageType === 'sdcard') {
                logger.info(
                  'Smart reconnect: SD card detected — skipping auto-transition (user must confirm)'
                );
              }
            }

            // Create post-apply snapshot on first reconnect after tuning apply
            if (session.phase === 'filter_applied' || session.phase === 'pid_applied') {
              const snapshotField =
                session.phase === 'filter_applied'
                  ? 'postFilterSnapshotId'
                  : 'postTuningSnapshotId';

              // Dedup: skip if snapshot already created on a previous reconnect
              const alreadyExists =
                snapshotField === 'postFilterSnapshotId'
                  ? session.postFilterSnapshotId
                  : session.postTuningSnapshotId;

              if (alreadyExists) {
                logger.info(`Post-apply snapshot already exists (${snapshotField}), skipping`);
              } else {
                const label =
                  session.phase === 'filter_applied' ? 'Post-filter (auto)' : 'Post-tuning (auto)';
                logger.info(`Creating post-apply snapshot: ${label}`);
                const snapshot = await snapshotManager.createSnapshot(label, 'auto');

                // Save snapshot ID to tuning session for history tracking
                const updated = await tuningSessionManager.updatePhase(
                  existingProfile.id,
                  session.phase, // same phase — just adding data
                  { [snapshotField]: snapshot.id }
                );
                sendTuningSessionChanged(updated);

                // Snapshot creation left FC in CLI mode (via exportCLIDiff).
                // close() will send 'exit' (rebooting FC out of CLI).
                // Set rebootPending so disconnect handler keeps the profile.
                logger.info('Disconnecting to reboot FC out of CLI after post-apply snapshot');
                mspClient.setRebootPending();
                await mspClient.disconnect();
                // FC will reconnect; dedup guard prevents infinite loop.
                return;
              }
            }
          }
        } catch (err) {
          logger.warn('Smart reconnect check failed (non-fatal):', err);
        }
      } else {
        // New drone - notify UI to show ProfileWizard modal
        // DO NOT create baseline yet - wait until profile is created
        logger.info('New FC detected - profile creation needed (baseline will be created later)');
        if (window) {
          logger.info(`Sending new FC detected event: ${fcSerial}`);
          sendNewFCDetected(window, fcSerial, fcInfo);
        } else {
          logger.error('Window is null, cannot send new FC detected event');
        }
      }
    } catch (error) {
      logger.error('Failed to handle connection:', error);
    }
  });

  // Handle unexpected disconnection (USB unplugged, etc.)
  mspClient.on('disconnected', () => {
    const window = getMainWindow();

    // If FC is in MSC mode or rebooting after save, this disconnect is expected — don't clear profile
    if (mspClient.mscModeActive || mspClient.rebootPending) {
      logger.info(
        `FC disconnected (${mspClient.mscModeActive ? 'MSC mode' : 'reboot pending'} — expected, keeping profile)`
      );
      // Still notify renderer that FC is disconnected (UI needs to reflect this)
      if (window) {
        sendConnectionChanged(window, { connected: false });
      }
      return;
    }

    logger.info('FC unexpectedly disconnected');

    // Clear current profile
    profileManager.clearCurrentProfile();

    // Notify renderer
    if (window) {
      // Send disconnected status
      sendConnectionChanged(window, { connected: false });
      // Clear profile in UI
      sendProfileChanged(window, null);
    }
  });

  logger.info('Application initialized');
}

app.whenReady().then(async () => {
  await initialize();
  createWindow();

  // In demo mode, auto-connect after window is ready
  if (isDemoMode && mspClient instanceof MockMSPClient) {
    setTimeout(() => {
      logger.info('[DEMO] Auto-connecting demo FC...');
      (mspClient as MockMSPClient).simulateConnect();
    }, 1500);
  }

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
