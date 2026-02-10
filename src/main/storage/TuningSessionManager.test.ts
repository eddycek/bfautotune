import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { TuningSessionManager } from './TuningSessionManager';
import type { TuningSession } from '@shared/types/tuning.types';

describe('TuningSessionManager', () => {
  let manager: TuningSessionManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'tuning-test-'));
    manager = new TuningSessionManager(tempDir);
    await manager.initialize();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('initialize', () => {
    it('creates the tuning directory', async () => {
      const tuningDir = join(tempDir, 'tuning');
      const stat = await fs.stat(tuningDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('getSession', () => {
    it('returns null for non-existent session', async () => {
      const result = await manager.getSession('nonexistent-profile');
      expect(result).toBeNull();
    });

    it('returns session data for existing session', async () => {
      await manager.createSession('profile-1');
      const result = await manager.getSession('profile-1');
      expect(result).not.toBeNull();
      expect(result!.profileId).toBe('profile-1');
      expect(result!.phase).toBe('filter_flight_pending');
    });

    it('returns null for corrupted JSON file', async () => {
      const filePath = join(tempDir, 'tuning', 'corrupt.json');
      await fs.writeFile(filePath, '{invalid json!!!', 'utf-8');
      const result = await manager.getSession('corrupt');
      expect(result).toBeNull();
    });
  });

  describe('createSession', () => {
    it('creates session file in tuning directory', async () => {
      const session = await manager.createSession('profile-1');
      expect(session.profileId).toBe('profile-1');
      expect(session.phase).toBe('filter_flight_pending');
      expect(session.startedAt).toBeTruthy();
      expect(session.updatedAt).toBeTruthy();

      // Verify file exists
      const filePath = join(tempDir, 'tuning', 'profile-1.json');
      const stat = await fs.stat(filePath);
      expect(stat.isFile()).toBe(true);
    });

    it('stores valid JSON', async () => {
      await manager.createSession('profile-1');
      const filePath = join(tempDir, 'tuning', 'profile-1.json');
      const json = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(json) as TuningSession;
      expect(parsed.profileId).toBe('profile-1');
    });

    it('overwrites existing session when creating new', async () => {
      const first = await manager.createSession('profile-1');
      await manager.updatePhase('profile-1', 'filter_analysis');

      const second = await manager.createSession('profile-1');
      expect(second.phase).toBe('filter_flight_pending');
      expect(new Date(second.startedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(first.startedAt).getTime()
      );
    });
  });

  describe('updatePhase', () => {
    it('updates phase and preserves existing data', async () => {
      const session = await manager.createSession('profile-1');
      const updated = await manager.updatePhase('profile-1', 'filter_log_ready');

      expect(updated.profileId).toBe('profile-1');
      expect(updated.phase).toBe('filter_log_ready');
      expect(updated.startedAt).toBe(session.startedAt);
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(session.updatedAt).getTime()
      );
    });

    it('merges extra data into session', async () => {
      await manager.createSession('profile-1');
      const updated = await manager.updatePhase('profile-1', 'filter_analysis', {
        filterLogId: 'log-123',
      });

      expect(updated.phase).toBe('filter_analysis');
      expect(updated.filterLogId).toBe('log-123');
    });

    it('preserves previous extra data across updates', async () => {
      await manager.createSession('profile-1');
      await manager.updatePhase('profile-1', 'filter_analysis', {
        filterLogId: 'log-123',
      });
      const updated = await manager.updatePhase('profile-1', 'pid_flight_pending', {
        appliedFilterChanges: [{ setting: 'gyro_lpf1_static_hz', previousValue: 250, newValue: 150 }],
      });

      expect(updated.filterLogId).toBe('log-123');
      expect(updated.appliedFilterChanges).toHaveLength(1);
      expect(updated.phase).toBe('pid_flight_pending');
    });

    it('throws when session does not exist', async () => {
      await expect(
        manager.updatePhase('nonexistent', 'filter_log_ready')
      ).rejects.toThrow('No tuning session found');
    });
  });

  describe('deleteSession', () => {
    it('deletes session file', async () => {
      await manager.createSession('profile-1');
      await manager.deleteSession('profile-1');

      const result = await manager.getSession('profile-1');
      expect(result).toBeNull();
    });

    it('is a no-op for non-existent session', async () => {
      // Should not throw
      await manager.deleteSession('nonexistent');
    });
  });

  describe('multiple profiles', () => {
    it('manages sessions independently per profile', async () => {
      await manager.createSession('profile-a');
      await manager.createSession('profile-b');

      await manager.updatePhase('profile-a', 'pid_flight_pending');

      const sessionA = await manager.getSession('profile-a');
      const sessionB = await manager.getSession('profile-b');

      expect(sessionA!.phase).toBe('pid_flight_pending');
      expect(sessionB!.phase).toBe('filter_flight_pending');
    });

    it('deleting one profile session does not affect another', async () => {
      await manager.createSession('profile-a');
      await manager.createSession('profile-b');

      await manager.deleteSession('profile-a');

      expect(await manager.getSession('profile-a')).toBeNull();
      expect(await manager.getSession('profile-b')).not.toBeNull();
    });
  });
});
