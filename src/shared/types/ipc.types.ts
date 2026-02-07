import type {
  PortInfo,
  FCInfo,
  ConfigurationSnapshot,
  SnapshotMetadata,
  ConnectionStatus
} from './common.types';

export enum IPCChannel {
  // Connection
  CONNECTION_LIST_PORTS = 'connection:list-ports',
  CONNECTION_CONNECT = 'connection:connect',
  CONNECTION_DISCONNECT = 'connection:disconnect',
  CONNECTION_GET_STATUS = 'connection:get-status',

  // FC Info
  FC_GET_INFO = 'fc:get-info',
  FC_EXPORT_CLI = 'fc:export-cli',

  // Snapshots
  SNAPSHOT_CREATE = 'snapshot:create',
  SNAPSHOT_LIST = 'snapshot:list',
  SNAPSHOT_DELETE = 'snapshot:delete',
  SNAPSHOT_EXPORT = 'snapshot:export',
  SNAPSHOT_LOAD = 'snapshot:load',

  // Events (main -> renderer)
  EVENT_CONNECTION_CHANGED = 'event:connection-changed',
  EVENT_ERROR = 'event:error',
  EVENT_LOG = 'event:log'
}

export interface IPCResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface BetaflightAPI {
  // Connection
  listPorts(): Promise<PortInfo[]>;
  connect(portPath: string): Promise<void>;
  disconnect(): Promise<void>;
  getConnectionStatus(): Promise<ConnectionStatus>;
  onConnectionChanged(callback: (status: ConnectionStatus) => void): () => void;

  // FC Info
  getFCInfo(): Promise<FCInfo>;
  exportCLI(format: 'diff' | 'dump'): Promise<string>;

  // Snapshots
  createSnapshot(label?: string): Promise<ConfigurationSnapshot>;
  listSnapshots(): Promise<SnapshotMetadata[]>;
  deleteSnapshot(id: string): Promise<void>;
  exportSnapshot(id: string, filePath: string): Promise<void>;
  loadSnapshot(id: string): Promise<ConfigurationSnapshot>;

  // Events
  onError(callback: (error: string) => void): () => void;
  onLog(callback: (message: string, level: string) => void): () => void;
}

declare global {
  interface Window {
    betaflight: BetaflightAPI;
  }
}
