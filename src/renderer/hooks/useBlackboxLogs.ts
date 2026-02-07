import { useState, useEffect } from 'react';
import type { BlackboxLogMetadata } from '@shared/types/blackbox.types';

export function useBlackboxLogs() {
  const [logs, setLogs] = useState<BlackboxLogMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);

    try {
      const logList = await window.betaflight.listBlackboxLogs();
      setLogs(logList);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load Blackbox logs';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();

    // Subscribe to profile changes to reload logs
    const unsubscribe = window.betaflight.onProfileChanged(() => {
      loadLogs();
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const deleteLog = async (logId: string) => {
    await window.betaflight.deleteBlackboxLog(logId);
    await loadLogs(); // Refresh list
  };

  const openFolder = async (filepath: string) => {
    await window.betaflight.openBlackboxFolder(filepath);
  };

  return {
    logs,
    loading,
    error,
    deleteLog,
    openFolder,
    reload: loadLogs
  };
}
