import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { snapshotVolumes, detectNewDrive, findLogFiles, ejectDrive } from './driveDetector';

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
    it('finds BBL files matching BF patterns', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'BTFL_001.BBL',
        'BTFL_002.BBL',
        'LOG00001.TXT',
        'README.txt',
        'config.txt',
      ] as any);

      const result = await findLogFiles('/Volumes/BLACKBOX');

      expect(result).toEqual([
        '/Volumes/BLACKBOX/BTFL_001.BBL',
        '/Volumes/BLACKBOX/BTFL_002.BBL',
        '/Volumes/BLACKBOX/LOG00001.TXT',
      ]);
    });

    it('returns empty array when no log files found', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['config.txt', 'notes.md'] as any);

      const result = await findLogFiles('/Volumes/BLACKBOX');

      expect(result).toEqual([]);
    });

    it('matches .BFL files', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['flight.BFL'] as any);

      const result = await findLogFiles('/Volumes/BLACKBOX');

      expect(result).toEqual(['/Volumes/BLACKBOX/flight.BFL']);
    });

    it('returns sorted results', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'BTFL_003.BBL',
        'BTFL_001.BBL',
        'BTFL_002.BBL',
      ] as any);

      const result = await findLogFiles('/Volumes/BLACKBOX');

      expect(result).toEqual([
        '/Volumes/BLACKBOX/BTFL_001.BBL',
        '/Volumes/BLACKBOX/BTFL_002.BBL',
        '/Volumes/BLACKBOX/BTFL_003.BBL',
      ]);
    });
  });

  describe('detectNewDrive', () => {
    it('detects new volume with BF log files', async () => {
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
        // hasBFLogFiles check
        if (path === '/Volumes/BLACKBOX') {
          return ['BTFL_001.BBL'] as any;
        }
        return [] as any;
      });

      const result = await detectNewDrive(before, 5000, 50);

      expect(result.mountPath).toBe('/Volumes/BLACKBOX');
      expect(result.label).toBe('BLACKBOX');
    });

    it('throws on timeout when no new volume detected', async () => {
      setPlatform('darwin');

      const before = new Set(['/Volumes/Macintosh HD']);
      vi.mocked(fs.readdir).mockResolvedValue(['Macintosh HD'] as any);

      await expect(detectNewDrive(before, 200, 50)).rejects.toThrow(/not detected within/);
    });

    it('ignores new volumes without BF log files', async () => {
      setPlatform('darwin');

      const before = new Set(['/Volumes/Macintosh HD']);

      vi.mocked(fs.readdir).mockImplementation(async (path: any) => {
        if (path === '/Volumes') {
          return ['Macintosh HD', 'THUMB_DRIVE'] as any;
        }
        // THUMB_DRIVE has no BF logs
        if (path === '/Volumes/THUMB_DRIVE') {
          return ['photo.jpg', 'document.pdf'] as any;
        }
        return [] as any;
      });

      await expect(detectNewDrive(before, 300, 50)).rejects.toThrow(/not detected within/);
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
