import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import { exec } from 'child_process';
import {
  snapshotVolumes,
  detectNewDrive,
  findLogFiles,
  ejectDrive,
  getExternalDisksDarwin,
  mountDiskDarwin,
} from './driveDetector';

const { mockReaddir, mockStat, mockExecFn } = vi.hoisted(() => ({
  mockReaddir: vi.fn(),
  mockStat: vi.fn(),
  mockExecFn: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    readdir: mockReaddir,
    stat: mockStat,
    mkdir: vi.fn(),
    copyFile: vi.fn(),
    unlink: vi.fn(),
  },
  readdir: mockReaddir,
  stat: mockStat,
  mkdir: vi.fn(),
  copyFile: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock('child_process', () => ({
  default: { exec: mockExecFn },
  exec: mockExecFn,
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Helper to set process.platform for tests
function setPlatform(platform: string) {
  Object.defineProperty(process, 'platform', { value: platform, writable: true });
}

// Helper to mock exec returning stdout
function mockExec(stdout: string) {
  vi.mocked(exec).mockImplementation((_cmd: string, callback: any) => {
    callback(null, { stdout, stderr: '' });
    return {} as any;
  });
}

describe('driveDetector', () => {
  let originalPlatform: string;

  beforeEach(() => {
    vi.clearAllMocks();
    originalPlatform = process.platform;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
  });

  describe('snapshotVolumes', () => {
    it('reads /Volumes on macOS', async () => {
      setPlatform('darwin');
      vi.mocked(fs.readdir).mockResolvedValue(['Macintosh HD', 'BLACKBOX'] as any);

      const result = await snapshotVolumes();

      expect(fs.readdir).toHaveBeenCalledWith('/Volumes');
      expect(result).toEqual(new Set(['/Volumes/Macintosh HD', '/Volumes/BLACKBOX']));
    });

    it('returns empty set on macOS readdir failure', async () => {
      setPlatform('darwin');
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

      const result = await snapshotVolumes();

      expect(result).toEqual(new Set());
    });

    it('uses PowerShell on Windows', async () => {
      setPlatform('win32');
      mockExec('C\nD\nE\n');

      const result = await snapshotVolumes();

      expect(exec).toHaveBeenCalled();
      expect(result).toEqual(new Set(['C:\\', 'D:\\', 'E:\\']));
    });

    it('returns empty set on Windows PowerShell failure', async () => {
      setPlatform('win32');
      vi.mocked(exec).mockImplementation((_cmd: string, callback: any) => {
        callback(new Error('PowerShell not found'), { stdout: '', stderr: '' });
        return {} as any;
      });

      const result = await snapshotVolumes();

      expect(result).toEqual(new Set());
    });

    it('reads /media and /run/media on Linux', async () => {
      setPlatform('linux');
      const originalUser = process.env.USER;
      process.env.USER = 'testuser';

      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['USB_DRIVE'] as any) // /media/testuser
        .mockRejectedValueOnce(new Error('ENOENT')); // /run/media/testuser

      const result = await snapshotVolumes();

      expect(result).toEqual(new Set(['/media/testuser/USB_DRIVE']));
      process.env.USER = originalUser;
    });

    it('throws on unsupported platform', async () => {
      setPlatform('freebsd');

      await expect(snapshotVolumes()).rejects.toThrow('Unsupported platform: freebsd');
    });
  });

  describe('findLogFiles', () => {
    /** Mock readdir: return files for a specific path, ENOENT for others */
    function mockReaddirForPath(pathFiles: Record<string, string[]>) {
      vi.mocked(fs.readdir).mockImplementation(async (path: any) => {
        if (pathFiles[path]) return pathFiles[path] as any;
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
    }

    it('finds BBL files matching BF patterns in root', async () => {
      mockReaddirForPath({
        '/Volumes/BLACKBOX': [
          'BTFL_001.BBL',
          'BTFL_002.BBL',
          'LOG00001.TXT',
          'README.txt',
          'config.txt',
        ],
      });

      const result = await findLogFiles('/Volumes/BLACKBOX');

      expect(result).toEqual([
        '/Volumes/BLACKBOX/BTFL_001.BBL',
        '/Volumes/BLACKBOX/BTFL_002.BBL',
        '/Volumes/BLACKBOX/LOG00001.TXT',
      ]);
    });

    it('finds BBL files in LOGS subdirectory', async () => {
      mockReaddirForPath({
        '/Volumes/BLACKBOX': ['config.txt'],
        '/Volumes/BLACKBOX/LOGS': ['BTFL_001.BBL', 'BTFL_002.BBL'],
      });

      const result = await findLogFiles('/Volumes/BLACKBOX');

      expect(result).toEqual([
        '/Volumes/BLACKBOX/LOGS/BTFL_001.BBL',
        '/Volumes/BLACKBOX/LOGS/BTFL_002.BBL',
      ]);
    });

    it('returns empty array when no log files found anywhere', async () => {
      mockReaddirForPath({
        '/Volumes/BLACKBOX': ['config.txt', 'notes.md'],
      });

      const result = await findLogFiles('/Volumes/BLACKBOX');

      expect(result).toEqual([]);
    });

    it('matches .BFL files', async () => {
      mockReaddirForPath({
        '/Volumes/BLACKBOX': ['flight.BFL'],
      });

      const result = await findLogFiles('/Volumes/BLACKBOX');

      expect(result).toEqual(['/Volumes/BLACKBOX/flight.BFL']);
    });

    it('returns sorted results from multiple directories', async () => {
      mockReaddirForPath({
        '/Volumes/BLACKBOX': ['BTFL_003.BBL'],
        '/Volumes/BLACKBOX/LOGS': ['BTFL_001.BBL', 'BTFL_002.BBL'],
      });

      const result = await findLogFiles('/Volumes/BLACKBOX');

      expect(result).toEqual([
        '/Volumes/BLACKBOX/BTFL_003.BBL',
        '/Volumes/BLACKBOX/LOGS/BTFL_001.BBL',
        '/Volumes/BLACKBOX/LOGS/BTFL_002.BBL',
      ]);
    });
  });

  describe('detectNewDrive', () => {
    it('detects new volume with BF log files in root', async () => {
      setPlatform('darwin');

      const before = new Set(['/Volumes/Macintosh HD']);

      // First poll: no new volumes; Second poll: new volume with BF logs
      let pollCount = 0;
      vi.mocked(fs.readdir).mockImplementation(async (path: any) => {
        if (path === '/Volumes') {
          pollCount++;
          if (pollCount === 1) return ['Macintosh HD'] as any;
          return ['Macintosh HD', 'BLACKBOX'] as any;
        }
        // hasBFLogFiles check — root has log files
        if (path === '/Volumes/BLACKBOX') {
          return ['BTFL_001.BBL'] as any;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const result = await detectNewDrive(before, 5000, 50);

      expect(result.mountPath).toBe('/Volumes/BLACKBOX');
      expect(result.label).toBe('BLACKBOX');
    });

    it('detects new volume with BF log files in LOGS subdir', async () => {
      setPlatform('darwin');

      const before = new Set(['/Volumes/Macintosh HD']);

      vi.mocked(fs.readdir).mockImplementation(async (path: any) => {
        if (path === '/Volumes') {
          return ['Macintosh HD', 'BLACKBOX'] as any;
        }
        // Root has no logs, but LOGS subdir does
        if (path === '/Volumes/BLACKBOX') {
          return ['config.txt'] as any;
        }
        if (path === '/Volumes/BLACKBOX/LOGS') {
          return ['BTFL_001.BBL'] as any;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const result = await detectNewDrive(before, 5000, 50);

      expect(result.mountPath).toBe('/Volumes/BLACKBOX');
      expect(result.label).toBe('BLACKBOX');
    });

    it('throws on timeout when no new volume detected', async () => {
      setPlatform('darwin');

      const before = new Set(['/Volumes/Macintosh HD']);
      vi.mocked(fs.readdir).mockImplementation(async (path: any) => {
        if (path === '/Volumes') return ['Macintosh HD'] as any;
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      await expect(detectNewDrive(before, 200, 50)).rejects.toThrow(/not detected within/);
    });

    it('ignores new volumes without BF log files', async () => {
      setPlatform('darwin');

      const before = new Set(['/Volumes/Macintosh HD']);

      vi.mocked(fs.readdir).mockImplementation(async (path: any) => {
        if (path === '/Volumes') {
          return ['Macintosh HD', 'THUMB_DRIVE'] as any;
        }
        // THUMB_DRIVE has no BF logs anywhere
        if (path === '/Volumes/THUMB_DRIVE') {
          return ['photo.jpg', 'document.pdf'] as any;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      await expect(detectNewDrive(before, 300, 50)).rejects.toThrow(/not detected within/);
    });

    it('accepts new volume without BF logs when requireLogFiles is false', async () => {
      setPlatform('darwin');

      const before = new Set(['/Volumes/Macintosh HD']);

      vi.mocked(fs.readdir).mockImplementation(async (path: any) => {
        if (path === '/Volumes') {
          return ['Macintosh HD', 'BLACKBOX'] as any;
        }
        // BLACKBOX has no BF log files (empty card)
        if (path === '/Volumes/BLACKBOX') {
          return ['config.txt'] as any;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const result = await detectNewDrive(before, 5000, 50, { requireLogFiles: false });

      expect(result.mountPath).toBe('/Volumes/BLACKBOX');
      expect(result.label).toBe('BLACKBOX');
    });

    it('still prefers volume with BF logs even when requireLogFiles is false', async () => {
      setPlatform('darwin');

      const before = new Set(['/Volumes/Macintosh HD']);

      vi.mocked(fs.readdir).mockImplementation(async (path: any) => {
        if (path === '/Volumes') {
          return ['Macintosh HD', 'THUMB_DRIVE', 'BLACKBOX'] as any;
        }
        // THUMB_DRIVE has no BF logs
        if (path === '/Volumes/THUMB_DRIVE') {
          return ['photo.jpg'] as any;
        }
        // BLACKBOX has BF logs
        if (path === '/Volumes/BLACKBOX') {
          return ['BTFL_001.BBL'] as any;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const result = await detectNewDrive(before, 5000, 50, { requireLogFiles: false });

      expect(result.mountPath).toBe('/Volumes/BLACKBOX');
      expect(result.label).toBe('BLACKBOX');
    });

    it('auto-mounts unmounted external disk on macOS when no new volume appears', async () => {
      setPlatform('darwin');

      const before = new Set(['/Volumes/Macintosh HD']);

      // diskutil list external: initially no disks, then new disk appears
      let diskutilCallCount = 0;
      let pollCount = 0;

      vi.mocked(exec).mockImplementation((cmd: string, callback: any) => {
        if (typeof cmd === 'string' && cmd.includes('diskutil list external')) {
          diskutilCallCount++;
          if (diskutilCallCount <= 1) {
            // Initial snapshot: no external disks
            callback(null, { stdout: '(No disks found)\n', stderr: '' });
          } else {
            // After MSC reboot: new external disk
            callback(null, {
              stdout:
                '/dev/disk4 (external, physical):\n   #:  TYPE NAME  SIZE  IDENTIFIER\n   0:  FDisk_partition_scheme  *31.9 GB  disk4\n',
              stderr: '',
            });
          }
        } else if (typeof cmd === 'string' && cmd.includes('diskutil mountDisk')) {
          // Auto-mount succeeds
          callback(null, { stdout: 'Volume BLACKBOX on /dev/disk4s1 mounted\n', stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      });

      vi.mocked(fs.readdir).mockImplementation(async (path: any) => {
        if (path === '/Volumes') {
          pollCount++;
          // First polls: no new volume. After mountDisk: BLACKBOX appears
          if (pollCount <= 3) return ['Macintosh HD'] as any;
          return ['Macintosh HD', 'BLACKBOX'] as any;
        }
        if (path === '/Volumes/BLACKBOX') {
          return ['BTFL_001.BBL'] as any;
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const result = await detectNewDrive(before, 5000, 50, { requireLogFiles: false });

      expect(result.mountPath).toBe('/Volumes/BLACKBOX');
      // Verify diskutil mountDisk was called
      const mountCalls = vi
        .mocked(exec)
        .mock.calls.filter((c) => typeof c[0] === 'string' && c[0].includes('diskutil mountDisk'));
      expect(mountCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getExternalDisksDarwin', () => {
    it('parses disk identifiers from diskutil output', async () => {
      setPlatform('darwin');
      mockExec(
        '/dev/disk4 (external, physical):\n' +
          '   #:  TYPE NAME  SIZE  IDENTIFIER\n' +
          '   0:  FDisk_partition_scheme  *31.9 GB  disk4\n' +
          '   1:  Windows_FAT_32 BLACKBOX  31.9 GB  disk4s1\n'
      );

      const result = await getExternalDisksDarwin();

      expect(result).toEqual(new Set(['/dev/disk4']));
    });

    it('parses multiple external disks', async () => {
      mockExec(
        '/dev/disk4 (external, physical):\n' +
          '   ...\n' +
          '/dev/disk5 (external, physical):\n' +
          '   ...\n'
      );

      const result = await getExternalDisksDarwin();

      expect(result).toEqual(new Set(['/dev/disk4', '/dev/disk5']));
    });

    it('returns empty set when no external disks', async () => {
      mockExec('(No disks found)\n');

      const result = await getExternalDisksDarwin();

      expect(result).toEqual(new Set());
    });

    it('returns empty set on diskutil failure', async () => {
      vi.mocked(exec).mockImplementation((_cmd: string, callback: any) => {
        callback(new Error('diskutil not found'), { stdout: '', stderr: '' });
        return {} as any;
      });

      const result = await getExternalDisksDarwin();

      expect(result).toEqual(new Set());
    });
  });

  describe('mountDiskDarwin', () => {
    it('calls diskutil mountDisk with the disk identifier', async () => {
      mockExec('Volume BLACKBOX on /dev/disk4s1 mounted');

      await mountDiskDarwin('/dev/disk4');

      const execCall = vi.mocked(exec).mock.calls[0][0];
      expect(execCall).toContain('diskutil mountDisk');
      expect(execCall).toContain('/dev/disk4');
    });

    it('does not throw on mount failure', async () => {
      vi.mocked(exec).mockImplementation((_cmd: string, callback: any) => {
        callback(new Error('mount failed'), { stdout: '', stderr: '' });
        return {} as any;
      });

      // Should not throw
      await mountDiskDarwin('/dev/disk4');
    });
  });

  describe('ejectDrive', () => {
    it('uses diskutil on macOS', async () => {
      setPlatform('darwin');
      mockExec('');

      await ejectDrive('/Volumes/BLACKBOX');

      const execCall = vi.mocked(exec).mock.calls[0][0];
      expect(execCall).toContain('diskutil eject');
      expect(execCall).toContain('/Volumes/BLACKBOX');
    });

    it('uses PowerShell on Windows', async () => {
      setPlatform('win32');
      mockExec('');

      await ejectDrive('E:\\');

      const execCall = vi.mocked(exec).mock.calls[0][0];
      expect(execCall).toContain('powershell');
      expect(execCall).toContain('Eject');
    });

    it('uses udisksctl on Linux', async () => {
      setPlatform('linux');

      // findmnt → unmount → power-off
      let callCount = 0;
      vi.mocked(exec).mockImplementation((_cmd: string, callback: any) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: '/dev/sda1\n', stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      });

      await ejectDrive('/media/user/BLACKBOX');

      expect(exec).toHaveBeenCalledTimes(3);
    });

    it('throws on unsupported platform', async () => {
      setPlatform('freebsd');

      await expect(ejectDrive('/mnt/usb')).rejects.toThrow('Unsupported platform: freebsd');
    });

    it('handles Linux power-off failure gracefully', async () => {
      setPlatform('linux');

      let callCount = 0;
      vi.mocked(exec).mockImplementation((_cmd: string, callback: any) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { stdout: '/dev/sda1\n', stderr: '' }); // findmnt
        } else if (callCount === 2) {
          callback(null, { stdout: '', stderr: '' }); // unmount ok
        } else {
          callback(new Error('power-off not supported'), { stdout: '', stderr: '' }); // power-off fails
        }
        return {} as any;
      });

      // Should not throw — power-off failure is non-fatal
      await ejectDrive('/media/user/BLACKBOX');
    });
  });
});
