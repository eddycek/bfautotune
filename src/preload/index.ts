import { contextBridge, ipcRenderer } from 'electron';
import { IPCChannel, BetaflightAPI } from '@shared/types/ipc.types';
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
import type { PIDConfiguration } from '@shared/types/pid.types';
import type { BlackboxInfo } from '@shared/types/blackbox.types';

const betaflightAPI: BetaflightAPI = {
  // Connection
  async listPorts(): Promise<PortInfo[]> {
    const response = await ipcRenderer.invoke(IPCChannel.CONNECTION_LIST_PORTS);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async connect(portPath: string): Promise<void> {
    const response = await ipcRenderer.invoke(IPCChannel.CONNECTION_CONNECT, portPath);
    if (!response.success) {
      throw new Error(response.error);
    }
  },

  async disconnect(): Promise<void> {
    const response = await ipcRenderer.invoke(IPCChannel.CONNECTION_DISCONNECT);
    if (!response.success) {
      throw new Error(response.error);
    }
  },

  async getConnectionStatus(): Promise<ConnectionStatus> {
    const response = await ipcRenderer.invoke(IPCChannel.CONNECTION_GET_STATUS);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  },

  onConnectionChanged(callback: (status: ConnectionStatus) => void): () => void {
    const listener = (_: any, status: ConnectionStatus) => callback(status);
    ipcRenderer.on(IPCChannel.EVENT_CONNECTION_CHANGED, listener);
    return () => {
      ipcRenderer.removeListener(IPCChannel.EVENT_CONNECTION_CHANGED, listener);
    };
  },

  // FC Info
  async getFCInfo(): Promise<FCInfo> {
    const response = await ipcRenderer.invoke(IPCChannel.FC_GET_INFO);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async exportCLI(format: 'diff' | 'dump'): Promise<string> {
    const response = await ipcRenderer.invoke(IPCChannel.FC_EXPORT_CLI, format);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  },

  // Snapshots
  async createSnapshot(label?: string): Promise<ConfigurationSnapshot> {
    const response = await ipcRenderer.invoke(IPCChannel.SNAPSHOT_CREATE, label);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async listSnapshots(): Promise<SnapshotMetadata[]> {
    const response = await ipcRenderer.invoke(IPCChannel.SNAPSHOT_LIST);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async deleteSnapshot(id: string): Promise<void> {
    const response = await ipcRenderer.invoke(IPCChannel.SNAPSHOT_DELETE, id);
    if (!response.success) {
      throw new Error(response.error);
    }
  },

  async exportSnapshot(id: string, filePath: string): Promise<void> {
    const response = await ipcRenderer.invoke(IPCChannel.SNAPSHOT_EXPORT, id, filePath);
    if (!response.success) {
      throw new Error(response.error);
    }
  },

  async loadSnapshot(id: string): Promise<ConfigurationSnapshot> {
    const response = await ipcRenderer.invoke(IPCChannel.SNAPSHOT_LOAD, id);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  },

  // Profiles
  async createProfile(input: ProfileCreationInput): Promise<DroneProfile> {
    const response = await ipcRenderer.invoke(IPCChannel.PROFILE_CREATE, input);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async createProfileFromPreset(presetId: string, customName?: string): Promise<DroneProfile> {
    const response = await ipcRenderer.invoke(IPCChannel.PROFILE_CREATE_FROM_PRESET, presetId, customName);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async updateProfile(id: string, updates: ProfileUpdateInput): Promise<DroneProfile> {
    const response = await ipcRenderer.invoke(IPCChannel.PROFILE_UPDATE, id, updates);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async deleteProfile(id: string): Promise<void> {
    const response = await ipcRenderer.invoke(IPCChannel.PROFILE_DELETE, id);
    if (!response.success) {
      throw new Error(response.error);
    }
  },

  async listProfiles(): Promise<DroneProfileMetadata[]> {
    const response = await ipcRenderer.invoke(IPCChannel.PROFILE_LIST);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async getProfile(id: string): Promise<DroneProfile | null> {
    const response = await ipcRenderer.invoke(IPCChannel.PROFILE_GET, id);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async getCurrentProfile(): Promise<DroneProfile | null> {
    const response = await ipcRenderer.invoke(IPCChannel.PROFILE_GET_CURRENT);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async setCurrentProfile(id: string): Promise<DroneProfile> {
    const response = await ipcRenderer.invoke(IPCChannel.PROFILE_SET_CURRENT, id);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  },

  async exportProfile(id: string, filePath: string): Promise<void> {
    const response = await ipcRenderer.invoke(IPCChannel.PROFILE_EXPORT, id, filePath);
    if (!response.success) {
      throw new Error(response.error);
    }
  },

  async getFCSerialNumber(): Promise<string> {
    const response = await ipcRenderer.invoke(IPCChannel.PROFILE_GET_FC_SERIAL);
    if (!response.success) {
      throw new Error(response.error);
    }
    return response.data;
  },

  // Events
  onError(callback: (error: string) => void): () => void {
    const listener = (_: any, error: string) => callback(error);
    ipcRenderer.on(IPCChannel.EVENT_ERROR, listener);
    return () => {
      ipcRenderer.removeListener(IPCChannel.EVENT_ERROR, listener);
    };
  },

  onLog(callback: (message: string, level: string) => void): () => void {
    const listener = (_: any, message: string, level: string) => callback(message, level);
    ipcRenderer.on(IPCChannel.EVENT_LOG, listener);
    return () => {
      ipcRenderer.removeListener(IPCChannel.EVENT_LOG, listener);
    };
  },

  onProfileChanged(callback: (profile: DroneProfile | null) => void): () => void {
    const listener = (_: any, profile: DroneProfile | null) => callback(profile);
    ipcRenderer.on(IPCChannel.EVENT_PROFILE_CHANGED, listener);
    return () => {
      ipcRenderer.removeListener(IPCChannel.EVENT_PROFILE_CHANGED, listener);
    };
  },

  onNewFCDetected(callback: (fcSerial: string, fcInfo: FCInfo) => void): () => void {
    const listener = (_: any, fcSerial: string, fcInfo: FCInfo) => callback(fcSerial, fcInfo);
    ipcRenderer.on(IPCChannel.EVENT_NEW_FC_DETECTED, listener);
    return () => {
      ipcRenderer.removeListener(IPCChannel.EVENT_NEW_FC_DETECTED, listener);
    };
  },

  // PID Configuration
  async getPIDConfig(): Promise<PIDConfiguration> {
    const response = await ipcRenderer.invoke(IPCChannel.PID_GET_CONFIG);
    if (!response.success) {
      throw new Error(response.error || 'Failed to get PID configuration');
    }
    return response.data;
  },

  async updatePIDConfig(config: PIDConfiguration): Promise<void> {
    const response = await ipcRenderer.invoke(IPCChannel.PID_UPDATE_CONFIG, config);
    if (!response.success) {
      throw new Error(response.error || 'Failed to update PID configuration');
    }
  },

  async savePIDConfig(): Promise<void> {
    const response = await ipcRenderer.invoke(IPCChannel.PID_SAVE_CONFIG);
    if (!response.success) {
      throw new Error(response.error || 'Failed to save PID configuration');
    }
  },

  // Blackbox
  async getBlackboxInfo(): Promise<BlackboxInfo> {
    const response = await ipcRenderer.invoke(IPCChannel.BLACKBOX_GET_INFO);
    if (!response.success) {
      throw new Error(response.error || 'Failed to get Blackbox info');
    }
    return response.data;
  },

  async downloadBlackboxLog(onProgress?: (progress: number) => void): Promise<string> {
    // Set up progress listener if callback provided
    let progressListener: ((event: any, progress: number) => void) | null = null;
    if (onProgress) {
      progressListener = (_event: any, progress: number) => onProgress(progress);
      ipcRenderer.on(IPCChannel.EVENT_BLACKBOX_DOWNLOAD_PROGRESS, progressListener);
    }

    try {
      const response = await ipcRenderer.invoke(IPCChannel.BLACKBOX_DOWNLOAD_LOG);
      if (!response.success) {
        throw new Error(response.error || 'Failed to download Blackbox log');
      }
      return response.data;
    } finally {
      // Clean up progress listener
      if (progressListener) {
        ipcRenderer.removeListener(IPCChannel.EVENT_BLACKBOX_DOWNLOAD_PROGRESS, progressListener);
      }
    }
  },

  async openBlackboxFolder(filepath: string): Promise<void> {
    const response = await ipcRenderer.invoke(IPCChannel.BLACKBOX_OPEN_FOLDER, filepath);
    if (!response.success) {
      throw new Error(response.error || 'Failed to open Blackbox folder');
    }
  },

  async testBlackboxRead(): Promise<{ success: boolean; message: string; data?: string }> {
    const response = await ipcRenderer.invoke(IPCChannel.BLACKBOX_TEST_READ);
    if (!response.success) {
      throw new Error(response.error || 'Failed to test Blackbox read');
    }
    return response.data;
  },

  onPIDChanged(callback: (config: PIDConfiguration) => void): () => void {
    const listener = (_: any, config: PIDConfiguration) => callback(config);
    ipcRenderer.on(IPCChannel.EVENT_PID_CHANGED, listener);
    return () => {
      ipcRenderer.removeListener(IPCChannel.EVENT_PID_CHANGED, listener);
    };
  }
};

contextBridge.exposeInMainWorld('betaflight', betaflightAPI);
