import { v4 as uuidv4 } from 'uuid';
import { FileStorage } from './FileStorage';
import type { MSPClient } from '../msp/MSPClient';
import type { ConfigurationSnapshot, SnapshotMetadata, FCInfo } from '@shared/types/common.types';
import { SnapshotError } from '../utils/errors';
import { logger } from '../utils/logger';
import { APP_VERSION, SNAPSHOT } from '@shared/constants';

export class SnapshotManager {
  private storage: FileStorage;
  private mspClient: MSPClient;
  private baselineId: string | null = null;

  constructor(storagePath: string, mspClient: MSPClient) {
    this.storage = new FileStorage(storagePath);
    this.mspClient = mspClient;
  }

  async initialize(): Promise<void> {
    await this.storage.ensureDirectory();
  }

  async createSnapshot(label?: string, type: 'baseline' | 'manual' | 'auto' = 'manual'): Promise<ConfigurationSnapshot> {
    if (!this.mspClient.isConnected()) {
      throw new SnapshotError('Not connected to FC');
    }

    try {
      // Get FC info
      const fcInfo = await this.mspClient.getFCInfo();

      // Export configuration
      const cliDiff = await this.mspClient.exportCLIDiff();

      // Create snapshot
      const snapshot: ConfigurationSnapshot = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        label: label || this.generateLabel(type),
        type,
        fcInfo,
        configuration: {
          cliDiff
        },
        metadata: {
          appVersion: APP_VERSION,
          createdBy: type === 'auto' ? 'auto' : 'user'
        }
      };

      // Save to storage
      await this.storage.saveSnapshot(snapshot);

      // Track baseline
      if (type === 'baseline') {
        this.baselineId = snapshot.id;
      }

      logger.info(`Snapshot created: ${snapshot.id} (${snapshot.label})`);
      return snapshot;
    } catch (error) {
      throw new SnapshotError('Failed to create snapshot', error);
    }
  }

  async createBaselineIfMissing(): Promise<void> {
    const snapshots = await this.listSnapshots();
    const hasBaseline = snapshots.some(s => s.type === 'baseline');

    if (!hasBaseline) {
      logger.info('No baseline found, creating one...');
      const baseline = await this.createSnapshot(SNAPSHOT.BASELINE_LABEL, 'baseline');
      this.baselineId = baseline.id;
    }
  }

  async loadSnapshot(id: string): Promise<ConfigurationSnapshot> {
    try {
      return await this.storage.loadSnapshot(id);
    } catch (error) {
      throw new SnapshotError(`Failed to load snapshot ${id}`, error);
    }
  }

  async deleteSnapshot(id: string): Promise<void> {
    // Prevent deleting baseline
    if (id === this.baselineId) {
      throw new SnapshotError('Cannot delete baseline snapshot');
    }

    try {
      await this.storage.deleteSnapshot(id);
    } catch (error) {
      throw new SnapshotError(`Failed to delete snapshot ${id}`, error);
    }
  }

  async listSnapshots(): Promise<SnapshotMetadata[]> {
    try {
      const ids = await this.storage.listSnapshots();
      const snapshots: SnapshotMetadata[] = [];

      for (const id of ids) {
        const snapshot = await this.storage.loadSnapshot(id);
        snapshots.push({
          id: snapshot.id,
          timestamp: snapshot.timestamp,
          label: snapshot.label,
          type: snapshot.type,
          fcInfo: {
            variant: snapshot.fcInfo.variant,
            version: snapshot.fcInfo.version,
            boardName: snapshot.fcInfo.boardName
          }
        });
      }

      // Sort by timestamp (newest first)
      return snapshots.sort((a, b) => {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
    } catch (error) {
      throw new SnapshotError('Failed to list snapshots', error);
    }
  }

  async exportSnapshot(id: string, destinationPath: string): Promise<void> {
    try {
      await this.storage.exportSnapshot(id, destinationPath);
    } catch (error) {
      throw new SnapshotError(`Failed to export snapshot ${id}`, error);
    }
  }

  async getBaseline(): Promise<ConfigurationSnapshot | null> {
    if (!this.baselineId) {
      const snapshots = await this.listSnapshots();
      const baseline = snapshots.find(s => s.type === 'baseline');
      if (baseline) {
        this.baselineId = baseline.id;
      }
    }

    if (this.baselineId) {
      return await this.loadSnapshot(this.baselineId);
    }

    return null;
  }

  private generateLabel(type: 'baseline' | 'manual' | 'auto'): string {
    const now = new Date();
    const dateStr = now.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    switch (type) {
      case 'baseline':
        return SNAPSHOT.BASELINE_LABEL;
      case 'manual':
        return `Manual backup - ${dateStr}`;
      case 'auto':
        return `Auto backup - ${dateStr}`;
    }
  }
}
