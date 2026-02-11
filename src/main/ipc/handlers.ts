import { ipcMain, BrowserWindow, app, shell } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IPCChannel, IPCResponse } from '@shared/types/ipc.types';
import type { ApplyRecommendationsInput, ApplyRecommendationsResult, ApplyRecommendationsProgress, SnapshotRestoreResult, SnapshotRestoreProgress, FixBlackboxSettingsInput, FixBlackboxSettingsResult } from '@shared/types/ipc.types';
import type {
  PortInfo,
  FCInfo,
  ConfigurationSnapshot,
  SnapshotMetadata,
  ConnectionStatus
} from '@shared/types/common.types';
import type {
  DroneProfile,
  DroneProfileMetadata,
  ProfileCreationInput,
  ProfileUpdateInput
} from '@shared/types/profile.types';
import type { PIDConfiguration, PIDTerm, FeedforwardConfiguration } from '@shared/types/pid.types';
import type { BlackboxInfo, BlackboxLogMetadata, BlackboxParseResult, BlackboxSettings } from '@shared/types/blackbox.types';
import type { FilterAnalysisResult, PIDAnalysisResult, CurrentFilterSettings } from '@shared/types/analysis.types';
import type { TuningSession, TuningPhase } from '@shared/types/tuning.types';
import type { CompletedTuningRecord } from '@shared/types/tuning-history.types';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errors';
import { PRESET_PROFILES } from '@shared/constants';
import { getMainWindow } from '../window';
import { BlackboxParser } from '../blackbox/BlackboxParser';
import { analyze as analyzeFilters } from '../analysis/FilterAnalyzer';
import { analyzePID } from '../analysis/PIDAnalyzer';
import { extractFlightPIDs } from '../analysis/PIDRecommender';
import { validateBBLHeader, enrichSettingsFromBBLHeaders } from '../analysis/headerValidation';

let mspClient: any = null; // Will be set from main
let snapshotManager: any = null; // Will be set from main
let profileManager: any = null; // Will be set from main
let blackboxManager: any = null; // Will be set from main
let tuningSessionManager: any = null; // Will be set from main
let tuningHistoryManager: any = null; // Will be set from main
let isDownloadingBlackbox = false; // Guard against concurrent downloads
let pendingSettingsSnapshot = false; // Set after fix/reset — triggers clean snapshot on reconnect

export function setMSPClient(client: any): void {
  mspClient = client;
}

export function setSnapshotManager(manager: any): void {
  snapshotManager = manager;
}

export function setProfileManager(manager: any): void {
  profileManager = manager;
}

export function setBlackboxManager(manager: any): void {
  blackboxManager = manager;
}

export function setTuningSessionManager(manager: any): void {
  tuningSessionManager = manager;
}

export function setTuningHistoryManager(manager: any): void {
  tuningHistoryManager = manager;
}

/** Returns true if a settings fix/reset was applied and a clean snapshot is needed on reconnect. */
export function consumePendingSettingsSnapshot(): boolean {
  if (pendingSettingsSnapshot) {
    pendingSettingsSnapshot = false;
    return true;
  }
  return false;
}

function createResponse<T>(data: T | undefined, error?: string): IPCResponse<T> {
  return {
    success: !error,
    data: data as T,
    error
  } as IPCResponse<T>;
}

/**
 * Parse a `set key = value` line from CLI diff output.
 * Returns the value string, or undefined if the key is not found.
 */
function parseDiffSetting(cliDiff: string, key: string): string | undefined {
  for (const line of cliDiff.split('\n')) {
    const match = line.match(new RegExp(`^set\\s+${key}\\s*=\\s*(.+)`, 'i'));
    if (match) return match[1].trim();
  }
  return undefined;
}

