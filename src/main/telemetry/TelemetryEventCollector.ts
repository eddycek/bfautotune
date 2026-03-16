import fs from 'fs/promises';
import type { TelemetryEvent } from '@shared/types/telemetry.types';
import { logger } from '../utils/logger';

const MAX_EVENTS_DEFAULT = 200;
const MAX_META_KEYS = 10;

export class TelemetryEventCollector {
  private events: TelemetryEvent[] = [];
  private persistPath: string;
  private maxEvents: number;
  private activeSessionId: string | undefined;
  private dirty = false;

  constructor(persistPath: string, maxEvents = MAX_EVENTS_DEFAULT) {
    this.persistPath = persistPath;
    this.maxEvents = maxEvents;
  }

  setActiveSessionId(sessionId: string | undefined): void {
    this.activeSessionId = sessionId;
  }

  emit(
    type: TelemetryEvent['type'],
    name: string,
    meta?: Record<string, string | number | boolean>
  ): void {
    const event: TelemetryEvent = {
      type,
      name,
      ts: new Date().toISOString(),
    };

    if (this.activeSessionId) {
      event.sessionId = this.activeSessionId;
    }

    if (meta) {
      // Truncate to max keys for safety
      const keys = Object.keys(meta);
      if (keys.length > MAX_META_KEYS) {
        const trimmed: Record<string, string | number | boolean> = {};
        for (let i = 0; i < MAX_META_KEYS; i++) {
          trimmed[keys[i]] = meta[keys[i]];
        }
        event.meta = trimmed;
      } else {
        event.meta = meta;
      }
    }

    this.events.push(event);

    // Ring buffer — drop oldest when over limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    this.dirty = true;
  }

  getEvents(): TelemetryEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
    this.dirty = true;
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.persistPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.events = parsed.slice(-this.maxEvents);
      }
    } catch {
      // File doesn't exist or is corrupt — start fresh
      this.events = [];
    }
  }

  async persist(): Promise<void> {
    if (!this.dirty) return;
    try {
      await fs.writeFile(this.persistPath, JSON.stringify(this.events));
      this.dirty = false;
    } catch (err) {
      logger.warn('TelemetryEventCollector: failed to persist events:', err);
    }
  }
}
