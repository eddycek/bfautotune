import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import type { ConfigurationSnapshot } from '@shared/types/common.types';
import { SnapshotError } from '../utils/errors';
import { logger } from '../utils/logger';

export class FileStorage {
  constructor(private storagePath: string) {}

  async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
    } catch (error) {
      throw new SnapshotError('Failed to create storage directory', error);
    }
  }

  async saveSnapshot(snapshot: ConfigurationSnapshot): Promise<void> {
    await this.ensureDirectory();

    const filePath = join(this.storagePath, `${snapshot.id}.json`);

    try {
      const json = JSON.stringify(snapshot, null, 2);
      await fs.writeFile(filePath, json, 'utf-8');
      logger.info(`Snapshot saved: ${snapshot.id}`);
    } catch (error) {
      throw new SnapshotError(`Failed to save snapshot ${snapshot.id}`, error);
    }
  }

  async loadSnapshot(id: string): Promise<ConfigurationSnapshot> {
    const filePath = join(this.storagePath, `${id}.json`);

    try {
      const json = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(json);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new SnapshotError(`Snapshot not found: ${id}`);
      }
      throw new SnapshotError(`Failed to load snapshot ${id}`, error);
    }
  }

  async deleteSnapshot(id: string): Promise<void> {
    const filePath = join(this.storagePath, `${id}.json`);

    try {
      await fs.unlink(filePath);
      logger.info(`Snapshot deleted: ${id}`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new SnapshotError(`Snapshot not found: ${id}`);
      }
      throw new SnapshotError(`Failed to delete snapshot ${id}`, error);
    }
  }

  async listSnapshots(): Promise<string[]> {
    await this.ensureDirectory();

    try {
      const files = await fs.readdir(this.storagePath);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch (error) {
      throw new SnapshotError('Failed to list snapshots', error);
    }
  }

  async snapshotExists(id: string): Promise<boolean> {
    const filePath = join(this.storagePath, `${id}.json`);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async exportSnapshot(id: string, destinationPath: string): Promise<void> {
    const sourcePath = join(this.storagePath, `${id}.json`);

    try {
      // Ensure destination directory exists
      await fs.mkdir(dirname(destinationPath), { recursive: true });

      // Copy file
      await fs.copyFile(sourcePath, destinationPath);
      logger.info(`Snapshot exported: ${id} -> ${destinationPath}`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new SnapshotError(`Snapshot not found: ${id}`);
      }
      throw new SnapshotError(`Failed to export snapshot ${id}`, error);
    }
  }
}
