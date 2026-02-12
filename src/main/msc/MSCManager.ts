import fs from 'fs/promises';
import { basename, join } from 'path';
import { logger } from '../utils/logger';
import { snapshotVolumes, detectNewDrive, findLogFiles, ejectDrive, DetectedDrive } from './driveDetector';
import type { MSPClient } from '../msp/MSPClient';

export interface MSCProgress {
  stage: 'entering_msc' | 'waiting_mount' | 'copying' | 'erasing' | 'ejecting' | 'waiting_reconnect';
  message: string;
  percent: number;
}

export interface CopiedFile {
  /** Original filename on the SD card */
  originalName: string;
  /** Destination path where the file was copied */
  destPath: string;
  /** File size in bytes */
  size: number;
}

/**
 * Manages Mass Storage Class (MSC) mode for downloading/erasing blackbox logs
 * from SD card-based flight controllers.
 *
 * MSC workflow:
 * 1. Snapshot current volumes
 * 2. Send MSP_REBOOT with MSC type → FC disconnects, re-enumerates as USB drive
 * 3. Detect new volume mount
 * 4. Copy/delete log files
 * 5. Eject drive → FC reboots back to normal
 * 6. Wait for serial port to reappear (handled by caller)
 */
export class MSCManager {
  private mspClient: MSPClient;
  private cancelled: boolean = false;

  constructor(mspClient: MSPClient) {
    this.mspClient = mspClient;
  }

  /**
   * Download all blackbox log files from FC SD card via MSC mode.
   *
   * @param destDir - Directory to copy log files to
   * @param onProgress - Progress callback for UI updates
   * @returns Array of copied files with paths and sizes
   */
  async downloadLogs(
    destDir: string,
    onProgress?: (progress: MSCProgress) => void
  ): Promise<CopiedFile[]> {
    this.cancelled = false;

    // Step 1: Snapshot current volumes before MSC reboot
    onProgress?.({ stage: 'entering_msc', message: 'Preparing mass storage mode...', percent: 1 });
    const volumesBefore = await snapshotVolumes();

    // Step 2: Send MSC reboot command
    onProgress?.({ stage: 'entering_msc', message: 'Rebooting FC into mass storage mode...', percent: 2 });
    const accepted = await this.mspClient.rebootToMSC();
    if (!accepted) {
      throw new Error('FC rejected mass storage mode — SD card may not be ready');
    }

    this.checkCancelled();

    // Step 3: Wait for SD card to mount as USB drive
    onProgress?.({ stage: 'waiting_mount', message: 'Waiting for SD card to mount...', percent: 3 });
    let drive: DetectedDrive;
    try {
      drive = await detectNewDrive(volumesBefore, 30000, 1000);
    } catch (error) {
      throw new Error(
        `Failed to detect SD card: ${error instanceof Error ? error.message : error}. ` +
        'The FC may need a physical button press or power cycle to exit MSC mode.'
      );
    }

    this.checkCancelled();

    // Step 4: Find and copy log files
    // Progress: 5%–90% reserved for copying (bulk of the work)
    onProgress?.({ stage: 'copying', message: 'Scanning for log files...', percent: 5 });
    const logFiles = await findLogFiles(drive.mountPath);

    if (logFiles.length === 0) {
      // No log files — still need to eject
      onProgress?.({ stage: 'ejecting', message: 'No log files found. Ejecting SD card...', percent: 93 });
      await this.safeEject(drive.mountPath);
      onProgress?.({ stage: 'waiting_reconnect', message: 'Waiting for FC to reconnect...', percent: 95 });
      return [];
    }

    const copiedFiles: CopiedFile[] = [];
    await fs.mkdir(destDir, { recursive: true });

    for (let i = 0; i < logFiles.length; i++) {
      this.checkCancelled();

      const srcPath = logFiles[i];
      const filename = basename(srcPath);
      const destPath = join(destDir, filename);

      const progressPercent = 5 + Math.round(((i + 1) / logFiles.length) * 85);
      onProgress?.({
        stage: 'copying',
        message: `Copying ${filename} (${i + 1}/${logFiles.length})...`,
        percent: progressPercent
      });

      const stat = await fs.stat(srcPath);
      await fs.copyFile(srcPath, destPath);

      copiedFiles.push({
        originalName: filename,
        destPath,
        size: stat.size
      });

      logger.info(`Copied ${filename} (${stat.size} bytes)`);
    }

    this.checkCancelled();

    // Step 5: Eject drive
    onProgress?.({ stage: 'ejecting', message: 'Ejecting SD card...', percent: 93 });
    await this.safeEject(drive.mountPath);

    // Step 6: Signal waiting for reconnect (actual reconnect handled by caller)
    onProgress?.({ stage: 'waiting_reconnect', message: 'Waiting for FC to reconnect...', percent: 95 });

    logger.info(`MSC download complete: ${copiedFiles.length} files copied`);
    return copiedFiles;
  }

