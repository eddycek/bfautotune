import type {
  PortInfo,
  FCInfo,
  ConfigurationSnapshot,
  SnapshotMetadata,
  ConnectionStatus
} from './common.types';
import type {
  DroneProfile,
  DroneProfileMetadata,
  ProfileCreationInput,
  ProfileUpdateInput,
  PresetProfile
} from './profile.types';

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

  // Profiles
  PROFILE_CREATE = 'profile:create',
  PROFILE_CREATE_FROM_PRESET = 'profile:create-from-preset',
  PROFILE_UPDATE = 'profile:update',
  PROFILE_DELETE = 'profile:delete',
  PROFILE_LIST = 'profile:list',
  PROFILE_GET = 'profile:get',
  PROFILE_GET_CURRENT = 'profile:get-current',
  PROFILE_SET_CURRENT = 'profile:set-current',
  PROFILE_EXPORT = 'profile:export',
  PROFILE_GET_FC_SERIAL = 'profile:get-fc-serial',

  // Events (main -> renderer)
  EVENT_CONNECTION_CHANGED = 'event:connection-changed',
  EVENT_PROFILE_CHANGED = 'event:profile-changed',
  EVENT_NEW_FC_DETECTED = 'event:new-fc-detected',
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

  // Profiles
  createProfile(input: ProfileCreationInput): Promise<DroneProfile>;
  createProfileFromPreset(presetId: string, customName?: string): Promise<DroneProfile>;
  updateProfile(id: string, updates: ProfileUpdateInput): Promise<DroneProfile>;
  deleteProfile(id: string): Promise<void>;
  listProfiles(): Promise<DroneProfileMetadata[]>;
  getProfile(id: string): Promise<DroneProfile | null>;
  getCurrentProfile(): Promise<DroneProfile | null>;
  setCurrentProfile(id: string): Promise<DroneProfile>;
  exportProfile(id: string, filePath: string): Promise<void>;
  getFCSerialNumber(): Promise<string>;

  // Events
  onError(callback: (error: string) => void): () => void;
  onLog(callback: (message: string, level: string) => void): () => void;
  onProfileChanged(callback: (profile: DroneProfile | null) => void): () => void;
  onNewFCDetected(callback: (fcSerial: string, fcInfo: FCInfo) => void): () => void;
}

declare global {
  interface Window {
    betaflight: BetaflightAPI;
  }
}
