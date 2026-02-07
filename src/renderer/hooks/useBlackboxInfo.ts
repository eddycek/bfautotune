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
      console.log('[useBlackboxInfo] Fetching Blackbox info...');
      const blackboxInfo = await window.betaflight.getBlackboxInfo();
      console.log('[useBlackboxInfo] Received:', blackboxInfo);
      setInfo(blackboxInfo);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load Blackbox info';
      setError(message);
      console.error('[useBlackboxInfo] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load on mount only
  useEffect(() => {
    console.log('[useBlackboxInfo] Mount - loading info');
    loadBlackboxInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount

  return {
    info,
    loading,
    error,
    refresh: loadBlackboxInfo
  };
}
