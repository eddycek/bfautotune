import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useConnection } from './useConnection';
import type { PortInfo, ConnectionStatus } from '@shared/types/common.types';

describe('useConnection', () => {
  const mockPorts: PortInfo[] = [
    { path: '/dev/ttyUSB0', manufacturer: 'Silicon Labs' },
    { path: '/dev/ttyUSB1', manufacturer: 'FTDI' }
  ];

  const mockConnectedStatus: ConnectionStatus = {
    connected: true,
    portPath: '/dev/ttyUSB0',
    fcInfo: {
      variant: 'BTFL',
      version: '4.4.0',
      target: 'MATEKF405',
      boardName: 'MATEKF405',
      apiVersion: { protocol: 1, major: 12, minor: 0 }
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(window.betaflight.listPorts).mockResolvedValue(mockPorts);
    vi.mocked(window.betaflight.getConnectionStatus).mockResolvedValue({ connected: false });
    vi.mocked(window.betaflight.connect).mockResolvedValue(undefined);
    vi.mocked(window.betaflight.disconnect).mockResolvedValue(undefined);
    vi.mocked(window.betaflight.onConnectionChanged).mockReturnValue(() => {});
  });

  it('initializes with disconnected status', async () => {
    const { result } = renderHook(() => useConnection());

    expect(result.current.status.connected).toBe(false);
  });

  it('loads initial connection status on mount', async () => {
    vi.mocked(window.betaflight.getConnectionStatus).mockResolvedValue(mockConnectedStatus);

    const { result } = renderHook(() => useConnection());

    await waitFor(() => {
      expect(result.current.status).toEqual(mockConnectedStatus);
    });
  });

  it('subscribes to connection changes on mount', () => {
    renderHook(() => useConnection());

    expect(window.betaflight.onConnectionChanged).toHaveBeenCalled();
  });

  it('scans for ports', async () => {
    const { result } = renderHook(() => useConnection());

    await result.current.scanPorts();

    await waitFor(() => {
      expect(result.current.ports).toEqual(mockPorts);
    });

    expect(window.betaflight.listPorts).toHaveBeenCalled();
  });

  it('sets loading state while scanning ports', async () => {
    vi.mocked(window.betaflight.listPorts).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(mockPorts), 100))
    );

    const { result } = renderHook(() => useConnection());

    result.current.scanPorts();

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('connects to port successfully', async () => {
    const { result } = renderHook(() => useConnection());

    await result.current.connect('/dev/ttyUSB0');

    expect(window.betaflight.connect).toHaveBeenCalledWith('/dev/ttyUSB0');
  });

  it('sets loading state while connecting', async () => {
    vi.mocked(window.betaflight.connect).mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );

    const { result } = renderHook(() => useConnection());

    result.current.connect('/dev/ttyUSB0');

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('disconnects successfully', async () => {
    const { result } = renderHook(() => useConnection());

    await result.current.disconnect();

    expect(window.betaflight.disconnect).toHaveBeenCalled();
  });

  it('sets loading state while disconnecting', async () => {
    vi.mocked(window.betaflight.disconnect).mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );

    const { result } = renderHook(() => useConnection());

    result.current.disconnect();

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('sets error state when scan fails', async () => {
    const errorMessage = 'Failed to scan ports';
    vi.mocked(window.betaflight.listPorts).mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useConnection());

    await result.current.scanPorts();

    await waitFor(() => {
      expect(result.current.error).toBe(errorMessage);
    });
  });

  it('sets error state when connection fails', async () => {
    const errorMessage = 'Failed to connect';
    vi.mocked(window.betaflight.connect).mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useConnection());

    await result.current.connect('/dev/ttyUSB0');

    await waitFor(() => {
      expect(result.current.error).toBe(errorMessage);
    });
  });

  it('clears error when successful connection happens', async () => {
    let connectionChangeCallback: ((status: ConnectionStatus) => void) | null = null;
    vi.mocked(window.betaflight.onConnectionChanged).mockImplementation((callback) => {
      connectionChangeCallback = callback;
      return () => {};
    });

    const errorMessage = 'Previous error';
    vi.mocked(window.betaflight.listPorts).mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useConnection());

    await result.current.scanPorts();

    await waitFor(() => {
      expect(result.current.error).toBe(errorMessage);
    });

    // Trigger connection changed event with successful connection
    connectionChangeCallback?.(mockConnectedStatus);

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
  });

  it('updates status when connection changed event fires', async () => {
    let connectionChangeCallback: ((status: ConnectionStatus) => void) | null = null;

    vi.mocked(window.betaflight.onConnectionChanged).mockImplementation((callback) => {
      connectionChangeCallback = callback;
      return () => {};
    });

    const { result } = renderHook(() => useConnection());

    await waitFor(() => {
      expect(result.current.status.connected).toBe(false);
    });

    // Trigger connection change
    if (connectionChangeCallback) {
      connectionChangeCallback(mockConnectedStatus);
    }

    await waitFor(() => {
      expect(result.current.status).toEqual(mockConnectedStatus);
    });
  });

  it('shows error from connection status', async () => {
    const errorStatus: ConnectionStatus = {
      connected: false,
      error: 'Connection error from status'
    };

    let connectionChangeCallback: ((status: ConnectionStatus) => void) | null = null;

    vi.mocked(window.betaflight.onConnectionChanged).mockImplementation((callback) => {
      connectionChangeCallback = callback;
      return () => {};
    });

    const { result } = renderHook(() => useConnection());

    // Trigger error in connection status
    connectionChangeCallback?.(errorStatus);

    await waitFor(() => {
      expect(result.current.error).toBe('Connection error from status');
    });
  });
});
