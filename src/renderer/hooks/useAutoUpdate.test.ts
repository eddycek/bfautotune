import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoUpdate } from './useAutoUpdate';

describe('useAutoUpdate', () => {
  beforeEach(() => {
    vi.mocked(window.betaflight.onUpdateAvailable).mockReturnValue(() => {});
    vi.mocked(window.betaflight.onUpdateDownloaded).mockReturnValue(() => {});
  });

  it('starts with no update', () => {
    const { result } = renderHook(() => useAutoUpdate());
    expect(result.current.updateVersion).toBeNull();
    expect(result.current.updateReady).toBe(false);
  });

  it('sets version when update available', () => {
    let availableCallback: ((info: { version: string }) => void) | null = null;
    vi.mocked(window.betaflight.onUpdateAvailable).mockImplementation((cb) => {
      availableCallback = cb;
      return () => {};
    });

    const { result } = renderHook(() => useAutoUpdate());

    act(() => {
      availableCallback!({ version: '0.2.0' });
    });

    expect(result.current.updateVersion).toBe('0.2.0');
    expect(result.current.updateReady).toBe(false);
  });

  it('sets updateReady when downloaded', () => {
    let downloadedCallback: ((info: { version: string }) => void) | null = null;
    vi.mocked(window.betaflight.onUpdateDownloaded).mockImplementation((cb) => {
      downloadedCallback = cb;
      return () => {};
    });

    const { result } = renderHook(() => useAutoUpdate());

    act(() => {
      downloadedCallback!({ version: '0.2.0' });
    });

    expect(result.current.updateVersion).toBe('0.2.0');
    expect(result.current.updateReady).toBe(true);
  });

  it('calls installUpdate on the API', () => {
    vi.mocked(window.betaflight.installUpdate).mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoUpdate());

    act(() => {
      result.current.installUpdate();
    });

    expect(window.betaflight.installUpdate).toHaveBeenCalled();
  });

  it('cleans up subscriptions on unmount', () => {
    const cleanupAvailable = vi.fn();
    const cleanupDownloaded = vi.fn();
    vi.mocked(window.betaflight.onUpdateAvailable).mockReturnValue(cleanupAvailable);
    vi.mocked(window.betaflight.onUpdateDownloaded).mockReturnValue(cleanupDownloaded);

    const { unmount } = renderHook(() => useAutoUpdate());
    unmount();

    expect(cleanupAvailable).toHaveBeenCalled();
    expect(cleanupDownloaded).toHaveBeenCalled();
  });
});
