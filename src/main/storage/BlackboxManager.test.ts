import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Must mock electron before importing BlackboxManager
let testUserDataDir: string;

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return testUserDataDir;
      return '/tmp';
    },
  },
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { BlackboxManager } from './BlackboxManager';

const mockFCInfo = { variant: 'BTFL', version: '4.5.1', target: 'STM32F7X2' };

describe('BlackboxManager', () => {
  let manager: BlackboxManager;
  let logsDir: string;

  beforeEach(async () => {
    testUserDataDir = join(tmpdir(), `bfat-test-bbmgr-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    logsDir = join(testUserDataDir, 'data', 'blackbox-logs');
    manager = new BlackboxManager();
    await manager.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(testUserDataDir, { recursive: true, force: true });
    } catch {}
  });

  // ─── initialize ──────────────────────────────────────────────

  it('creates blackbox-logs directory and metadata file', async () => {
    const stat = await fs.stat(logsDir);
    expect(stat.isDirectory()).toBe(true);

    const meta = JSON.parse(await fs.readFile(join(logsDir, 'logs.json'), 'utf-8'));
    expect(meta).toEqual([]);
  });

  it('is idempotent (re-init does not reset metadata)', async () => {
    const logData = Buffer.from('test data');
    await manager.saveLog(logData, 'prof-1', 'SN-001', mockFCInfo);

    // Re-initialize
    const mgr2 = new BlackboxManager();
    await mgr2.initialize();

    const logs = await mgr2.listLogs('prof-1');
    expect(logs).toHaveLength(1);
  });

  // ─── saveLog ─────────────────────────────────────────────────

  it('saves log with metadata and unique ID', async () => {
    const data = Buffer.alloc(1024, 0x42);
    const meta = await manager.saveLog(data, 'prof-1', 'SN-001', mockFCInfo);

    expect(meta.id).toBeTruthy();
    expect(meta.profileId).toBe('prof-1');
    expect(meta.fcSerial).toBe('SN-001');
    expect(meta.size).toBe(1024);
    expect(meta.filename).toMatch(/^blackbox_.*\.bbl$/);
    expect(meta.fcInfo).toEqual(mockFCInfo);

    // Verify file on disk
    const fileContent = await fs.readFile(meta.filepath);
    expect(fileContent.length).toBe(1024);
    expect(fileContent[0]).toBe(0x42);
  });

  it('generates unique filenames for concurrent saves', async () => {
    const data = Buffer.from('log');
    const [m1, m2] = await Promise.all([
      manager.saveLog(data, 'p1', 'sn1', mockFCInfo),
      manager.saveLog(data, 'p1', 'sn1', mockFCInfo),
    ]);

    expect(m1.id).not.toBe(m2.id);
  });

  // ─── listLogs ────────────────────────────────────────────────

  it('returns logs filtered by profileId', async () => {
    await manager.saveLog(Buffer.from('a'), 'prof-A', 'sn-A', mockFCInfo);
    await manager.saveLog(Buffer.from('b'), 'prof-B', 'sn-B', mockFCInfo);
    await manager.saveLog(Buffer.from('c'), 'prof-A', 'sn-A', mockFCInfo);

    const logsA = await manager.listLogs('prof-A');
    expect(logsA).toHaveLength(2);
    expect(logsA.every(l => l.profileId === 'prof-A')).toBe(true);
  });

  it('returns empty array for unknown profile', async () => {
    const logs = await manager.listLogs('ghost');
    expect(logs).toEqual([]);
  });

  // ─── listAllLogs ─────────────────────────────────────────────

  it('returns all logs across profiles', async () => {
    await manager.saveLog(Buffer.from('x'), 'p1', 'sn1', mockFCInfo);
    await manager.saveLog(Buffer.from('y'), 'p2', 'sn2', mockFCInfo);

    const all = await manager.listAllLogs();
    expect(all).toHaveLength(2);
  });

  // ─── getLog ──────────────────────────────────────────────────

  it('returns log metadata by ID', async () => {
    const saved = await manager.saveLog(Buffer.from('data'), 'p1', 'sn1', mockFCInfo);
    const found = await manager.getLog(saved.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(saved.id);
    expect(found!.size).toBe(4);
  });

  it('returns null for unknown ID', async () => {
    expect(await manager.getLog('ghost')).toBeNull();
  });

  // ─── deleteLog ───────────────────────────────────────────────

  it('removes log file and metadata', async () => {
    const saved = await manager.saveLog(Buffer.from('delete me'), 'p1', 'sn1', mockFCInfo);
    await manager.deleteLog(saved.id);

    expect(await manager.getLog(saved.id)).toBeNull();

    // File should be deleted
    await expect(fs.access(saved.filepath)).rejects.toThrow();
  });

  it('throws for non-existent log ID', async () => {
    await expect(manager.deleteLog('ghost')).rejects.toThrow('not found');
  });

  it('still removes metadata even if file deletion fails', async () => {
    const saved = await manager.saveLog(Buffer.from('data'), 'p1', 'sn1', mockFCInfo);

    // Delete the file manually first
    await fs.unlink(saved.filepath);

    // deleteLog should succeed (soft delete)
    await manager.deleteLog(saved.id);
    expect(await manager.getLog(saved.id)).toBeNull();
  });

  // ─── deleteLogsForProfile ────────────────────────────────────

  it('removes all logs for a profile', async () => {
    await manager.saveLog(Buffer.from('a'), 'prof-del', 'sn1', mockFCInfo);
    await manager.saveLog(Buffer.from('b'), 'prof-del', 'sn1', mockFCInfo);
    await manager.saveLog(Buffer.from('c'), 'prof-keep', 'sn2', mockFCInfo);

    await manager.deleteLogsForProfile('prof-del');

    expect(await manager.listLogs('prof-del')).toHaveLength(0);
    expect(await manager.listLogs('prof-keep')).toHaveLength(1);
  });

  // ─── exportLog ───────────────────────────────────────────────

  it('copies log file to destination', async () => {
    const data = Buffer.from('flight data here');
    const saved = await manager.saveLog(data, 'p1', 'sn1', mockFCInfo);

    const dest = join(testUserDataDir, 'exported.bbl');
    await manager.exportLog(saved.id, dest);

    const exported = await fs.readFile(dest);
    expect(exported.toString()).toBe('flight data here');
  });

  it('throws for non-existent log on export', async () => {
    await expect(manager.exportLog('ghost', '/tmp/out.bbl')).rejects.toThrow('not found');
  });
});
