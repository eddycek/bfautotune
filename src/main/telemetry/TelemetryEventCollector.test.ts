import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelemetryEventCollector } from './TelemetryEventCollector';

// Mock fs/promises
const mockFs = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock('fs/promises', () => ({ default: mockFs }));

describe('TelemetryEventCollector', () => {
  let collector: TelemetryEventCollector;

  beforeEach(() => {
    vi.clearAllMocks();
    collector = new TelemetryEventCollector('/tmp/test-events.json');
  });

  describe('emit', () => {
    it('adds event with timestamp', () => {
      collector.emit('error', 'msp_timeout', { command: 'MSP_STATUS' });

      const events = collector.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('error');
      expect(events[0].name).toBe('msp_timeout');
      expect(events[0].ts).toBeDefined();
      expect(events[0].meta).toEqual({ command: 'MSP_STATUS' });
    });

    it('includes active sessionId when set', () => {
      collector.setActiveSessionId('session-123');
      collector.emit('workflow', 'tuning_started', { mode: 'filter' });

      const events = collector.getEvents();
      expect(events[0].sessionId).toBe('session-123');
    });

    it('omits sessionId when not set', () => {
      collector.emit('workflow', 'tuning_started');

      const events = collector.getEvents();
      expect(events[0].sessionId).toBeUndefined();
    });

    it('clears sessionId when set to undefined', () => {
      collector.setActiveSessionId('session-123');
      collector.emit('workflow', 'tuning_started');

      collector.setActiveSessionId(undefined);
      collector.emit('error', 'uncaught');

      const events = collector.getEvents();
      expect(events[0].sessionId).toBe('session-123');
      expect(events[1].sessionId).toBeUndefined();
    });

    it('omits meta when not provided', () => {
      collector.emit('error', 'uncaught');

      const events = collector.getEvents();
      expect(events[0].meta).toBeUndefined();
    });

    it('truncates meta to 10 keys', () => {
      const meta: Record<string, string> = {};
      for (let i = 0; i < 15; i++) {
        meta[`key${i}`] = `val${i}`;
      }
      collector.emit('error', 'test', meta);

      const events = collector.getEvents();
      expect(Object.keys(events[0].meta!)).toHaveLength(10);
    });
  });

  describe('ring buffer', () => {
    it('drops oldest events when exceeding maxEvents', () => {
      const small = new TelemetryEventCollector('/tmp/test.json', 5);

      for (let i = 0; i < 8; i++) {
        small.emit('error', `event_${i}`);
      }

      const events = small.getEvents();
      expect(events).toHaveLength(5);
      expect(events[0].name).toBe('event_3');
      expect(events[4].name).toBe('event_7');
    });

    it('respects default max of 200', () => {
      for (let i = 0; i < 210; i++) {
        collector.emit('error', `event_${i}`);
      }

      expect(collector.getEvents()).toHaveLength(200);
    });
  });

  describe('getEvents', () => {
    it('returns a copy, not the internal array', () => {
      collector.emit('error', 'test');

      const e1 = collector.getEvents();
      const e2 = collector.getEvents();
      expect(e1).toEqual(e2);
      expect(e1).not.toBe(e2);
    });
  });

  describe('clear', () => {
    it('removes all events', () => {
      collector.emit('error', 'test1');
      collector.emit('error', 'test2');

      collector.clear();

      expect(collector.getEvents()).toHaveLength(0);
    });
  });

  describe('persistence', () => {
    it('loads events from disk', async () => {
      const stored = [
        { type: 'error', name: 'msp_timeout', ts: '2026-03-16T10:00:00.000Z' },
        { type: 'workflow', name: 'tuning_started', ts: '2026-03-16T10:01:00.000Z' },
      ];
      mockFs.readFile.mockResolvedValue(JSON.stringify(stored));

      await collector.load();

      expect(collector.getEvents()).toHaveLength(2);
      expect(collector.getEvents()[0].name).toBe('msp_timeout');
    });

    it('starts fresh when file does not exist', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

      await collector.load();

      expect(collector.getEvents()).toHaveLength(0);
    });

    it('starts fresh on corrupt JSON', async () => {
      mockFs.readFile.mockResolvedValue('not json');

      await collector.load();

      expect(collector.getEvents()).toHaveLength(0);
    });

    it('truncates loaded events to maxEvents', async () => {
      const small = new TelemetryEventCollector('/tmp/test.json', 3);
      const stored = Array.from({ length: 10 }, (_, i) => ({
        type: 'error',
        name: `event_${i}`,
        ts: '2026-03-16T10:00:00.000Z',
      }));
      mockFs.readFile.mockResolvedValue(JSON.stringify(stored));

      await small.load();

      expect(small.getEvents()).toHaveLength(3);
      expect(small.getEvents()[0].name).toBe('event_7');
    });

    it('persists events to disk after emit', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      collector.emit('error', 'test');
      await collector.persist();

      expect(mockFs.writeFile).toHaveBeenCalledWith('/tmp/test-events.json', expect.any(String));
      const written = JSON.parse(mockFs.writeFile.mock.calls[0][1]);
      expect(written).toHaveLength(1);
      expect(written[0].name).toBe('test');
    });

    it('skips persist when no changes', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      await collector.persist();

      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('marks clean after successful persist', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      collector.emit('error', 'test');
      await collector.persist();
      await collector.persist(); // second call should be no-op

      expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
    });

    it('handles persist failure gracefully', async () => {
      mockFs.writeFile.mockRejectedValue(new Error('EACCES'));

      collector.emit('error', 'test');
      await collector.persist(); // should not throw

      expect(collector.getEvents()).toHaveLength(1); // events still in memory
    });
  });
});