  /**
   * Erase (delete) all blackbox log files from FC SD card via MSC mode.
   *
   * @param onProgress - Progress callback for UI updates
   */
  async eraseLogs(onProgress?: (progress: MSCProgress) => void): Promise<void> {
    this.cancelled = false;

    // Step 1: Snapshot volumes
    onProgress?.({ stage: 'entering_msc', message: 'Preparing mass storage mode...', percent: 1 });
    const volumesBefore = await snapshotVolumes();

    // Step 2: MSC reboot
    onProgress?.({ stage: 'entering_msc', message: 'Rebooting FC into mass storage mode...', percent: 2 });
    const accepted = await this.mspClient.rebootToMSC();
    if (!accepted) {
      throw new Error('FC rejected mass storage mode — SD card may not be ready');
    }

    this.checkCancelled();

    // Step 3: Wait for mount
    onProgress?.({ stage: 'waiting_mount', message: 'Waiting for SD card to mount...', percent: 3 });
    let drive: DetectedDrive;
    try {
      drive = await detectNewDrive(volumesBefore, 30000, 1000);
    } catch (error) {
      throw new Error(
        `Failed to detect SD card: ${error instanceof Error ? error.message : error}. ` +
        'The FC may need a physical button press or power cycle to exit MSC mode.'
      );
    }

    this.checkCancelled();

    // Step 4: Find and delete log files
    onProgress?.({ stage: 'erasing', message: 'Scanning for log files...', percent: 5 });
    const logFiles = await findLogFiles(drive.mountPath);

    let deleted = 0;
    for (const filePath of logFiles) {
      this.checkCancelled();
      try {
        await fs.unlink(filePath);
        deleted++;
        logger.info(`Deleted ${basename(filePath)}`);
      } catch (error) {
        logger.warn(`Failed to delete ${basename(filePath)}: ${error}`);
      }
    }

    logger.info(`Deleted ${deleted}/${logFiles.length} log files`);

    // Step 5: Eject
    onProgress?.({ stage: 'ejecting', message: 'Ejecting SD card...', percent: 93 });
    await this.safeEject(drive.mountPath);

    // Step 6: Wait for reconnect
    onProgress?.({ stage: 'waiting_reconnect', message: 'Waiting for FC to reconnect...', percent: 95 });
  }

  /**
   * Cancel the current MSC operation.
   * The operation will throw at the next checkpoint.
   */
  cancelOperation(): void {
    this.cancelled = true;
  }

  private checkCancelled(): void {
    if (this.cancelled) {
      throw new Error('MSC operation cancelled');
    }
  }

  private async safeEject(mountPath: string): Promise<void> {
    try {
      await ejectDrive(mountPath);
    } catch (error) {
      logger.error('Failed to eject drive:', error);
      throw new Error(
        `Failed to eject SD card: ${error instanceof Error ? error.message : error}. ` +
        'Please safely remove the drive manually and power cycle the FC.'
      );
    }
  }
}
