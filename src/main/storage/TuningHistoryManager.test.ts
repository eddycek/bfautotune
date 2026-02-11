import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { TuningHistoryManager } from './TuningHistoryManager';
import type { TuningSession } from '@shared/types/tuning.types';

function makeCompletedSession(profileId: string, overrides?: Partial<TuningSession>): TuningSession {
  return {
    profileId,
    phase: 'completed',
    startedAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-01-15T12:00:00.000Z',
    baselineSnapshotId: 'snap-baseline',
    filterLogId: 'log-filter',
    pidLogId: 'log-pid',
    appliedFilterChanges: [{ setting: 'gyro_lpf1_static_hz', previousValue: 250, newValue: 180 }],
    appliedPIDChanges: [{ setting: 'p_roll', previousValue: 45, newValue: 50 }],
    ...overrides,
  };
}

describe('TuningHistoryManager', () => {
  let manager: TuningHistoryManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'tuning-history-test-'));
    manager = new TuningHistoryManager(tempDir);
    await manager.initialize();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('initialize', () => {
    it('creates the tuning-history directory', async () => {
      const historyDir = join(tempDir, 'tuning-history');
      const stat = await fs.stat(historyDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('archiveSession', () => {
    it('creates a record with unique ID', async () => {
      const session = makeCompletedSession('profile-1');
      const record = await manager.archiveSession(session);

      expect(record.id).toBeTruthy();
      expect(typeof record.id).toBe('string');
      expect(record.profileId).toBe('profile-1');
      expect(record.startedAt).toBe(session.startedAt);
      expect(record.completedAt).toBe(session.updatedAt);
    });

    it('persists record to disk', async () => {
      const session = makeCompletedSession('profile-1');
      await manager.archiveSession(session);

      const filePath = join(tempDir, 'tuning-history', 'profile-1.json');
      const json = await fs.readFile(filePath, 'utf-8');
      const records = JSON.parse(json);
      expect(records).toHaveLength(1);
      expect(records[0].profileId).toBe('profile-1');
    });

    it('appends multiple records (newest-first on getHistory)', async () => {
      const session1 = makeCompletedSession('profile-1', {
        startedAt: '2026-01-10T10:00:00.000Z',
        updatedAt: '2026-01-10T12:00:00.000Z',
      });
      const session2 = makeCompletedSession('profile-1', {
        startedAt: '2026-01-15T10:00:00.000Z',
        updatedAt: '2026-01-15T12:00:00.000Z',
      });

      await manager.archiveSession(session1);
      await manager.archiveSession(session2);

      const history = await manager.getHistory('profile-1');
      expect(history).toHaveLength(2);
      // Newest first
      expect(history[0].startedAt).toBe('2026-01-15T10:00:00.000Z');
      expect(history[1].startedAt).toBe('2026-01-10T10:00:00.000Z');
    });

    it('uses null defaults for missing optional fields', async () => {
      const session = makeCompletedSession('profile-1', {
        baselineSnapshotId: undefined,
        postFilterSnapshotId: undefined,
        postTuningSnapshotId: undefined,
        filterLogId: undefined,
        pidLogId: undefined,
        verificationLogId: undefined,
        appliedFilterChanges: undefined,
        appliedPIDChanges: undefined,
        filterMetrics: undefined,
        pidMetrics: undefined,
        verificationMetrics: undefined,
      });

      const record = await manager.archiveSession(session);
      expect(record.baselineSnapshotId).toBeNull();
      expect(record.postFilterSnapshotId).toBeNull();
      expect(record.postTuningSnapshotId).toBeNull();
      expect(record.filterLogId).toBeNull();
      expect(record.pidLogId).toBeNull();
      expect(record.verificationLogId).toBeNull();
      expect(record.appliedFilterChanges).toEqual([]);
      expect(record.appliedPIDChanges).toEqual([]);
      expect(record.filterMetrics).toBeNull();
      expect(record.pidMetrics).toBeNull();
      expect(record.verificationMetrics).toBeNull();
    });

    it('rejects non-completed sessions', async () => {
      const session: TuningSession = {
        profileId: 'profile-1',
        phase: 'filter_analysis',
        startedAt: '2026-01-15T10:00:00.000Z',
        updatedAt: '2026-01-15T11:00:00.000Z',
      };

      await expect(manager.archiveSession(session)).rejects.toThrow('Cannot archive non-completed session');
    });

    it('generates unique IDs for each record', async () => {
      const session = makeCompletedSession('profile-1');
      const record1 = await manager.archiveSession(session);
      const record2 = await manager.archiveSession(session);
      expect(record1.id).not.toBe(record2.id);
    });
  });

  describe('getHistory', () => {
    it('returns empty array for non-existent profile', async () => {
      const history = await manager.getHistory('nonexistent');
      expect(history).toEqual([]);
    });

    it('returns newest-first ordering', async () => {
      await manager.archiveSession(makeCompletedSession('profile-1', {
        startedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T01:00:00Z',
      }));
      await manager.archiveSession(makeCompletedSession('profile-1', {
        startedAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T01:00:00Z',
      }));
      await manager.archiveSession(makeCompletedSession('profile-1', {
        startedAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T01:00:00Z',
      }));

      const history = await manager.getHistory('profile-1');
      expect(history).toHaveLength(3);
      expect(history[0].startedAt).toBe('2026-03-01T00:00:00Z');
      expect(history[2].startedAt).toBe('2026-01-01T00:00:00Z');
    });

    it('returns empty array for corrupted file', async () => {
      const filePath = join(tempDir, 'tuning-history', 'corrupt.json');
      await fs.writeFile(filePath, '{not valid json!!!', 'utf-8');
      const history = await manager.getHistory('corrupt');
      expect(history).toEqual([]);
    });

    it('isolates history between profiles', async () => {
      await manager.archiveSession(makeCompletedSession('profile-a'));
      await manager.archiveSession(makeCompletedSession('profile-b'));
      await manager.archiveSession(makeCompletedSession('profile-b'));

      const historyA = await manager.getHistory('profile-a');
      const historyB = await manager.getHistory('profile-b');
      expect(historyA).toHaveLength(1);
      expect(historyB).toHaveLength(2);
    });
  });

  describe('deleteHistory', () => {
    it('deletes all history for a profile', async () => {
      await manager.archiveSession(makeCompletedSession('profile-1'));
      await manager.archiveSession(makeCompletedSession('profile-1'));

      await manager.deleteHistory('profile-1');

      const history = await manager.getHistory('profile-1');
      expect(history).toEqual([]);
    });

    it('is a no-op for non-existent profile', async () => {
      // Should not throw
      await manager.deleteHistory('nonexistent');
    });

    it('does not affect other profiles', async () => {
      await manager.archiveSession(makeCompletedSession('profile-a'));
      await manager.archiveSession(makeCompletedSession('profile-b'));

      await manager.deleteHistory('profile-a');

      const historyA = await manager.getHistory('profile-a');
      const historyB = await manager.getHistory('profile-b');
      expect(historyA).toEqual([]);
      expect(historyB).toHaveLength(1);
    });
  });
});
