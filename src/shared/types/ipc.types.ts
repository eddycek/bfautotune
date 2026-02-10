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
import type { PIDConfiguration } from './pid.types';
import type { BlackboxInfo, BlackboxLogMetadata, BlackboxParseResult, BlackboxParseProgress } from './blackbox.types';
import type { FilterAnalysisResult, PIDAnalysisResult, AnalysisProgress, CurrentFilterSettings, FilterRecommendation, PIDRecommendation } from './analysis.types';
import type { TuningSession, TuningPhase } from './tuning.types';

/** Progress during snapshot restore */
export interface SnapshotRestoreProgress {
  stage: 'backup' | 'cli' | 'save';
  message: string;
  percent: number;
}

/** Result of restoring a snapshot */
export interface SnapshotRestoreResult {
  success: boolean;
  backupSnapshotId?: string;
  appliedCommands: number;
  rebooted: boolean;
}

/** Input for applying tuning recommendations to the FC */
export interface ApplyRecommendationsInput {
  filterRecommendations: FilterRecommendation[];
  pidRecommendations: PIDRecommendation[];
  createSnapshot: boolean;
}

/** Progress during recommendation application */
export interface ApplyRecommendationsProgress {
  stage: 'snapshot' | 'pid' | 'filter' | 'save';
  message: string;
  percent: number;
}

/** Result of applying recommendations */
export interface ApplyRecommendationsResult {
  success: boolean;
  snapshotId?: string;
  appliedPIDs: number;
  appliedFilters: number;
  rebooted: boolean;
}

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

  // PID Configuration
  PID_GET_CONFIG = 'pid:get-config',
  PID_UPDATE_CONFIG = 'pid:update-config',
  PID_SAVE_CONFIG = 'pid:save-config',

  // Blackbox
  BLACKBOX_GET_INFO = 'blackbox:get-info',
  BLACKBOX_DOWNLOAD_LOG = 'blackbox:download-log',
  BLACKBOX_LIST_LOGS = 'blackbox:list-logs',
  BLACKBOX_DELETE_LOG = 'blackbox:delete-log',
  BLACKBOX_ERASE_FLASH = 'blackbox:erase-flash',
  BLACKBOX_OPEN_FOLDER = 'blackbox:open-folder',
  BLACKBOX_TEST_READ = 'blackbox:test-read',
  BLACKBOX_PARSE_LOG = 'blackbox:parse-log',

  // Analysis
  ANALYSIS_RUN_FILTER = 'analysis:run-filter',
  ANALYSIS_RUN_PID = 'analysis:run-pid',

  // Snapshot Restore
  SNAPSHOT_RESTORE = 'snapshot:restore',

  // Tuning
  TUNING_APPLY_RECOMMENDATIONS = 'tuning:apply-recommendations',
  TUNING_GET_SESSION = 'tuning:get-session',
  TUNING_START_SESSION = 'tuning:start-session',
  TUNING_UPDATE_PHASE = 'tuning:update-phase',
  TUNING_RESET_SESSION = 'tuning:reset-session',

  // Events (main -> renderer)
  EVENT_CONNECTION_CHANGED = 'event:connection-changed',
  EVENT_PROFILE_CHANGED = 'event:profile-changed',
  EVENT_NEW_FC_DETECTED = 'event:new-fc-detected',
  EVENT_PID_CHANGED = 'event:pid-changed',
  EVENT_BLACKBOX_DOWNLOAD_PROGRESS = 'event:blackbox-download-progress',
  EVENT_BLACKBOX_PARSE_PROGRESS = 'event:blackbox-parse-progress',
  EVENT_ANALYSIS_PROGRESS = 'event:analysis-progress',
  EVENT_TUNING_APPLY_PROGRESS = 'event:tuning-apply-progress',
  EVENT_SNAPSHOT_RESTORE_PROGRESS = 'event:snapshot-restore-progress',
  EVENT_TUNING_SESSION_CHANGED = 'event:tuning-session-changed',
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

  // PID Configuration
  getPIDConfig(): Promise<PIDConfiguration>;
  updatePIDConfig(config: PIDConfiguration): Promise<void>;
  savePIDConfig(): Promise<void>;

  // Blackbox
  getBlackboxInfo(): Promise<BlackboxInfo>;
  downloadBlackboxLog(onProgress?: (progress: number) => void): Promise<BlackboxLogMetadata>;
  listBlackboxLogs(): Promise<BlackboxLogMetadata[]>;
  deleteBlackboxLog(logId: string): Promise<void>;
  eraseBlackboxFlash(): Promise<void>;
  openBlackboxFolder(filepath: string): Promise<void>;
  testBlackboxRead(): Promise<{ success: boolean; message: string; data?: string }>;
  parseBlackboxLog(logId: string, onProgress?: (progress: BlackboxParseProgress) => void): Promise<BlackboxParseResult>;
  onBlackboxParseProgress(callback: (progress: BlackboxParseProgress) => void): () => void;

  // Analysis
  analyzeFilters(logId: string, sessionIndex?: number, currentSettings?: CurrentFilterSettings, onProgress?: (progress: AnalysisProgress) => void): Promise<FilterAnalysisResult>;
  analyzePID(logId: string, sessionIndex?: number, currentPIDs?: PIDConfiguration, onProgress?: (progress: AnalysisProgress) => void): Promise<PIDAnalysisResult>;

  // Snapshot Restore
  restoreSnapshot(id: string, createBackup: boolean): Promise<SnapshotRestoreResult>;
  onRestoreProgress(callback: (progress: SnapshotRestoreProgress) => void): () => void;

  // Tuning
  applyRecommendations(input: ApplyRecommendationsInput): Promise<ApplyRecommendationsResult>;
  onApplyProgress(callback: (progress: ApplyRecommendationsProgress) => void): () => void;

  // Tuning Session
  getTuningSession(): Promise<TuningSession | null>;
  startTuningSession(): Promise<TuningSession>;
  updateTuningPhase(phase: TuningPhase, data?: Partial<TuningSession>): Promise<TuningSession>;
  resetTuningSession(): Promise<void>;
  onTuningSessionChanged(callback: (session: TuningSession | null) => void): () => void;

  // Events
  onError(callback: (error: string) => void): () => void;
  onLog(callback: (message: string, level: string) => void): () => void;
  onProfileChanged(callback: (profile: DroneProfile | null) => void): () => void;
  onNewFCDetected(callback: (fcSerial: string, fcInfo: FCInfo) => void): () => void;
  onPIDChanged(callback: (config: PIDConfiguration) => void): () => void;
}

declare global {
  interface Window {
    betaflight: BetaflightAPI;
  }
}
