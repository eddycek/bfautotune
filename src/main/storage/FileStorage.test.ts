import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FileStorage } from './FileStorage';
import type { ConfigurationSnapshot } from '@shared/types/common.types';

function makeSnapshot(id: string, overrides: Partial<ConfigurationSnapshot> = {}): ConfigurationSnapshot {
  return {
    id,
    timestamp: '2026-02-11T10:00:00.000Z',
    label: `Snapshot ${id}`,
    type: 'manual',
    fcInfo: { variant: 'BTFL', version: '4.5.1', target: 'STM32F7X2', boardName: 'SPEEDY', apiVersion: { protocol: 0, major: 1, minor: 46 } },
    configuration: { cliDiff: 'set gyro_lpf1_static_hz = 250' },
    metadata: { appVersion: '0.1.0', createdBy: 'user' },
    ...overrides,
  };
}

describe('FileStorage', () => {
  let storage: FileStorage;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `bfat-test-filestorage-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    storage = new FileStorage(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // ─── ensureDirectory ─────────────────────────────────────────

  it('creates directory if not exists', async () => {
    await storage.ensureDirectory();
    const stat = await fs.stat(tempDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('is idempotent (no error if already exists)', async () => {
    await storage.ensureDirectory();
    await expect(storage.ensureDirectory()).resolves.toBeUndefined();
  });

  // ─── saveSnapshot / loadSnapshot ─────────────────────────────

  it('saves and loads snapshot as JSON', async () => {
    const snap = makeSnapshot('snap-001');
    await storage.saveSnapshot(snap);

    const loaded = await storage.loadSnapshot('snap-001');
    expect(loaded.id).toBe('snap-001');
    expect(loaded.configuration.cliDiff).toBe('set gyro_lpf1_static_hz = 250');
    expect(loaded.fcInfo.version).toBe('4.5.1');
  });

  it('overwrites snapshot on re-save', async () => {
    await storage.saveSnapshot(makeSnapshot('snap-001', { label: 'First' }));
    await storage.saveSnapshot(makeSnapshot('snap-001', { label: 'Updated' }));

    const loaded = await storage.loadSnapshot('snap-001');
    expect(loaded.label).toBe('Updated');
  });

  it('loadSnapshot throws for non-existent ID', async () => {
    await storage.ensureDirectory();
    await expect(storage.loadSnapshot('non-existent')).rejects.toThrow('Snapshot not found');
  });

  // ─── deleteSnapshot ──────────────────────────────────────────

  it('deletes existing snapshot', async () => {
    await storage.saveSnapshot(makeSnapshot('snap-del'));
    await storage.deleteSnapshot('snap-del');
    await expect(storage.loadSnapshot('snap-del')).rejects.toThrow('Snapshot not found');
  });

  it('deleteSnapshot throws for non-existent ID', async () => {
    await storage.ensureDirectory();
    await expect(storage.deleteSnapshot('ghost')).rejects.toThrow('Snapshot not found');
  });

  // ─── listSnapshots ───────────────────────────────────────────

  it('lists all saved snapshot IDs', async () => {
    await storage.saveSnapshot(makeSnapshot('aaa'));
    await storage.saveSnapshot(makeSnapshot('bbb'));
    await storage.saveSnapshot(makeSnapshot('ccc'));

    const ids = await storage.listSnapshots();
    expect(ids).toContain('aaa');
    expect(ids).toContain('bbb');
    expect(ids).toContain('ccc');
    expect(ids.length).toBe(3);
  });

  it('returns empty array for empty directory', async () => {
    await storage.ensureDirectory();
    const ids = await storage.listSnapshots();
    expect(ids).toEqual([]);
  });

  // ─── snapshotExists ──────────────────────────────────────────

  it('returns true for existing snapshot', async () => {
    await storage.saveSnapshot(makeSnapshot('exists'));
    expect(await storage.snapshotExists('exists')).toBe(true);
  });

  it('returns false for non-existent snapshot', async () => {
    await storage.ensureDirectory();
    expect(await storage.snapshotExists('ghost')).toBe(false);
  });

  // ─── exportSnapshot ──────────────────────────────────────────

  it('exports snapshot to destination path', async () => {
    await storage.saveSnapshot(makeSnapshot('exp-001'));
    const destDir = join(tempDir, 'exports');
    const destPath = join(destDir, 'exported.json');

    await storage.exportSnapshot('exp-001', destPath);

    const content = await fs.readFile(destPath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.id).toBe('exp-001');
  });

  it('exportSnapshot throws for non-existent ID', async () => {
    await storage.ensureDirectory();
    await expect(storage.exportSnapshot('ghost', '/tmp/out.json')).rejects.toThrow('Snapshot not found');
  });
});
