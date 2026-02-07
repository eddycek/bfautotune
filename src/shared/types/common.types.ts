export interface PortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  productId?: string;
  vendorId?: string;
}

export interface ApiVersionInfo {
  protocol: number;
  major: number;
  minor: number;
}

export interface BoardInfo {
  boardIdentifier: string;
  boardVersion: number;
  boardType: number;
  targetName: string;
  boardName: string;
  manufacturerId: string;
  signature: number[];
  mcuTypeId: number;
  configurationState: number;
}

export interface FCInfo {
  variant: string;
  version: string;
  target: string;
  boardName: string;
  apiVersion: ApiVersionInfo;
}

export interface Configuration {
  cliDiff: string;
  cliDump?: string;
}

export interface ConfigurationSnapshot {
  id: string;
  timestamp: string;
  label: string;
  type: 'baseline' | 'manual' | 'auto';
  fcInfo: FCInfo;
  configuration: Configuration;
  metadata: {
    appVersion: string;
    createdBy: 'user' | 'auto';
    notes?: string;
  };
}

export interface SnapshotMetadata {
  id: string;
  timestamp: string;
  label: string;
  type: 'baseline' | 'manual' | 'auto';
  fcInfo: {
    variant: string;
    version: string;
    boardName: string;
  };
}

export interface ConnectionStatus {
  connected: boolean;
  portPath?: string;
  fcInfo?: FCInfo;
  error?: string;
}
