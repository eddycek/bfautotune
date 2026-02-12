import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

/** File patterns that identify a Betaflight blackbox SD card */
const BF_LOG_PATTERNS = [/^BTFL_\d+\.BBL$/i, /^LOG\d+\.TXT$/i, /\.BBL$/i, /\.BFL$/i];

export interface DetectedDrive {
  /** Mount path (e.g. /Volumes/BLACKBOX) */
  mountPath: string;
  /** Volume label if available */
  label: string;
}

/**
 * Snapshot current mounted volumes (platform-specific).
 * Used to detect new volumes appearing after MSC reboot.
 */
export async function snapshotVolumes(): Promise<Set<string>> {
  switch (process.platform) {
    case 'darwin':
      return snapshotVolumesDarwin();
    case 'win32':
      return snapshotVolumesWin32();
    case 'linux':
      return snapshotVolumesLinux();
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

/**
 * Detect a new volume that appeared since the snapshot.
 * Polls until a new volume with BF log files is found, or timeout.
 *
 * @param before - Volume snapshot taken before MSC reboot
 * @param timeoutMs - Max wait time (default 30s)
 * @param pollIntervalMs - Poll interval (default 1s)
 */
export async function detectNewDrive(
  before: Set<string>,
  timeoutMs: number = 30000,
  pollIntervalMs: number = 1000
): Promise<DetectedDrive> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

    const current = await snapshotVolumes();

    // Find volumes that are new since the snapshot
    const newVolumes: string[] = [];
    for (const vol of current) {
      if (!before.has(vol)) {
        newVolumes.push(vol);
      }
    }

    if (newVolumes.length === 0) continue;

    logger.info(`New volumes detected: ${newVolumes.join(', ')}`);

    // Check each new volume for BF log files
    for (const vol of newVolumes) {
      if (await hasBFLogFiles(vol)) {
        const label = vol.split('/').pop() || vol;
        logger.info(`BF log files found on ${vol}`);
        return { mountPath: vol, label };
      }
    }

    // New volumes appeared but none have BF logs — keep waiting
    // (could be a different USB device)
    logger.debug(`New volumes found but no BF logs: ${newVolumes.join(', ')}`);
  }

  throw new Error(
    `SD card not detected within ${timeoutMs / 1000}s. ` +
    'Make sure the FC is connected via USB and supports mass storage mode.'
  );
}

/**
 * Find all blackbox log files on a mounted drive.
 * Returns absolute paths sorted by name.
 */
export async function findLogFiles(mountPath: string): Promise<string[]> {
  const entries = await fs.readdir(mountPath);
  const logFiles: string[] = [];

  for (const entry of entries) {
    if (BF_LOG_PATTERNS.some(p => p.test(entry))) {
      logFiles.push(`${mountPath}/${entry}`);
    }
  }

  logFiles.sort();
  logger.info(`Found ${logFiles.length} log files on ${mountPath}`);
  return logFiles;
}

/**
 * Eject/unmount a drive (platform-specific).
 */
export async function ejectDrive(mountPath: string): Promise<void> {
  logger.info(`Ejecting drive: ${mountPath}`);

  switch (process.platform) {
    case 'darwin':
      await ejectDarwin(mountPath);
      break;
    case 'win32':
      await ejectWin32(mountPath);
      break;
    case 'linux':
      await ejectLinux(mountPath);
      break;
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }

  logger.info('Drive ejected successfully');
}

// --- Platform: macOS ---

async function snapshotVolumesDarwin(): Promise<Set<string>> {
  try {
    const entries = await fs.readdir('/Volumes');
    return new Set(entries.map(e => `/Volumes/${e}`));
  } catch {
    return new Set();
  }
}

async function ejectDarwin(mountPath: string): Promise<void> {
  // diskutil eject is safe — it cleanly unmounts and powers off the device
  await execAsync(`diskutil eject "${mountPath}"`);
}

// --- Platform: Windows ---

async function snapshotVolumesWin32(): Promise<Set<string>> {
  try {
    const { stdout } = await execAsync(
      'powershell -Command "Get-Volume | Where-Object { $_.DriveLetter } | ForEach-Object { $_.DriveLetter }"'
    );
    const drives = stdout.trim().split('\n').filter(Boolean).map(d => `${d.trim()}:\\`);
    return new Set(drives);
  } catch {
    return new Set();
  }
}

async function ejectWin32(mountPath: string): Promise<void> {
  // Extract drive letter from path like "E:\"
  const driveLetter = mountPath.charAt(0);
  await execAsync(
    `powershell -Command "$vol = Get-Volume -DriveLetter '${driveLetter}'; ` +
    `$eject = New-Object -ComObject Shell.Application; ` +
    `$eject.Namespace(17).ParseName('${driveLetter}:').InvokeVerb('Eject')"`
  );
}

// --- Platform: Linux ---

async function snapshotVolumesLinux(): Promise<Set<string>> {
  const mediaDirs = [
    `/media/${process.env.USER || 'root'}`,
    `/run/media/${process.env.USER || 'root'}`
  ];

  const volumes = new Set<string>();
  for (const dir of mediaDirs) {
    try {
      const entries = await fs.readdir(dir);
      for (const e of entries) {
        volumes.add(`${dir}/${e}`);
      }
    } catch {
      // Directory doesn't exist — fine
    }
  }
  return volumes;
}

async function ejectLinux(mountPath: string): Promise<void> {
  // Find the block device for this mount point
  const { stdout } = await execAsync(`findmnt -n -o SOURCE "${mountPath}"`);
  const device = stdout.trim();
  if (!device) {
    throw new Error(`Cannot find block device for ${mountPath}`);
  }

  // Unmount and power off
  await execAsync(`udisksctl unmount -b "${device}"`);
  // Get parent device (e.g. /dev/sda from /dev/sda1)
  const parentDevice = device.replace(/\d+$/, '');
  try {
    await execAsync(`udisksctl power-off -b "${parentDevice}"`);
  } catch {
    // power-off may not be available — that's ok, unmount is enough
    logger.debug('udisksctl power-off failed (non-fatal)');
  }
}

// --- Helpers ---

async function hasBFLogFiles(volumePath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(volumePath);
    return entries.some(entry => BF_LOG_PATTERNS.some(p => p.test(entry)));
  } catch {
    return false;
  }
}
