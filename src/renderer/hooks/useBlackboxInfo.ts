import { useState, useEffect } from 'react';
import type { BlackboxInfo } from '@shared/types/blackbox.types';

export function useBlackboxInfo() {
  const [info, setInfo] = useState<BlackboxInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBlackboxInfo = async () => {
    setLoading(true);
    setError(null);

    try {
      const blackboxInfo = await window.betaflight.getBlackboxInfo();
      setInfo(blackboxInfo);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load Blackbox info';
      setError(message);
      console.error('Failed to load Blackbox info:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load on mount
  useEffect(() => {
    loadBlackboxInfo();
  }, []);

  return {
    info,
    loading,
    error,
    refresh: loadBlackboxInfo
  };
}
