import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBlackboxLogs } from './useBlackboxLogs';
import type { BlackboxLogMetadata } from '@shared/types/blackbox.types';
import type { DroneProfile } from '@shared/types/profile.types';

describe('useBlackboxLogs', () => {
  const mockLogs: BlackboxLogMetadata[] = [
    {
      id: 'log1',
      profileId: 'profile-1',
      fcSerial: 'SERIAL123',
      filename: 'LOG00001.BFL',
      filepath: '/path/to/LOG00001.BFL',
      size: 1048576,
      timestamp: '2024-01-01T12:00:00Z',
      fcInfo: { variant: 'BTFL', version: '4.5.0', target: 'STM32F405' }
    },
    {
      id: 'log2',
      profileId: 'profile-1',
      fcSerial: 'SERIAL123',
      filename: 'LOG00002.BFL',
      filepath: '/path/to/LOG00002.BFL',
      size: 2097152,
      timestamp: '2024-01-02T12:00:00Z',
      fcInfo: { variant: 'BTFL', version: '4.5.0', target: 'STM32F405' }
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(window.betaflight.listBlackboxLogs).mockResolvedValue(mockLogs);
    vi.mocked(window.betaflight.onProfileChanged).mockReturnValue(() => {});
  });

  it('initializes with empty logs array and loading true', () => {
    // Mock to prevent auto-load
    vi.mocked(window.betaflight.listBlackboxLogs).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { result } = renderHook(() => useBlackboxLogs());

    expect(result.current.logs).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('auto-loads logs on mount', async () => {
    const { result } = renderHook(() => useBlackboxLogs());

    await waitFor(() => {
      expect(result.current.logs).toEqual(mockLogs);
    });

    expect(window.betaflight.listBlackboxLogs).toHaveBeenCalled();
  });

  it('returns log list on success', async () => {
    const { result } = renderHook(() => useBlackboxLogs());

    await waitFor(() => {
      expect(result.current.logs).toEqual(mockLogs);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  it('sets error on API failure', async () => {
    const errorMessage = 'Failed to load Blackbox logs';
    vi.mocked(window.betaflight.listBlackboxLogs).mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useBlackboxLogs());

    await waitFor(() => {
      expect(result.current.error).toBe(errorMessage);
      expect(result.current.loading).toBe(false);
    });
  });

  it('subscribes to profile changes and reloads logs', async () => {
    let profileChangeCallback: ((profile: DroneProfile | null) => void) | null = null;

    vi.mocked(window.betaflight.onProfileChanged).mockImplementation((callback) => {
      profileChangeCallback = callback;
      return () => {};
    });

    const { result } = renderHook(() => useBlackboxLogs());

    await waitFor(() => {
      expect(result.current.logs).toEqual(mockLogs);
    });

    // Clear the first call
    vi.mocked(window.betaflight.listBlackboxLogs).mockClear();

    const updatedLogs: BlackboxLogMetadata[] = [
      {
        id: 'log3',
        profileId: 'profile-1',
        fcSerial: 'SERIAL123',
        filename: 'LOG00003.BFL',
        filepath: '/path/to/LOG00003.BFL',
        size: 3145728,
        timestamp: '2024-01-03T12:00:00Z',
        fcInfo: { variant: 'BTFL', version: '4.5.0', target: 'STM32F405' }
      }
    ];
    vi.mocked(window.betaflight.listBlackboxLogs).mockResolvedValue(updatedLogs);

    // Trigger profile change
    (profileChangeCallback as ((profile: DroneProfile | null) => void) | null)?.(null);

    await waitFor(() => {
      expect(result.current.logs).toEqual(updatedLogs);
    });

    expect(window.betaflight.listBlackboxLogs).toHaveBeenCalled();
  });

  it('cleanup unsubscribes on unmount', () => {
    const mockUnsubscribe = vi.fn();
    vi.mocked(window.betaflight.onProfileChanged).mockReturnValue(mockUnsubscribe);

    const { unmount } = renderHook(() => useBlackboxLogs());

    expect(window.betaflight.onProfileChanged).toHaveBeenCalled();

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('deleteLog calls API and reloads list', async () => {
    vi.mocked(window.betaflight.deleteBlackboxLog).mockResolvedValue(undefined);

    const { result } = renderHook(() => useBlackboxLogs());

    await waitFor(() => {
      expect(result.current.logs).toEqual(mockLogs);
    });

    // Clear the initial load call
    vi.mocked(window.betaflight.listBlackboxLogs).mockClear();

    const updatedLogs = [mockLogs[1]]; // First log deleted
    vi.mocked(window.betaflight.listBlackboxLogs).mockResolvedValue(updatedLogs);

    await result.current.deleteLog('log1');

    await waitFor(() => {
      expect(result.current.logs).toEqual(updatedLogs);
    });

    expect(window.betaflight.deleteBlackboxLog).toHaveBeenCalledWith('log1');
    expect(window.betaflight.listBlackboxLogs).toHaveBeenCalled();
  });

  it('openFolder calls API with filepath', async () => {
    vi.mocked(window.betaflight.openBlackboxFolder).mockResolvedValue(undefined);

    const { result } = renderHook(() => useBlackboxLogs());

    await waitFor(() => {
      expect(result.current.logs).toEqual(mockLogs);
    });

    await result.current.openFolder('/path/to/logs');

    expect(window.betaflight.openBlackboxFolder).toHaveBeenCalledWith('/path/to/logs');
  });

  it('reload() reloads log data', async () => {
    const { result } = renderHook(() => useBlackboxLogs());

    await waitFor(() => {
      expect(result.current.logs).toEqual(mockLogs);
    });

    // Clear and call reload
    vi.mocked(window.betaflight.listBlackboxLogs).mockClear();

    const updatedLogs: BlackboxLogMetadata[] = [
      ...mockLogs,
      {
        id: 'log4',
        profileId: 'profile-1',
        fcSerial: 'SERIAL123',
        filename: 'LOG00004.BFL',
        filepath: '/path/to/LOG00004.BFL',
        size: 4194304,
        timestamp: '2024-01-04T12:00:00Z',
        fcInfo: { variant: 'BTFL', version: '4.5.0', target: 'STM32F405' }
      }
    ];
    vi.mocked(window.betaflight.listBlackboxLogs).mockResolvedValue(updatedLogs);

    await result.current.reload();

    await waitFor(() => {
      expect(result.current.logs).toEqual(updatedLogs);
    });

    expect(window.betaflight.listBlackboxLogs).toHaveBeenCalled();
  });
});
