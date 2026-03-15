import { autoUpdater } from 'electron-updater';
import { app } from 'electron';
import { IPCChannel } from '@shared/types/ipc.types';
import { getMainWindow } from './window';
import { logger } from './utils/logger';

const UPDATE_CHECK_DELAY_MS = 10_000;

/**
 * Initialize auto-updater.
 * Checks for updates after a short delay, downloads in background,
 * and notifies the renderer when ready. Never forces a restart.
 */
export function initAutoUpdater(): void {
  // Only run in packaged app (not dev mode)
  if (!app.isPackaged) {
    logger.info('Auto-updater: skipped (dev mode)');
    return;
  }

  autoUpdater.logger = logger;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    logger.info('Auto-updater: checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    logger.info(`Auto-updater: update available — v${info.version}`);
    const window = getMainWindow();
    if (window) {
      window.webContents.send(IPCChannel.EVENT_UPDATE_AVAILABLE, {
        version: info.version,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    logger.info('Auto-updater: no update available');
  });

  autoUpdater.on('download-progress', (progress) => {
    logger.info(`Auto-updater: downloading ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    logger.info(`Auto-updater: v${info.version} downloaded, ready to install`);
    const window = getMainWindow();
    if (window) {
      window.webContents.send(IPCChannel.EVENT_UPDATE_DOWNLOADED, {
        version: info.version,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      });
    }
  });

  autoUpdater.on('error', (err) => {
    logger.warn('Auto-updater error:', err.message);
  });

  // Check after delay to avoid blocking app startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      logger.warn('Auto-updater: check failed:', err.message);
    });
  }, UPDATE_CHECK_DELAY_MS);
}

/** Manually trigger an update check */
export function checkForUpdates(): Promise<void> {
  return autoUpdater.checkForUpdates().then(() => {});
}

/** Quit the app and install the downloaded update */
export function quitAndInstall(): void {
  autoUpdater.quitAndInstall(false, true);
}
