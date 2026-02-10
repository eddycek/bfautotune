import { useState, useEffect, useCallback } from 'react';
import type { TuningSession, TuningPhase } from '@shared/types/tuning.types';

export interface UseTuningSessionReturn {
  session: TuningSession | null;
  loading: boolean;
  startSession: () => Promise<void>;
  resetSession: () => Promise<void>;
  updatePhase: (phase: TuningPhase, data?: Partial<TuningSession>) => Promise<void>;
}

export function useTuningSession(): UseTuningSessionReturn {
  const [session, setSession] = useState<TuningSession | null>(null);
  const [loading, setLoading] = useState(true);

  // Load session on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const s = await window.betaflight.getTuningSession();
        if (!cancelled) setSession(s);
      } catch {
        // No session or not connected — that's fine
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Subscribe to session change events
  useEffect(() => {
    return window.betaflight.onTuningSessionChanged((updated) => {
      setSession(updated);
    });
  }, []);

  const startSession = useCallback(async () => {
    const s = await window.betaflight.startTuningSession();
    setSession(s);
  }, []);

  const resetSession = useCallback(async () => {
    await window.betaflight.resetTuningSession();
    setSession(null);
  }, []);

  const updatePhase = useCallback(async (phase: TuningPhase, data?: Partial<TuningSession>) => {
    const s = await window.betaflight.updateTuningPhase(phase, data);
    setSession(s);
  }, []);

  return { session, loading, startSession, resetSession, updatePhase };
}
