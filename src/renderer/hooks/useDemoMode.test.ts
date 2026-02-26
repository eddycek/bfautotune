import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDemoMode, _resetDemoModeCache } from './useDemoMode';

describe('useDemoMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetDemoModeCache();
  });

  it('returns false by default', () => {
    vi.mocked(window.betaflight.isDemoMode).mockResolvedValue(false);
    const { result } = renderHook(() => useDemoMode());
    expect(result.current.isDemoMode).toBe(false);
  });

  it('returns true when API reports demo mode', async () => {
    vi.mocked(window.betaflight.isDemoMode).mockResolvedValue(true);
    const { result } = renderHook(() => useDemoMode());

    await waitFor(() => {
      expect(result.current.isDemoMode).toBe(true);
    });
  });

  it('caches the result across renders', async () => {
    vi.mocked(window.betaflight.isDemoMode).mockResolvedValue(true);
    const { result, unmount } = renderHook(() => useDemoMode());

    await waitFor(() => {
      expect(result.current.isDemoMode).toBe(true);
    });

    unmount();

    // Second render should use cache — no additional API call
    const { result: result2 } = renderHook(() => useDemoMode());
    expect(result2.current.isDemoMode).toBe(true);
    expect(window.betaflight.isDemoMode).toHaveBeenCalledTimes(1);
  });
});
