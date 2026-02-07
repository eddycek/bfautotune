import { useState, useCallback } from 'react';
import type { FCInfo } from '@shared/types/common.types';

export function useFCInfo() {
  const [fcInfo, setFcInfo] = useState<FCInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFCInfo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const info = await window.betaflight.getFCInfo();
      setFcInfo(info);
    } catch (err: any) {
      setError(err.message);
      setFcInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const exportCLI = useCallback(async (format: 'diff' | 'dump'): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      const cli = await window.betaflight.exportCLI(format);
      return cli;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    fcInfo,
    loading,
    error,
    fetchFCInfo,
    exportCLI
  };
}
