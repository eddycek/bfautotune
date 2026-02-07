import { contextBridge, ipcRenderer } from 'electron';
import { IPCChannel, BetaflightAPI } from '@shared/types/ipc.types';
import type {
  PortInfo,
  FCInfo,
  ConfigurationSnapshot,
  SnapshotMetadata,
  ConnectionStatus
} from '@shared/types/common.types';

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
  }
};

contextBridge.exposeInMainWorld('betaflight', betaflightAPI);