export function registerIPCHandlers(): void {
  // Connection handlers
  ipcMain.handle(IPCChannel.CONNECTION_LIST_PORTS, async (): Promise<IPCResponse<PortInfo[]>> => {
    try {
      if (!mspClient) {
        throw new Error('MSP client not initialized');
      }
      const ports = await mspClient.listPorts();
      return createResponse<PortInfo[]>(ports);
    } catch (error) {
      logger.error('Failed to list ports:', error);
      return createResponse<PortInfo[]>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.CONNECTION_CONNECT, async (_, portPath: string): Promise<IPCResponse<void>> => {
    try {
      if (!mspClient) {
        throw new Error('MSP client not initialized');
      }
      await mspClient.connect(portPath);
      return createResponse<void>(undefined);
    } catch (error) {
      logger.error('Failed to connect:', error);
      return createResponse<void>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.CONNECTION_DISCONNECT, async (): Promise<IPCResponse<void>> => {
    try {
      if (!mspClient) {
        throw new Error('MSP client not initialized');
      }
      await mspClient.disconnect();
      return createResponse<void>(undefined);
    } catch (error) {
      logger.error('Failed to disconnect:', error);
      return createResponse<void>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.CONNECTION_GET_STATUS, async (): Promise<IPCResponse<ConnectionStatus>> => {
    try {
      if (!mspClient) {
        throw new Error('MSP client not initialized');
      }
      const status = mspClient.getConnectionStatus();
      return createResponse<ConnectionStatus>(status);
    } catch (error) {
      logger.error('Failed to get connection status:', error);
      return createResponse<ConnectionStatus>(undefined, getErrorMessage(error));
    }
  });

  // FC Info handlers
  ipcMain.handle(IPCChannel.FC_GET_INFO, async (): Promise<IPCResponse<FCInfo>> => {
    try {
      if (!mspClient) {
        throw new Error('MSP client not initialized');
      }
      const info = await mspClient.getFCInfo();
      return createResponse<FCInfo>(info);
    } catch (error) {
      logger.error('Failed to get FC info:', error);
      return createResponse<FCInfo>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.FC_EXPORT_CLI, async (_, format: 'diff' | 'dump'): Promise<IPCResponse<string>> => {
    try {
      if (!mspClient) {
        throw new Error('MSP client not initialized');
      }
      const cli = format === 'diff'
        ? await mspClient.exportCLIDiff()
        : await mspClient.exportCLIDump();
      return createResponse<string>(cli);
    } catch (error) {
      logger.error('Failed to export CLI:', error);
      return createResponse<string>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.FC_GET_BLACKBOX_SETTINGS, async (): Promise<IPCResponse<BlackboxSettings>> => {
    try {
      if (!profileManager || !snapshotManager) {
        throw new Error('Profile/Snapshot manager not initialized');
      }
      // Parse blackbox settings from the baseline snapshot's CLI diff.
      // This avoids entering CLI mode (BF CLI 'exit' reboots the FC).
      const currentProfile = await profileManager.getCurrentProfile();
      if (!currentProfile) {
        throw new Error('No active profile');
      }

      // Use the most recent snapshot (last in array) for the freshest settings.
      // Falls back to baseline if no other snapshots exist.
      let cliDiff = '';
      const ids = currentProfile.snapshotIds;
      for (let i = ids.length - 1; i >= 0; i--) {
        try {
          const snap = await snapshotManager.loadSnapshot(ids[i]);
          if (snap?.configuration?.cliDiff) {
            cliDiff = snap.configuration.cliDiff;
            break;
          }
        } catch {}
      }

      // Parse settings from CLI diff output.
      // If a setting is not in the diff, it's at the BF default.
      const debugMode = parseDiffSetting(cliDiff, 'debug_mode') || 'NONE';
      const sampleRateStr = parseDiffSetting(cliDiff, 'blackbox_sample_rate');

      const sampleRate = sampleRateStr !== undefined ? parseInt(sampleRateStr, 10) : 1;

      // Read pid_process_denom from MSP for accuracy — CLI diff may omit target defaults.
      let pidDenom = 1;
      if (mspClient?.isConnected()) {
        try {
          pidDenom = await mspClient.getPidProcessDenom();
        } catch {
          const pidDenomStr = parseDiffSetting(cliDiff, 'pid_process_denom');
          pidDenom = pidDenomStr !== undefined ? parseInt(pidDenomStr, 10) : 1;
        }
      } else {
        const pidDenomStr = parseDiffSetting(cliDiff, 'pid_process_denom');
        pidDenom = pidDenomStr !== undefined ? parseInt(pidDenomStr, 10) : 1;
      }

      // Effective logging rate: 8kHz gyro / pid_denom / 2^sample_rate
      // BF blackbox_sample_rate is a power-of-2 index: 0=1:1, 1=1:2, 2=1:4
      const pidRate = 8000 / Math.max(pidDenom, 1);
      const loggingRateHz = Math.round(pidRate / Math.pow(2, sampleRate));

      return createResponse<BlackboxSettings>({ debugMode, sampleRate, loggingRateHz });
    } catch (error) {
      logger.error('Failed to get blackbox settings:', error);
      return createResponse<BlackboxSettings>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.FC_GET_FEEDFORWARD_CONFIG, async (): Promise<IPCResponse<FeedforwardConfiguration>> => {
    try {
      if (!mspClient) throw new Error('MSP client not initialized');
      if (!mspClient.isConnected()) throw new Error('Flight controller not connected');

      const config = await mspClient.getFeedforwardConfiguration();
      return createResponse<FeedforwardConfiguration>(config);
    } catch (error) {
      logger.error('Failed to get feedforward configuration:', error);
      return createResponse<FeedforwardConfiguration>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.FC_FIX_BLACKBOX_SETTINGS, async (_, input: FixBlackboxSettingsInput): Promise<IPCResponse<FixBlackboxSettingsResult>> => {
    try {
      if (!mspClient) throw new Error('MSP client not initialized');
      if (!mspClient.isConnected()) throw new Error('Flight controller not connected');

      if (!input.commands || input.commands.length === 0) {
        throw new Error('No commands to apply');
      }

      logger.info(`Fixing blackbox settings: ${input.commands.length} commands`);

      await mspClient.connection.enterCLI();

      for (const cmd of input.commands) {
        await mspClient.connection.sendCLICommand(cmd);
      }

      // Flag for clean snapshot creation on reconnect (after FC reboots).
      // Creating a snapshot mid-CLI is unreliable (MSP/CLI mode conflicts),
      // so we defer it to the next 'connected' event.
      pendingSettingsSnapshot = true;

      await mspClient.saveAndReboot();

      logger.info('Blackbox settings fixed, FC rebooting');
      return createResponse<FixBlackboxSettingsResult>({
        success: true,
        appliedCommands: input.commands.length,
        rebooted: true,
      });
    } catch (error) {
      logger.error('Failed to fix blackbox settings:', error);
      return createResponse<FixBlackboxSettingsResult>(undefined, getErrorMessage(error));
    }
  });

  // Snapshot handlers
  ipcMain.handle(IPCChannel.SNAPSHOT_CREATE, async (_, label?: string): Promise<IPCResponse<ConfigurationSnapshot>> => {
    try {
      if (!snapshotManager) {
        throw new Error('Snapshot manager not initialized');
      }
      const snapshot = await snapshotManager.createSnapshot(label);
      return createResponse<ConfigurationSnapshot>(snapshot);
    } catch (error) {
      logger.error('Failed to create snapshot:', error);
      return createResponse<ConfigurationSnapshot>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.SNAPSHOT_LIST, async (): Promise<IPCResponse<SnapshotMetadata[]>> => {
    try {
      if (!snapshotManager) {
        throw new Error('Snapshot manager not initialized');
      }
      if (!profileManager) {
        throw new Error('Profile manager not initialized');
      }

      // Get current profile to filter snapshots
      const currentProfile = await profileManager.getCurrentProfile();
      if (!currentProfile) {
        // No profile selected, return empty list
        return createResponse<SnapshotMetadata[]>([]);
      }

      // Get all snapshots and filter by current profile's snapshot IDs
      const allSnapshots = await snapshotManager.listSnapshots();
      const profileSnapshots = allSnapshots.filter(snapshot =>
        currentProfile.snapshotIds.includes(snapshot.id)
      );

      return createResponse<SnapshotMetadata[]>(profileSnapshots);
    } catch (error) {
      logger.error('Failed to list snapshots:', error);
      return createResponse<SnapshotMetadata[]>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.SNAPSHOT_DELETE, async (_, id: string): Promise<IPCResponse<void>> => {
    try {
      if (!snapshotManager) {
        throw new Error('Snapshot manager not initialized');
      }
      await snapshotManager.deleteSnapshot(id);
      return createResponse<void>(undefined);
    } catch (error) {
      logger.error('Failed to delete snapshot:', error);
      return createResponse<void>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.SNAPSHOT_EXPORT, async (_, id: string, filePath: string): Promise<IPCResponse<void>> => {
    try {
      if (!snapshotManager) {
        throw new Error('Snapshot manager not initialized');
      }
      await snapshotManager.exportSnapshot(id, filePath);
      return createResponse<void>(undefined);
    } catch (error) {
      logger.error('Failed to export snapshot:', error);
      return createResponse<void>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.SNAPSHOT_LOAD, async (_, id: string): Promise<IPCResponse<ConfigurationSnapshot>> => {
    try {
      if (!snapshotManager) {
        throw new Error('Snapshot manager not initialized');
      }
      const snapshot = await snapshotManager.loadSnapshot(id);
      return createResponse<ConfigurationSnapshot>(snapshot);
    } catch (error) {
      logger.error('Failed to load snapshot:', error);
      return createResponse<ConfigurationSnapshot>(undefined, getErrorMessage(error));
    }
  });

  // Profile handlers
  ipcMain.handle(IPCChannel.PROFILE_CREATE, async (_, input: ProfileCreationInput): Promise<IPCResponse<DroneProfile>> => {
    try {
      if (!profileManager) {
        throw new Error('Profile manager not initialized');
      }
      if (!snapshotManager) {
        throw new Error('Snapshot manager not initialized');
      }

      const profile = await profileManager.createProfile(input);

      // Notify UI of the new profile
      const window = getMainWindow();
      if (window) {
        sendProfileChanged(window, profile);
      }

      // Create baseline snapshot for new profile
      logger.info('Creating baseline snapshot for new profile...');
      try {
        await snapshotManager.createBaselineIfMissing();
        logger.info('Baseline snapshot created successfully');
      } catch (err) {
        logger.error('Failed to create baseline snapshot:', err);
        // Don't fail profile creation if baseline fails
      }

      return createResponse<DroneProfile>(profile);
    } catch (error) {
      logger.error('Failed to create profile:', error);
      return createResponse<DroneProfile>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.PROFILE_CREATE_FROM_PRESET, async (_, presetId: string, customName?: string): Promise<IPCResponse<DroneProfile>> => {
    try {
      if (!profileManager || !mspClient) {
        throw new Error('Profile manager or MSP client not initialized');
      }
      if (!snapshotManager) {
        throw new Error('Snapshot manager not initialized');
      }

      const preset = PRESET_PROFILES[presetId as keyof typeof PRESET_PROFILES];
      if (!preset) {
        throw new Error(`Preset ${presetId} not found`);
      }

      const fcSerial = await mspClient.getFCSerialNumber();
      const fcInfo = await mspClient.getFCInfo();

      const profile = await profileManager.createProfileFromPreset(preset, fcSerial, fcInfo, customName);

      // Notify UI of the new profile
      const window = getMainWindow();
      if (window) {
        sendProfileChanged(window, profile);
      }

      // Create baseline snapshot for new profile
      logger.info('Creating baseline snapshot for new profile from preset...');
      try {
        await snapshotManager.createBaselineIfMissing();
        logger.info('Baseline snapshot created successfully');
      } catch (err) {
        logger.error('Failed to create baseline snapshot:', err);
        // Don't fail profile creation if baseline fails
      }

      return createResponse<DroneProfile>(profile);
    } catch (error) {
      logger.error('Failed to create profile from preset:', error);
      return createResponse<DroneProfile>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.PROFILE_UPDATE, async (_, id: string, updates: ProfileUpdateInput): Promise<IPCResponse<DroneProfile>> => {
    try {
      if (!profileManager) {
        throw new Error('Profile manager not initialized');
      }
      const profile = await profileManager.updateProfile(id, updates);
      return createResponse<DroneProfile>(profile);
    } catch (error) {
      logger.error('Failed to update profile:', error);
      return createResponse<DroneProfile>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.PROFILE_DELETE, async (_, id: string): Promise<IPCResponse<void>> => {
    try {
      if (!profileManager) {
        throw new Error('Profile manager not initialized');
      }
      if (!snapshotManager) {
        throw new Error('Snapshot manager not initialized');
      }
      if (!blackboxManager) {
        throw new Error('Blackbox manager not initialized');
      }

      // Get profile before deleting to access snapshot IDs
      const profile = await profileManager.getProfile(id);
      if (!profile) {
        throw new Error(`Profile ${id} not found`);
      }

      const wasActive = profileManager.getCurrentProfileId() === id;

      // Delete all snapshots associated with this profile
      for (const snapshotId of profile.snapshotIds) {
        try {
          await snapshotManager.deleteSnapshot(snapshotId);
          logger.info(`Deleted snapshot ${snapshotId} from profile ${id}`);
        } catch (err) {
          logger.error(`Failed to delete snapshot ${snapshotId}:`, err);
          // Continue deleting other snapshots even if one fails
        }
      }

      // Delete all Blackbox logs associated with this profile
      try {
        await blackboxManager.deleteLogsForProfile(id);
        logger.info(`Deleted all Blackbox logs for profile ${id}`);
      } catch (err) {
        logger.error(`Failed to delete Blackbox logs for profile ${id}:`, err);
        // Continue with profile deletion even if log deletion fails
      }

      // Delete tuning history for this profile
      if (tuningHistoryManager) {
        try {
          await tuningHistoryManager.deleteHistory(id);
          logger.info(`Deleted tuning history for profile ${id}`);
        } catch (err) {
          logger.error(`Failed to delete tuning history for profile ${id}:`, err);
        }
      }

      // Delete the profile
      await profileManager.deleteProfile(id);

      // Notify UI that profile was deleted
      const window = getMainWindow();
      if (wasActive && window) {
        sendProfileChanged(window, null);
      }

      // If it was the active profile, disconnect
      if (wasActive && mspClient) {
        try {
          await mspClient.disconnect();
          logger.info('Disconnected after deleting active profile');

          // Send connection status update
          if (window) {
            sendConnectionStatus(window, {
              connected: false,
              port: null
            });
          }
        } catch (err) {
          logger.error('Failed to disconnect after profile deletion:', err);
        }
      }

      return createResponse<void>(undefined);
    } catch (error) {
      logger.error('Failed to delete profile:', error);
      return createResponse<void>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.PROFILE_LIST, async (): Promise<IPCResponse<DroneProfileMetadata[]>> => {
    try {
      if (!profileManager) {
        throw new Error('Profile manager not initialized');
      }
      const profiles = await profileManager.listProfiles();
      return createResponse<DroneProfileMetadata[]>(profiles);
    } catch (error) {
      logger.error('Failed to list profiles:', error);
      return createResponse<DroneProfileMetadata[]>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.PROFILE_GET, async (_, id: string): Promise<IPCResponse<DroneProfile | null>> => {
    try {
      if (!profileManager) {
        throw new Error('Profile manager not initialized');
      }
      const profile = await profileManager.getProfile(id);
      return createResponse<DroneProfile | null>(profile);
    } catch (error) {
      logger.error('Failed to get profile:', error);
      return createResponse<DroneProfile | null>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.PROFILE_GET_CURRENT, async (): Promise<IPCResponse<DroneProfile | null>> => {
    try {
      if (!profileManager) {
        throw new Error('Profile manager not initialized');
      }
      const profile = await profileManager.getCurrentProfile();
      return createResponse<DroneProfile | null>(profile);
    } catch (error) {
      logger.error('Failed to get current profile:', error);
      return createResponse<DroneProfile | null>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.PROFILE_SET_CURRENT, async (_, id: string): Promise<IPCResponse<DroneProfile>> => {
    try {
      if (!profileManager) {
        throw new Error('Profile manager not initialized');
      }
      const profile = await profileManager.setCurrentProfile(id);
      return createResponse<DroneProfile>(profile);
    } catch (error) {
      logger.error('Failed to set current profile:', error);
      return createResponse<DroneProfile>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.PROFILE_EXPORT, async (_, id: string, filePath: string): Promise<IPCResponse<void>> => {
    try {
      if (!profileManager) {
        throw new Error('Profile manager not initialized');
      }
      await profileManager.exportProfile(id, filePath);
      return createResponse<void>(undefined);
    } catch (error) {
      logger.error('Failed to export profile:', error);
      return createResponse<void>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.PROFILE_GET_FC_SERIAL, async (): Promise<IPCResponse<string>> => {
    try {
      if (!mspClient) {
        throw new Error('MSP client not initialized');
      }
      const serial = await mspClient.getFCSerialNumber();
      return createResponse<string>(serial);
    } catch (error) {
      logger.error('Failed to get FC serial:', error);
      return createResponse<string>(undefined, getErrorMessage(error));
    }
  });

  // PID Configuration handlers
  ipcMain.handle(IPCChannel.PID_GET_CONFIG, async (): Promise<IPCResponse<PIDConfiguration>> => {
    try {
      if (!mspClient) throw new Error('MSP client not initialized');
      if (!mspClient.isConnected()) throw new Error('Flight controller not connected');

      const config = await mspClient.getPIDConfiguration();
      return createResponse<PIDConfiguration>(config);
    } catch (error) {
      logger.error('Failed to get PID configuration:', error);
      return createResponse<PIDConfiguration>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.PID_UPDATE_CONFIG, async (_, config: PIDConfiguration): Promise<IPCResponse<void>> => {
    try {
      if (!mspClient) throw new Error('MSP client not initialized');
      if (!mspClient.isConnected()) throw new Error('Flight controller not connected');

      // Validate config (0-255 range for all values)
      validatePIDConfiguration(config);

      await mspClient.setPIDConfiguration(config);

      // Broadcast to all renderer windows
      const window = getMainWindow();
      if (window) {
        sendPIDChanged(window, config);
      }

      return createResponse<void>(undefined);
    } catch (error) {
      logger.error('Failed to update PID configuration:', error);
      return createResponse<void>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.PID_SAVE_CONFIG, async (): Promise<IPCResponse<void>> => {
    try {
      if (!mspClient) throw new Error('MSP client not initialized');
      if (!mspClient.isConnected()) throw new Error('Flight controller not connected');

      await mspClient.saveAndReboot();  // Uses existing CLI save command

      return createResponse<void>(undefined);
    } catch (error) {
      logger.error('Failed to save PID configuration:', error);
      return createResponse<void>(undefined, getErrorMessage(error));
    }
  });

  // Blackbox handlers
  ipcMain.handle(IPCChannel.BLACKBOX_GET_INFO, async (): Promise<IPCResponse<BlackboxInfo>> => {
    try {
      if (!mspClient) {
        return createResponse<BlackboxInfo>(undefined, 'MSP client not initialized');
      }

      const info = await mspClient.getBlackboxInfo();
      return createResponse<BlackboxInfo>(info);
    } catch (error) {
      logger.error('Failed to get Blackbox info:', error);
      return createResponse<BlackboxInfo>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.BLACKBOX_DOWNLOAD_LOG, async (event): Promise<IPCResponse<BlackboxLogMetadata>> => {
    try {
      if (!mspClient) {
        logger.error('MSPClient not initialized');
        return createResponse<BlackboxLogMetadata>(undefined, 'MSPClient not initialized');
      }
      if (!blackboxManager) {
        logger.error('BlackboxManager not initialized');
        return createResponse<BlackboxLogMetadata>(undefined, 'BlackboxManager not initialized');
      }
      if (!profileManager) {
        logger.error('ProfileManager not initialized');
        return createResponse<BlackboxLogMetadata>(undefined, 'ProfileManager not initialized');
      }

      // Get current profile
      const currentProfile = await profileManager.getCurrentProfile();
      if (!currentProfile) {
        return createResponse<BlackboxLogMetadata>(undefined, 'No active profile selected');
      }

      // Prevent concurrent downloads — two downloads competing for MSP
      // cause response interleaving, timeouts, and corrupted data
      if (isDownloadingBlackbox) {
        return createResponse<BlackboxLogMetadata>(undefined, 'Download already in progress');
      }

      isDownloadingBlackbox = true;
      logger.info('Starting Blackbox log download...');

      let logData: Buffer;
      try {
        // Download log data from FC with progress updates
        logData = await mspClient.downloadBlackboxLog((progress: number) => {
          // Send progress update to renderer via IPC event
          event.sender.send(IPCChannel.EVENT_BLACKBOX_DOWNLOAD_PROGRESS, progress);
        });
      } finally {
        isDownloadingBlackbox = false;
      }

      // Get FC info for metadata
      const fcInfo = await mspClient.getFCInfo();

      // Save log with metadata
      const metadata = await blackboxManager.saveLog(
        logData,
        currentProfile.id,
        currentProfile.fcSerial,
        {
          variant: fcInfo.variant,
          version: fcInfo.firmwareVersion,
          target: fcInfo.target
        }
      );

      logger.info(`Blackbox log saved: ${metadata.filename} (${metadata.size} bytes)`);

      return createResponse<BlackboxLogMetadata>(metadata);
    } catch (error) {
      logger.error('Failed to download Blackbox log:', error);
      return createResponse<BlackboxLogMetadata>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.BLACKBOX_OPEN_FOLDER, async (_event, filepath: string): Promise<IPCResponse<void>> => {
    try {
      // Extract directory from filepath
      const directory = path.dirname(filepath);

      logger.info(`Opening Blackbox folder: ${directory}`);

      // Open folder in file manager
      const result = await shell.openPath(directory);

      if (result) {
        throw new Error(`Failed to open folder: ${result}`);
      }

      return createResponse<void>(undefined);
    } catch (error) {
      logger.error('Failed to open Blackbox folder:', error);
      return createResponse<void>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.BLACKBOX_TEST_READ, async (): Promise<IPCResponse<{ success: boolean; message: string; data?: string }>> => {
    try {
      if (!mspClient) {
        return createResponse<{ success: boolean; message: string }>(undefined, 'MSP client not initialized');
      }

      const result = await mspClient.testBlackboxRead();
      return createResponse<{ success: boolean; message: string; data?: string }>(result);
    } catch (error) {
      logger.error('Failed to test Blackbox read:', error);
      return createResponse<{ success: boolean; message: string }>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.BLACKBOX_LIST_LOGS, async (): Promise<IPCResponse<BlackboxLogMetadata[]>> => {
    try {
      if (!blackboxManager || !profileManager) {
        return createResponse<BlackboxLogMetadata[]>(undefined, 'Services not initialized');
      }

      const currentProfile = await profileManager.getCurrentProfile();
      if (!currentProfile) {
        // No profile selected, return empty array
        return createResponse<BlackboxLogMetadata[]>([]);
      }

      const logs = await blackboxManager.listLogs(currentProfile.id);
      return createResponse<BlackboxLogMetadata[]>(logs);
    } catch (error) {
      logger.error('Failed to list Blackbox logs:', error);
      return createResponse<BlackboxLogMetadata[]>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.BLACKBOX_DELETE_LOG, async (_event, logId: string): Promise<IPCResponse<void>> => {
    try {
      if (!blackboxManager) {
        return createResponse<void>(undefined, 'BlackboxManager not initialized');
      }

      await blackboxManager.deleteLog(logId);
      logger.info(`Deleted Blackbox log: ${logId}`);

      return createResponse<void>(undefined);
    } catch (error) {
      logger.error('Failed to delete Blackbox log:', error);
      return createResponse<void>(undefined, getErrorMessage(error));
    }
  });

  ipcMain.handle(IPCChannel.BLACKBOX_ERASE_FLASH, async (): Promise<IPCResponse<void>> => {
    try {
      if (!mspClient) {
        return createResponse<void>(undefined, 'MSP client not initialized');
      }

      logger.warn('Erasing Blackbox flash memory...');
      await mspClient.eraseBlackboxFlash();
      logger.info('Blackbox flash erased successfully');

      return createResponse<void>(undefined);
    } catch (error) {
      logger.error('Failed to erase Blackbox flash:', error);
      return createResponse<void>(undefined, getErrorMessage(error));
    }
  });

  // Blackbox parse handler
  ipcMain.handle(IPCChannel.BLACKBOX_PARSE_LOG, async (event, logId: string): Promise<IPCResponse<BlackboxParseResult>> => {
    try {
      if (!blackboxManager) {
        return createResponse<BlackboxParseResult>(undefined, 'BlackboxManager not initialized');
      }

      const logMeta = await blackboxManager.getLog(logId);
      if (!logMeta) {
        return createResponse<BlackboxParseResult>(undefined, `Blackbox log not found: ${logId}`);
      }

      logger.info(`Parsing Blackbox log: ${logMeta.filename} (${logMeta.size} bytes)`);

      // Read the raw log file
      const data = await fs.readFile(logMeta.filepath);

      // Parse with progress reporting
      const result = await BlackboxParser.parse(data, (progress) => {
        event.sender.send(IPCChannel.EVENT_BLACKBOX_PARSE_PROGRESS, progress);
      });

      logger.info(`Blackbox log parsed: ${result.sessions.length} sessions, ${result.parseTimeMs}ms`);

      return createResponse<BlackboxParseResult>(result);
    } catch (error) {
      logger.error('Failed to parse Blackbox log:', error);
      return createResponse<BlackboxParseResult>(undefined, getErrorMessage(error));
    }
  });

  // Filter analysis handler
  ipcMain.handle(
    IPCChannel.ANALYSIS_RUN_FILTER,
    async (event, logId: string, sessionIndex?: number, currentSettings?: CurrentFilterSettings): Promise<IPCResponse<FilterAnalysisResult>> => {
      try {
        if (!blackboxManager) {
          return createResponse<FilterAnalysisResult>(undefined, 'BlackboxManager not initialized');
        }

        const logMeta = await blackboxManager.getLog(logId);
        if (!logMeta) {
          return createResponse<FilterAnalysisResult>(undefined, `Blackbox log not found: ${logId}`);
        }

        logger.info(`Running filter analysis on: ${logMeta.filename}`);

        // Auto-read current filter settings from FC if not provided
        if (!currentSettings && mspClient?.isConnected()) {
          try {
            currentSettings = await mspClient.getFilterConfiguration();
            logger.info('Read current filter settings from FC');
          } catch (e) {
            logger.warn('Could not read filter settings from FC, using defaults');
          }
        }

        // Parse the log first
        const data = await fs.readFile(logMeta.filepath);
        const parseResult = await BlackboxParser.parse(data);

        if (!parseResult.success || parseResult.sessions.length === 0) {
          return createResponse<FilterAnalysisResult>(undefined, 'Failed to parse Blackbox log for analysis');
        }

        const idx = sessionIndex ?? 0;
        if (idx >= parseResult.sessions.length) {
          return createResponse<FilterAnalysisResult>(
            undefined,
            `Session index ${idx} out of range (log has ${parseResult.sessions.length} sessions)`
          );
        }

        const session = parseResult.sessions[idx];

        // Enrich filter settings with RPM data from BBL headers as fallback
        if (currentSettings && currentSettings.rpm_filter_harmonics === undefined) {
          const enriched = enrichSettingsFromBBLHeaders(currentSettings, session.header.rawHeaders);
          if (enriched) {
            currentSettings = enriched;
            logger.info('Enriched filter settings with RPM data from BBL headers');
          }
        } else if (!currentSettings) {
          // No FC connected and no settings provided — try to build from BBL headers
          const { DEFAULT_FILTER_SETTINGS } = await import('@shared/types/analysis.types');
          const enriched = enrichSettingsFromBBLHeaders(DEFAULT_FILTER_SETTINGS, session.header.rawHeaders);
          if (enriched) {
            currentSettings = enriched;
            logger.info('Built filter settings from BBL headers (no FC connected)');
          }
        }

        // Validate BBL header for data quality warnings
        const headerWarnings = validateBBLHeader(session.header);

        // Run analysis with progress reporting
        const result = await analyzeFilters(
          session.flightData,
          idx,
          currentSettings,
          (progress) => {
            event.sender.send(IPCChannel.EVENT_ANALYSIS_PROGRESS, progress);
          }
        );

        // Attach header warnings to the result
        if (headerWarnings.length > 0) {
          result.warnings = [...headerWarnings, ...(result.warnings || [])];
        }

        logger.info(
          `Filter analysis complete: ${result.recommendations.length} recommendations, ` +
          `noise level: ${result.noise.overallLevel}, ${result.analysisTimeMs}ms`
        );

        return createResponse<FilterAnalysisResult>(result);
      } catch (error) {
        logger.error('Failed to run filter analysis:', error);
        return createResponse<FilterAnalysisResult>(undefined, getErrorMessage(error));
      }
    }
  );

  // PID analysis handler
  ipcMain.handle(
    IPCChannel.ANALYSIS_RUN_PID,
    async (event, logId: string, sessionIndex?: number, currentPIDs?: PIDConfiguration): Promise<IPCResponse<PIDAnalysisResult>> => {
      try {
        if (!blackboxManager) {
          return createResponse<PIDAnalysisResult>(undefined, 'BlackboxManager not initialized');
        }

        const logMeta = await blackboxManager.getLog(logId);
        if (!logMeta) {
          return createResponse<PIDAnalysisResult>(undefined, `Blackbox log not found: ${logId}`);
        }

        logger.info(`Running PID analysis on: ${logMeta.filename}`);

        // Auto-read current PID settings from FC if not provided
        if (!currentPIDs && mspClient?.isConnected()) {
          try {
            currentPIDs = await mspClient.getPIDConfiguration();
            logger.info('Read current PID settings from FC');
          } catch (e) {
            logger.warn('Could not read PID settings from FC, using defaults');
          }
        }

        // Parse the log first
        const data = await fs.readFile(logMeta.filepath);
        const parseResult = await BlackboxParser.parse(data);

        if (!parseResult.success || parseResult.sessions.length === 0) {
          return createResponse<PIDAnalysisResult>(undefined, 'Failed to parse Blackbox log for PID analysis');
        }

        const idx = sessionIndex ?? 0;
        if (idx >= parseResult.sessions.length) {
          return createResponse<PIDAnalysisResult>(
            undefined,
            `Session index ${idx} out of range (log has ${parseResult.sessions.length} sessions)`
          );
        }

        const session = parseResult.sessions[idx];

        // Validate BBL header for data quality warnings
        const headerWarnings = validateBBLHeader(session.header);

        // Extract flight-time PIDs from BBL header for convergent recommendations
        const flightPIDs = extractFlightPIDs(session.header.rawHeaders);

        // Read flight style from current profile for style-aware thresholds
        let flightStyle: 'smooth' | 'balanced' | 'aggressive' = 'balanced';
        if (profileManager) {
          try {
            const currentProfile = await profileManager.getCurrentProfile();
            if (currentProfile?.flightStyle) {
              flightStyle = currentProfile.flightStyle;
            }
          } catch {
            // Fall back to balanced
          }
        }

        // Run PID analysis with progress reporting
        const result = await analyzePID(
          session.flightData,
          idx,
          currentPIDs,
          (progress) => {
            event.sender.send(IPCChannel.EVENT_ANALYSIS_PROGRESS, progress);
          },
          flightPIDs,
          session.header.rawHeaders,
          flightStyle
        );

        // Attach header warnings to the result
        if (headerWarnings.length > 0) {
          result.warnings = [...headerWarnings, ...(result.warnings || [])];
        }

        logger.info(
          `PID analysis complete: ${result.recommendations.length} recommendations, ` +
          `${result.stepsDetected} steps detected, ${result.analysisTimeMs}ms`
        );

        return createResponse<PIDAnalysisResult>(result);
      } catch (error) {
        logger.error('Failed to run PID analysis:', error);
        return createResponse<PIDAnalysisResult>(undefined, getErrorMessage(error));
      }
    }
  );

  // Tuning apply handler
  ipcMain.handle(
    IPCChannel.TUNING_APPLY_RECOMMENDATIONS,
    async (event, input: ApplyRecommendationsInput): Promise<IPCResponse<ApplyRecommendationsResult>> => {
      try {
        if (!mspClient) throw new Error('MSP client not initialized');
        if (!mspClient.isConnected()) throw new Error('Flight controller not connected');

        const totalRecs = input.filterRecommendations.length + input.pidRecommendations.length;
        if (totalRecs === 0) throw new Error('No recommendations to apply');

        const sendProgress = (progress: ApplyRecommendationsProgress) => {
          event.sender.send(IPCChannel.EVENT_TUNING_APPLY_PROGRESS, progress);
        };

        // Order matters: MSP commands first (PIDs), then CLI operations
        // (snapshot, filters, save). createSnapshot() enters CLI mode via
        // exportCLIDiff() and does NOT exit — so any MSP commands after it
        // would time out (the FC only processes CLI input while in CLI mode).

        // Stage 1: Apply PID recommendations via MSP (must happen before CLI)
        let appliedPIDs = 0;
        if (input.pidRecommendations.length > 0) {
          sendProgress({ stage: 'pid', message: 'Applying PID changes via MSP...', percent: 5 });

          const currentConfig = await mspClient.getPIDConfiguration();
          const newConfig: PIDConfiguration = JSON.parse(JSON.stringify(currentConfig));

          for (const rec of input.pidRecommendations) {
            const match = rec.setting.match(/^pid_(roll|pitch|yaw)_(p|i|d)$/i);
            if (!match) {
              logger.warn(`Unknown PID setting: ${rec.setting}, skipping`);
              continue;
            }
            const axis = match[1] as 'roll' | 'pitch' | 'yaw';
            const term = match[2].toUpperCase() as 'P' | 'I' | 'D';
            const value = Math.round(Math.max(0, Math.min(255, rec.recommendedValue)));
            newConfig[axis][term] = value;
            appliedPIDs++;
          }

          if (appliedPIDs > 0) {
            await mspClient.setPIDConfiguration(newConfig);
            logger.info(`Applied ${appliedPIDs} PID changes`);
          }
        }

        sendProgress({ stage: 'pid', message: `Applied ${appliedPIDs} PID changes`, percent: 20 });

        // Stage 2: Enter CLI mode for filter changes (no MSP after this)
        // Safety snapshot is NOT created here — Pre-tuning (auto) from Start Tuning covers rollback.

        // Stage 3: Apply filter recommendations via CLI
        let appliedFilters = 0;
        if (input.filterRecommendations.length > 0) {
          sendProgress({ stage: 'filter', message: 'Entering CLI mode...', percent: 50 });

          await mspClient.connection.enterCLI();

          for (const rec of input.filterRecommendations) {
            const value = Math.round(rec.recommendedValue);
            const cmd = `set ${rec.setting} = ${value}`;
            sendProgress({
              stage: 'filter',
              message: `Setting ${rec.setting} = ${value}...`,
              percent: 50 + Math.round((appliedFilters / input.filterRecommendations.length) * 30),
            });
            await mspClient.connection.sendCLICommand(cmd);
            appliedFilters++;
          }

          logger.info(`Applied ${appliedFilters} filter changes via CLI`);
        }

        sendProgress({ stage: 'filter', message: `Applied ${appliedFilters} filter changes`, percent: 80 });

        // Stage 4: Save and reboot
        sendProgress({ stage: 'save', message: 'Saving and rebooting FC...', percent: 90 });
        await mspClient.saveAndReboot();

        sendProgress({ stage: 'save', message: 'FC is rebooting', percent: 100 });

        const result: ApplyRecommendationsResult = {
          success: true,
          appliedPIDs,
          appliedFilters,
          rebooted: true,
        };

        logger.info(`Tuning applied: ${appliedPIDs} PIDs, ${appliedFilters} filters, rebooted`);
        return createResponse<ApplyRecommendationsResult>(result);
      } catch (error) {
        logger.error('Failed to apply recommendations:', error);
        return createResponse<ApplyRecommendationsResult>(undefined, getErrorMessage(error));
      }
    }
  );

  // Snapshot restore handler
  ipcMain.handle(
    IPCChannel.SNAPSHOT_RESTORE,
    async (event, snapshotId: string, createBackup: boolean): Promise<IPCResponse<SnapshotRestoreResult>> => {
      try {
        if (!mspClient) throw new Error('MSP client not initialized');
        if (!mspClient.isConnected()) throw new Error('Flight controller not connected');
        if (!snapshotManager) throw new Error('Snapshot manager not initialized');

        const sendProgress = (progress: SnapshotRestoreProgress) => {
          event.sender.send(IPCChannel.EVENT_SNAPSHOT_RESTORE_PROGRESS, progress);
        };

        // Load snapshot
        const snapshot = await snapshotManager.loadSnapshot(snapshotId);
        if (!snapshot) throw new Error(`Snapshot not found: ${snapshotId}`);

        // Parse CLI diff — extract restorable CLI commands
        // Safe commands: set, feature, serial, aux, beacon, map, resource, timer, dma
        // Skip: diff all, batch start/end, defaults nosave, save, board_name,
        //       manufacturer_id, mcu_id, signature, comments (#), profile/rateprofile selection
        const SKIP_PREFIXES = [
          'diff', 'batch', 'defaults', 'save', 'board_name', 'manufacturer_id',
          'mcu_id', 'signature', 'profile', 'rateprofile',
        ];
        const cliDiff: string = snapshot.configuration.cliDiff || '';
        const restorableCommands = cliDiff
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => {
            if (!line || line.length < 3 || line.startsWith('#')) return false;
            const prefix = line.split(/\s/)[0].toLowerCase();
            return !SKIP_PREFIXES.includes(prefix);
          });

        if (restorableCommands.length === 0) {
          throw new Error('Snapshot contains no restorable settings');
        }

        logger.info(`Restoring snapshot ${snapshotId}: ${restorableCommands.length} CLI commands`);

        // Stage 1: Create backup snapshot (enters CLI mode via exportCLIDiff)
        let backupSnapshotId: string | undefined;
        if (createBackup) {
          sendProgress({ stage: 'backup', message: 'Creating pre-restore backup...', percent: 10 });
          const backupSnapshot = await snapshotManager.createSnapshot('Pre-restore (auto)');
          backupSnapshotId = backupSnapshot.id;
          logger.info(`Pre-restore backup created: ${backupSnapshotId}`);
        }

        sendProgress({ stage: 'backup', message: 'Backup complete', percent: 20 });

        // Stage 2: Enter CLI and send set commands
        sendProgress({ stage: 'cli', message: 'Entering CLI mode...', percent: 25 });
        await mspClient.connection.enterCLI();

        for (let i = 0; i < restorableCommands.length; i++) {
          const cmd = restorableCommands[i];
          sendProgress({
            stage: 'cli',
            message: `Applying: ${cmd}`,
            percent: 25 + Math.round((i / restorableCommands.length) * 55),
          });
          await mspClient.connection.sendCLICommand(cmd);
        }

        logger.info(`Applied ${restorableCommands.length} CLI commands from snapshot`);

        // Stage 3: Save and reboot
        sendProgress({ stage: 'save', message: 'Saving and rebooting FC...', percent: 90 });
        await mspClient.saveAndReboot();

        sendProgress({ stage: 'save', message: 'FC is rebooting', percent: 100 });

        const result: SnapshotRestoreResult = {
          success: true,
          backupSnapshotId,
          appliedCommands: restorableCommands.length,
          rebooted: true,
        };

        logger.info(`Snapshot restored: ${restorableCommands.length} commands applied, rebooted`);
        return createResponse<SnapshotRestoreResult>(result);
      } catch (error) {
        logger.error('Failed to restore snapshot:', error);
        return createResponse<SnapshotRestoreResult>(undefined, getErrorMessage(error));
      }
    }
  );

  // Tuning Session handlers
  ipcMain.handle(
    IPCChannel.TUNING_GET_SESSION,
    async (): Promise<IPCResponse<TuningSession | null>> => {
      try {
        if (!tuningSessionManager || !profileManager) {
          return createResponse<TuningSession | null>(null);
        }
        const profileId = profileManager.getCurrentProfileId();
        if (!profileId) {
          return createResponse<TuningSession | null>(null);
        }
        const session = await tuningSessionManager.getSession(profileId);
        return createResponse<TuningSession | null>(session);
      } catch (error) {
        logger.error('Failed to get tuning session:', error);
        return createResponse<TuningSession | null>(undefined, getErrorMessage(error));
      }
    }
  );

  ipcMain.handle(
    IPCChannel.TUNING_START_SESSION,
    async (): Promise<IPCResponse<TuningSession>> => {
      try {
        if (!tuningSessionManager || !profileManager) {
          return createResponse<TuningSession>(undefined, 'Tuning session manager not initialized');
        }
        const profileId = profileManager.getCurrentProfileId();
        if (!profileId) {
          return createResponse<TuningSession>(undefined, 'No active profile');
        }

        // Create safety snapshot before starting tuning
        let baselineSnapshotId: string | undefined;
        if (snapshotManager && mspClient?.isConnected()) {
          try {
            const snapshot = await snapshotManager.createSnapshot('Pre-tuning (auto)', 'auto');
            baselineSnapshotId = snapshot.id;
            logger.info(`Pre-tuning backup created: ${snapshot.id}`);
          } catch (e) {
            logger.warn('Could not create pre-tuning snapshot:', e);
          }
        }

        const session = await tuningSessionManager.createSession(profileId);
        if (baselineSnapshotId) {
          await tuningSessionManager.updatePhase(profileId, 'filter_flight_pending', { baselineSnapshotId });
        }

        const updated = await tuningSessionManager.getSession(profileId);
        sendTuningSessionChanged(updated);
        return createResponse<TuningSession>(updated || session);
      } catch (error) {
        logger.error('Failed to start tuning session:', error);
        return createResponse<TuningSession>(undefined, getErrorMessage(error));
      }
    }
  );

  ipcMain.handle(
    IPCChannel.TUNING_UPDATE_PHASE,
    async (_event, phase: TuningPhase, data?: Partial<TuningSession>): Promise<IPCResponse<TuningSession>> => {
      try {
        if (!tuningSessionManager || !profileManager) {
          return createResponse<TuningSession>(undefined, 'Tuning session manager not initialized');
        }
        const profileId = profileManager.getCurrentProfileId();
        if (!profileId) {
          return createResponse<TuningSession>(undefined, 'No active profile');
        }

        // Archive session to history before completing
        if (phase === 'completed' && tuningHistoryManager) {
          try {
            // First update the phase to 'completed' so the session has the final data
            const completedSession = await tuningSessionManager.updatePhase(profileId, phase, data);
            await tuningHistoryManager.archiveSession(completedSession);
            logger.info(`Tuning session archived to history for profile ${profileId}`);
            sendTuningSessionChanged(completedSession);
            return createResponse<TuningSession>(completedSession);
          } catch (archiveError) {
            logger.warn('Failed to archive tuning session (non-fatal):', archiveError);
            // Fall through to normal update if archive fails
          }
        }

        const updated = await tuningSessionManager.updatePhase(profileId, phase, data);
        sendTuningSessionChanged(updated);
        return createResponse<TuningSession>(updated);
      } catch (error) {
        logger.error('Failed to update tuning phase:', error);
        return createResponse<TuningSession>(undefined, getErrorMessage(error));
      }
    }
  );

  // Tuning History handler
  ipcMain.handle(
    IPCChannel.TUNING_GET_HISTORY,
    async (): Promise<IPCResponse<CompletedTuningRecord[]>> => {
      try {
        if (!tuningHistoryManager || !profileManager) {
          return createResponse<CompletedTuningRecord[]>([]);
        }
        const profileId = profileManager.getCurrentProfileId();
        if (!profileId) {
          return createResponse<CompletedTuningRecord[]>([]);
        }
        const history = await tuningHistoryManager.getHistory(profileId);
        return createResponse<CompletedTuningRecord[]>(history);
      } catch (error) {
        logger.error('Failed to get tuning history:', error);
        return createResponse<CompletedTuningRecord[]>(undefined, getErrorMessage(error));
      }
    }
  );

  ipcMain.handle(
    IPCChannel.TUNING_RESET_SESSION,
    async (): Promise<IPCResponse<void>> => {
      try {
        if (!tuningSessionManager || !profileManager) {
          return createResponse<void>(undefined);
        }
        const profileId = profileManager.getCurrentProfileId();
        if (!profileId) {
          return createResponse<void>(undefined);
        }

        await tuningSessionManager.deleteSession(profileId);
        sendTuningSessionChanged(null);
        return createResponse<void>(undefined);
      } catch (error) {
        logger.error('Failed to reset tuning session:', error);
        return createResponse<void>(undefined, getErrorMessage(error));
      }
    }
  );

  logger.info('IPC handlers registered');
}

function validatePIDConfiguration(config: PIDConfiguration): void {
  const axes: Array<keyof PIDConfiguration> = ['roll', 'pitch', 'yaw'];
  const terms: Array<keyof PIDTerm> = ['P', 'I', 'D'];

  for (const axis of axes) {
    const term = config[axis];
    if (!term) throw new Error(`Missing ${axis} configuration`);

    for (const t of terms) {
      const value = term[t];
      if (typeof value !== 'number' || isNaN(value)) {
        throw new Error(`Invalid ${axis} ${t} value: ${value}`);
      }
      if (value < 0 || value > 255) {
        throw new Error(`${axis} ${t} value out of range (0-255): ${value}`);
      }
    }
  }
}

export function sendConnectionChanged(window: BrowserWindow, status: ConnectionStatus): void {
  window.webContents.send(IPCChannel.EVENT_CONNECTION_CHANGED, status);
}

export function sendError(window: BrowserWindow, error: string): void {
  window.webContents.send(IPCChannel.EVENT_ERROR, error);
}

export function sendLog(window: BrowserWindow, message: string, level: string): void {
  window.webContents.send(IPCChannel.EVENT_LOG, message, level);
}

export function sendProfileChanged(window: BrowserWindow, profile: DroneProfile | null): void {
  window.webContents.send(IPCChannel.EVENT_PROFILE_CHANGED, profile);
}

export function sendNewFCDetected(window: BrowserWindow, fcSerial: string, fcInfo: FCInfo): void {
  window.webContents.send(IPCChannel.EVENT_NEW_FC_DETECTED, fcSerial, fcInfo);
}

export function sendPIDChanged(window: BrowserWindow, config: PIDConfiguration): void {
  window.webContents.send(IPCChannel.EVENT_PID_CHANGED, config);
}

export function sendTuningSessionChanged(session: TuningSession | null): void {
  const window = getMainWindow();
  if (window) {
    window.webContents.send(IPCChannel.EVENT_TUNING_SESSION_CHANGED, session);
  }
}

