import { useState, useEffect, useCallback } from 'react';
import type { PortInfo, ConnectionStatus } from '@shared/types/common.types';

export function useConnection() {
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Listen for connection changes
    const unsubscribe = window.betaflight.onConnectionChanged((newStatus) => {
      setStatus(newStatus);
      // Clear error when successfully connected
      if (newStatus.connected) {
        setError(null);
      }
      if (newStatus.error) {
        setError(newStatus.error);
      }
    });

    // Get initial status
    window.betaflight.getConnectionStatus().then(setStatus);

    return unsubscribe;
  }, []);

  const scanPorts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const portList = await window.betaflight.listPorts();
      setPorts(portList);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const connect = useCallback(async (portPath: string) => {
    setLoading(true);
    setError(null);
    try {
      await window.betaflight.connect(portPath);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await window.betaflight.disconnect();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    ports,
    status,
    loading,
    error,
    scanPorts,
    connect,
    disconnect
  };
}
