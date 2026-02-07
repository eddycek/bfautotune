import { useState, useCallback, useEffect } from 'react';
import type { ConfigurationSnapshot, SnapshotMetadata } from '@shared/types/common.types';

export function useSnapshots() {
  const [snapshots, setSnapshots] = useState<SnapshotMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await window.betaflight.listSnapshots();
      setSnapshots(list);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createSnapshot = useCallback(async (label?: string): Promise<ConfigurationSnapshot | null> => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await window.betaflight.createSnapshot(label);
      await loadSnapshots(); // Refresh list
      return snapshot;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadSnapshots]);

  const deleteSnapshot = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await window.betaflight.deleteSnapshot(id);
      await loadSnapshots(); // Refresh list
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loadSnapshots]);

  const loadSnapshot = useCallback(async (id: string): Promise<ConfigurationSnapshot | null> => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await window.betaflight.loadSnapshot(id);
      return snapshot;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  // Refresh snapshots when connection changes
  useEffect(() => {
    const unsubscribe = window.betaflight.onConnectionChanged((status) => {
      if (status.connected) {
        // Wait a bit for baseline to be created, then refresh
        setTimeout(() => {
          loadSnapshots();
        }, 1000);
      }
    });

    return unsubscribe;
  }, [loadSnapshots]);

  return {
    snapshots,
    loading,
    error,
    createSnapshot,
    deleteSnapshot,
    loadSnapshot,
    refreshSnapshots: loadSnapshots
  };
}
