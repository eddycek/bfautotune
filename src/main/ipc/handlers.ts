import { ipcMain, BrowserWindow } from 'electron';
import { IPCChannel, IPCResponse } from '@shared/types/ipc.types';
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
import type { PIDConfiguration, PIDTerm } from '@shared/types/pid.types';
import type { BlackboxInfo } from '@shared/types/blackbox.types';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errors';
import { PRESET_PROFILES } from '@shared/constants';
import { getMainWindow } from '../window';

let mspClient: any = null; // Will be set from main
let snapshotManager: any = null; // Will be set from main
let profileManager: any = null; // Will be set from main

export function setMSPClient(client: any): void {
  mspClient = client;
}

export function setSnapshotManager(manager: any): void {
  snapshotManager = manager;
}

export function setProfileManager(manager: any): void {
  profileManager = manager;
}

function createResponse<T>(data: T | undefined, error?: string): IPCResponse<T> {
  return {
    success: !error,
    data: data as T,
    error
  } as IPCResponse<T>;
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
