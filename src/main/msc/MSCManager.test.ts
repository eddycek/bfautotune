import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MSCManager } from './MSCManager';
import type { MSCProgress } from './MSCManager';

const { mockSnapshotVolumes, mockDetectNewDrive, mockFindLogFiles, mockEjectDrive } = vi.hoisted(
  () => ({
    mockSnapshotVolumes: vi.fn(),
    mockDetectNewDrive: vi.fn(),
    mockFindLogFiles: vi.fn(),
    mockEjectDrive: vi.fn(),
  })
);

const { mockStat, mockMkdir, mockCopyFile, mockUnlink } = vi.hoisted(() => ({
  mockStat: vi.fn(),
  mockMkdir: vi.fn(),
  mockCopyFile: vi.fn(),
  mockUnlink: vi.fn(),
}));

vi.mock('./driveDetector', () => ({
  snapshotVolumes: mockSnapshotVolumes,
  detectNewDrive: mockDetectNewDrive,
  findLogFiles: mockFindLogFiles,
  ejectDrive: mockEjectDrive,
}));

vi.mock('fs/promises', () => ({
  default: {
    stat: mockStat,
    mkdir: mockMkdir,
    copyFile: mockCopyFile,
    unlink: mockUnlink,
  },
  stat: mockStat,
  mkdir: mockMkdir,
  copyFile: mockCopyFile,
  unlink: mockUnlink,
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function createMockMSPClient() {
  return {
    rebootToMSC: vi.fn(),
  } as any;
}

describe('MSCManager', () => {
  let mspClient: ReturnType<typeof createMockMSPClient>;
  let manager: MSCManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mspClient = createMockMSPClient();
    manager = new MSCManager(mspClient);
  });

  describe('downloadLogs', () => {
    it('completes full download cycle', async () => {
      const volumesBefore = new Set(['/Volumes/Macintosh HD']);
      mockSnapshotVolumes.mockResolvedValue(volumesBefore);
      mspClient.rebootToMSC.mockResolvedValue(true);
      mockDetectNewDrive.mockResolvedValue({ mountPath: '/Volumes/BLACKBOX', label: 'BLACKBOX' });
      mockFindLogFiles.mockResolvedValue(['/Volumes/BLACKBOX/BTFL_001.BBL']);
      mockStat.mockResolvedValue({ size: 1024 * 1024 });
      mockMkdir.mockResolvedValue(undefined);
      mockCopyFile.mockResolvedValue(undefined);
      mockEjectDrive.mockResolvedValue(undefined);

      const progressCalls: MSCProgress[] = [];
      const result = await manager.downloadLogs('/tmp/logs', (p) => progressCalls.push(p));

      expect(result).toHaveLength(1);
      expect(result[0].originalName).toBe('BTFL_001.BBL');
      expect(result[0].size).toBe(1024 * 1024);
      expect(result[0].destPath).toBe('/tmp/logs/BTFL_001.BBL');

      // Verify progress stages
      const stages = progressCalls.map((p) => p.stage);
      expect(stages).toContain('entering_msc');
      expect(stages).toContain('waiting_mount');
      expect(stages).toContain('copying');
      expect(stages).toContain('ejecting');
      expect(stages).toContain('waiting_reconnect');
    });

    it('throws when FC rejects MSC mode', async () => {
      mockSnapshotVolumes.mockResolvedValue(new Set());
      mspClient.rebootToMSC.mockResolvedValue(false);

      await expect(manager.downloadLogs('/tmp/logs')).rejects.toThrow(
        /FC rejected mass storage mode/
      );
    });

    it('throws when drive detection times out', async () => {
      mockSnapshotVolumes.mockResolvedValue(new Set());
      mspClient.rebootToMSC.mockResolvedValue(true);
      mockDetectNewDrive.mockRejectedValue(new Error('SD card not detected within 30s'));

      await expect(manager.downloadLogs('/tmp/logs')).rejects.toThrow(/Failed to detect SD card/);
    });

    it('returns empty array and ejects when no log files found', async () => {
      mockSnapshotVolumes.mockResolvedValue(new Set());
      mspClient.rebootToMSC.mockResolvedValue(true);
      mockDetectNewDrive.mockResolvedValue({ mountPath: '/Volumes/BLACKBOX', label: 'BLACKBOX' });
      mockFindLogFiles.mockResolvedValue([]);
      mockEjectDrive.mockResolvedValue(undefined);

      const result = await manager.downloadLogs('/tmp/logs');

      expect(result).toEqual([]);
      expect(mockEjectDrive).toHaveBeenCalledWith('/Volumes/BLACKBOX');
    });

    it('copies multiple files with correct progress', async () => {
      mockSnapshotVolumes.mockResolvedValue(new Set());
      mspClient.rebootToMSC.mockResolvedValue(true);
      mockDetectNewDrive.mockResolvedValue({ mountPath: '/Volumes/BLACKBOX', label: 'BLACKBOX' });
      mockFindLogFiles.mockResolvedValue([
        '/Volumes/BLACKBOX/BTFL_001.BBL',
        '/Volumes/BLACKBOX/BTFL_002.BBL',
        '/Volumes/BLACKBOX/BTFL_003.BBL',
      ]);
      mockStat.mockResolvedValue({ size: 500 });
      mockMkdir.mockResolvedValue(undefined);
      mockCopyFile.mockResolvedValue(undefined);
      mockEjectDrive.mockResolvedValue(undefined);

      const result = await manager.downloadLogs('/tmp/logs');

      expect(result).toHaveLength(3);
      expect(mockCopyFile).toHaveBeenCalledTimes(3);
    });

    it('throws error when file copy stalls', async () => {
      vi.useFakeTimers();

      mockSnapshotVolumes.mockResolvedValue(new Set());
      mspClient.rebootToMSC.mockResolvedValue(true);
      mockDetectNewDrive.mockResolvedValue({ mountPath: '/Volumes/BLACKBOX', label: 'BLACKBOX' });
      mockFindLogFiles.mockResolvedValue(['/Volumes/BLACKBOX/BTFL_001.BBL']);
      mockStat.mockResolvedValue({ size: 1024 });
      mockMkdir.mockResolvedValue(undefined);
      // copyFile never resolves — simulates a stalled copy
      mockCopyFile.mockImplementation(() => new Promise(() => {}));
      mockEjectDrive.mockResolvedValue(undefined);

      // Attach rejection handler before advancing timers to avoid unhandled rejection
      const downloadPromise = manager.downloadLogs('/tmp/logs').catch((e: Error) => e);

      // Advance past the 120s copy timeout
      await vi.advanceTimersByTimeAsync(120_000);

      const error = await downloadPromise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/File copy stalled/);

      vi.useRealTimers();
    });

    it('throws error when copied file size does not match source', async () => {
      mockSnapshotVolumes.mockResolvedValue(new Set());
      mspClient.rebootToMSC.mockResolvedValue(true);
      mockDetectNewDrive.mockResolvedValue({ mountPath: '/Volumes/BLACKBOX', label: 'BLACKBOX' });
      mockFindLogFiles.mockResolvedValue(['/Volumes/BLACKBOX/BTFL_001.BBL']);
      mockMkdir.mockResolvedValue(undefined);
      mockCopyFile.mockResolvedValue(undefined);
      mockEjectDrive.mockResolvedValue(undefined);

      // Source file is 1 MB, but destination is only 512 KB (incomplete copy)
      mockStat
        .mockResolvedValueOnce({ size: 1024 * 1024 }) // fs.stat(srcPath)
        .mockResolvedValueOnce({ size: 512 * 1024 }); // fs.stat(destPath)

      await expect(manager.downloadLogs('/tmp/logs')).rejects.toThrow(
        /File copy verification failed.*expected 1048576 bytes, got 524288 bytes/
      );
    });

    it('throws on cancel during download', async () => {
      mockSnapshotVolumes.mockResolvedValue(new Set());
      mspClient.rebootToMSC.mockResolvedValue(true);
      mockDetectNewDrive.mockResolvedValue({ mountPath: '/Volumes/BLACKBOX', label: 'BLACKBOX' });
      mockFindLogFiles.mockResolvedValue(['/Volumes/BLACKBOX/BTFL_001.BBL']);
      mockStat.mockResolvedValue({ size: 100 });
      mockMkdir.mockResolvedValue(undefined);

      // Cancel before copy completes
      mockCopyFile.mockImplementation(async () => {
        manager.cancelOperation();
      });

      await expect(manager.downloadLogs('/tmp/logs')).rejects.toThrow('MSC operation cancelled');
    });
  });

  describe('eraseLogs', () => {
    it('completes full erase cycle', async () => {
      mockSnapshotVolumes.mockResolvedValue(new Set());
      mspClient.rebootToMSC.mockResolvedValue(true);
      mockDetectNewDrive.mockResolvedValue({ mountPath: '/Volumes/BLACKBOX', label: 'BLACKBOX' });
      mockFindLogFiles.mockResolvedValue([
        '/Volumes/BLACKBOX/BTFL_001.BBL',
        '/Volumes/BLACKBOX/BTFL_002.BBL',
      ]);
      mockUnlink.mockResolvedValue(undefined);
      mockEjectDrive.mockResolvedValue(undefined);

      const progressCalls: MSCProgress[] = [];
      await manager.eraseLogs((p) => progressCalls.push(p));

      expect(mockUnlink).toHaveBeenCalledTimes(2);
      expect(mockEjectDrive).toHaveBeenCalled();

      const stages = progressCalls.map((p) => p.stage);
      expect(stages).toContain('erasing');
      expect(stages).toContain('ejecting');
    });

    it('throws when FC rejects MSC mode', async () => {
      mockSnapshotVolumes.mockResolvedValue(new Set());
      mspClient.rebootToMSC.mockResolvedValue(false);

      await expect(manager.eraseLogs()).rejects.toThrow(/FC rejected mass storage mode/);
    });

    it('continues erasing when individual file deletion fails', async () => {
      mockSnapshotVolumes.mockResolvedValue(new Set());
      mspClient.rebootToMSC.mockResolvedValue(true);
      mockDetectNewDrive.mockResolvedValue({ mountPath: '/Volumes/BLACKBOX', label: 'BLACKBOX' });
      mockFindLogFiles.mockResolvedValue([
        '/Volumes/BLACKBOX/BTFL_001.BBL',
        '/Volumes/BLACKBOX/BTFL_002.BBL',
      ]);
      mockUnlink
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValueOnce(undefined);
      mockEjectDrive.mockResolvedValue(undefined);

      // Should not throw — individual file failure is non-fatal
      await manager.eraseLogs();

      expect(mockUnlink).toHaveBeenCalledTimes(2);
      expect(mockEjectDrive).toHaveBeenCalled();
    });

    it('passes requireLogFiles: false to detectNewDrive', async () => {
      mockSnapshotVolumes.mockResolvedValue(new Set(['/Volumes/Macintosh HD']));
      mspClient.rebootToMSC.mockResolvedValue(true);
      mockDetectNewDrive.mockResolvedValue({ mountPath: '/Volumes/BLACKBOX', label: 'BLACKBOX' });
      mockFindLogFiles.mockResolvedValue([]);
      mockEjectDrive.mockResolvedValue(undefined);

      await manager.eraseLogs();

      expect(mockDetectNewDrive).toHaveBeenCalledWith(
        new Set(['/Volumes/Macintosh HD']),
        30000,
        1000,
        { requireLogFiles: false }
      );
    });

    it('completes erase on empty SD card (no log files)', async () => {
      mockSnapshotVolumes.mockResolvedValue(new Set());
      mspClient.rebootToMSC.mockResolvedValue(true);
      mockDetectNewDrive.mockResolvedValue({ mountPath: '/Volumes/BLACKBOX', label: 'BLACKBOX' });
      mockFindLogFiles.mockResolvedValue([]);
      mockEjectDrive.mockResolvedValue(undefined);

      const progressCalls: MSCProgress[] = [];
      await manager.eraseLogs((p) => progressCalls.push(p));

      expect(mockUnlink).not.toHaveBeenCalled();
      expect(mockEjectDrive).toHaveBeenCalledWith('/Volumes/BLACKBOX');
      const stages = progressCalls.map((p) => p.stage);
      expect(stages).toContain('ejecting');
    });

    it('throws on cancel during erase', async () => {
      mockSnapshotVolumes.mockResolvedValue(new Set());
      mspClient.rebootToMSC.mockResolvedValue(true);
      mockDetectNewDrive.mockResolvedValue({ mountPath: '/Volumes/BLACKBOX', label: 'BLACKBOX' });
      mockFindLogFiles.mockResolvedValue([
        '/Volumes/BLACKBOX/BTFL_001.BBL',
        '/Volumes/BLACKBOX/BTFL_002.BBL',
      ]);

      // Cancel during first file deletion — caught on second iteration's checkCancelled
      mockUnlink.mockImplementation(async () => {
        manager.cancelOperation();
      });

      await expect(manager.eraseLogs()).rejects.toThrow('MSC operation cancelled');
    });
  });

  describe('cancelOperation', () => {
    it('sets cancelled flag', async () => {
      // Cancel before any operation
      manager.cancelOperation();

      // Next operation should fail at first checkpoint
      mockSnapshotVolumes.mockResolvedValue(new Set());
      mspClient.rebootToMSC.mockResolvedValue(true);

      await expect(manager.downloadLogs('/tmp/logs')).rejects.toThrow('MSC operation cancelled');
    });
  });

  describe('safeEject', () => {
    it('wraps eject errors with user-friendly message', async () => {
      mockSnapshotVolumes.mockResolvedValue(new Set());
      mspClient.rebootToMSC.mockResolvedValue(true);
      mockDetectNewDrive.mockResolvedValue({ mountPath: '/Volumes/BLACKBOX', label: 'BLACKBOX' });
      mockFindLogFiles.mockResolvedValue(['/Volumes/BLACKBOX/BTFL_001.BBL']);
      mockStat.mockResolvedValue({ size: 100 });
      mockMkdir.mockResolvedValue(undefined);
      mockCopyFile.mockResolvedValue(undefined);
      mockEjectDrive.mockRejectedValue(new Error('diskutil failed'));

      await expect(manager.downloadLogs('/tmp/logs')).rejects.toThrow(
        /Failed to eject SD card.*safely remove/
      );
    });
  });
});
