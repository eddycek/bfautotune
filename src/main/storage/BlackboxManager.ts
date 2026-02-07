import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { BlackboxLogMetadata } from '@shared/types/blackbox.types';
import { createLogger } from '../utils/logger';

const logger = createLogger('BlackboxManager');

export class BlackboxManager {
  private dataDir: string;
  private logsDir: string;
  private metadataFile: string;

  constructor() {
    this.dataDir = path.join(app.getPath('userData'), 'data');
    this.logsDir = path.join(this.dataDir, 'blackbox-logs');
    this.metadataFile = path.join(this.logsDir, 'logs.json');
  }

  async initialize(): Promise<void> {
    logger.info(`Creating Blackbox logs directory: ${this.logsDir}`);
    await fs.mkdir(this.logsDir, { recursive: true });

    // Create metadata file if it doesn't exist
    try {
      await fs.access(this.metadataFile);
      logger.info('Metadata file already exists');
    } catch {
      logger.info(`Creating metadata file: ${this.metadataFile}`);
      await fs.writeFile(this.metadataFile, JSON.stringify([]));
    }
    logger.info('BlackboxManager initialization complete');
  }

  /**
   * Save a Blackbox log with metadata
   */
  async saveLog(
    data: Buffer,
    profileId: string,
    fcSerial: string,
    fcInfo: { variant: string; version: string; target: string }
  ): Promise<BlackboxLogMetadata> {
    const id = uuidv4();
    const timestamp = new Date().toISOString();
    const filename = `blackbox_${timestamp.replace(/[:.]/g, '-')}.bbl`;
    const filepath = path.join(this.logsDir, filename);

    // Write log file
    await fs.writeFile(filepath, data);

    const metadata: BlackboxLogMetadata = {
      id,
      profileId,
      fcSerial,
      timestamp,
      filename,
      filepath,
      size: data.length,
      fcInfo
    };

    // Update metadata index
    const logs = await this.loadMetadata();
    logs.push(metadata);
    await this.saveMetadata(logs);

    logger.info(`Saved Blackbox log: ${filename} (${data.length} bytes) for profile ${profileId}`);

    return metadata;
  }

  /**
   * List all Blackbox logs for a specific profile
   */
  async listLogs(profileId: string): Promise<BlackboxLogMetadata[]> {
    const allLogs = await this.loadMetadata();
    return allLogs.filter(log => log.profileId === profileId);
  }

  /**
   * List all Blackbox logs (for export/admin)
   */
  async listAllLogs(): Promise<BlackboxLogMetadata[]> {
    return this.loadMetadata();
  }

  /**
   * Get a specific Blackbox log metadata
   */
  async getLog(id: string): Promise<BlackboxLogMetadata | null> {
    const logs = await this.loadMetadata();
    return logs.find(log => log.id === id) || null;
  }

  /**
   * Delete a Blackbox log
   */
  async deleteLog(id: string): Promise<void> {
    const logs = await this.loadMetadata();
    const log = logs.find(l => l.id === id);

    if (!log) {
      throw new Error(`Blackbox log not found: ${id}`);
    }

    // Delete file
    try {
      await fs.unlink(log.filepath);
      logger.info(`Deleted Blackbox log file: ${log.filename}`);
    } catch (error) {
      logger.warn(`Failed to delete Blackbox log file: ${error}`);
      // Continue anyway to remove from metadata
    }

    // Remove from metadata
    const updatedLogs = logs.filter(l => l.id !== id);
    await this.saveMetadata(updatedLogs);

    logger.info(`Deleted Blackbox log: ${id}`);
  }

  /**
   * Delete all logs for a profile (called when profile is deleted)
   */
  async deleteLogsForProfile(profileId: string): Promise<void> {
    const logs = await this.listLogs(profileId);

    for (const log of logs) {
      try {
        await fs.unlink(log.filepath);
      } catch (error) {
        logger.warn(`Failed to delete log file ${log.filename}: ${error}`);
      }
    }

    // Remove from metadata
    const allLogs = await this.loadMetadata();
    const remainingLogs = allLogs.filter(l => l.profileId !== profileId);
    await this.saveMetadata(remainingLogs);

    logger.info(`Deleted ${logs.length} Blackbox logs for profile ${profileId}`);
  }

  /**
   * Export a Blackbox log to a user-specified location
   */
  async exportLog(id: string, destinationPath: string): Promise<void> {
    const log = await this.getLog(id);

    if (!log) {
      throw new Error(`Blackbox log not found: ${id}`);
    }

    await fs.copyFile(log.filepath, destinationPath);
    logger.info(`Exported Blackbox log to: ${destinationPath}`);
  }

  private async loadMetadata(): Promise<BlackboxLogMetadata[]> {
    try {
      const data = await fs.readFile(this.metadataFile, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.warn('Failed to load Blackbox logs metadata, returning empty array');
      return [];
    }
  }

  private async saveMetadata(logs: BlackboxLogMetadata[]): Promise<void> {
    await fs.writeFile(this.metadataFile, JSON.stringify(logs, null, 2));
  }
}
