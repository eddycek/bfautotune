import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFCInfo } from './useFCInfo';
import type { FCInfo } from '@shared/types/common.types';

describe('useFCInfo', () => {
  const mockFCInfo: FCInfo = {
    variant: 'BTFL',
    version: '4.5.0',
    target: 'MATEKF405',
    boardName: 'MATEKF405',
    apiVersion: { protocol: 1, major: 12, minor: 0 }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with null fcInfo, loading false, and no error', () => {
    const { result } = renderHook(() => useFCInfo());

    expect(result.current.fcInfo).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetchFCInfo sets fcInfo on success', async () => {
    vi.mocked(window.betaflight.getFCInfo).mockResolvedValue(mockFCInfo);

    const { result } = renderHook(() => useFCInfo());

    await result.current.fetchFCInfo();

    await waitFor(() => {
      expect(result.current.fcInfo).toEqual(mockFCInfo);
      expect(result.current.error).toBeNull();
    });

    expect(window.betaflight.getFCInfo).toHaveBeenCalled();
  });

  it('fetchFCInfo sets error on failure and clears fcInfo', async () => {
    const errorMessage = 'Failed to fetch FC info';
    vi.mocked(window.betaflight.getFCInfo).mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useFCInfo());

    // Set initial fcInfo
    vi.mocked(window.betaflight.getFCInfo).mockResolvedValueOnce(mockFCInfo);
    await result.current.fetchFCInfo();

    await waitFor(() => {
      expect(result.current.fcInfo).toEqual(mockFCInfo);
    });

    // Now fail the fetch
    vi.mocked(window.betaflight.getFCInfo).mockRejectedValue(new Error(errorMessage));
    await result.current.fetchFCInfo();

    await waitFor(() => {
      expect(result.current.error).toBe(errorMessage);
      expect(result.current.fcInfo).toBeNull();
    });
  });

  it('fetchFCInfo manages loading state correctly', async () => {
    vi.mocked(window.betaflight.getFCInfo).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(mockFCInfo), 100))
    );

    const { result } = renderHook(() => useFCInfo());

    result.current.fetchFCInfo();

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.fcInfo).toEqual(mockFCInfo);
    });
  });

  it('exportCLI returns CLI string on success', async () => {
    const mockCLI = 'set gyro_lpf1_static_hz = 250\nset gyro_lpf2_static_hz = 500';
    vi.mocked(window.betaflight.exportCLI).mockResolvedValue(mockCLI);

    const { result } = renderHook(() => useFCInfo());

    const cli = await result.current.exportCLI('diff');

    expect(cli).toBe(mockCLI);
    expect(window.betaflight.exportCLI).toHaveBeenCalledWith('diff');
  });

  it('exportCLI returns null and sets error on failure', async () => {
    const errorMessage = 'CLI export failed';
    vi.mocked(window.betaflight.exportCLI).mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useFCInfo());

    const cli = await result.current.exportCLI('diff');

    expect(cli).toBeNull();

    await waitFor(() => {
      expect(result.current.error).toBe(errorMessage);
    });
  });

  it('exportCLI passes format parameter correctly', async () => {
    const mockCLI = 'dump all';
    vi.mocked(window.betaflight.exportCLI).mockResolvedValue(mockCLI);

    const { result } = renderHook(() => useFCInfo());

    // Test 'diff' format
    await result.current.exportCLI('diff');
    expect(window.betaflight.exportCLI).toHaveBeenCalledWith('diff');

    // Test 'dump' format
    await result.current.exportCLI('dump');
    expect(window.betaflight.exportCLI).toHaveBeenCalledWith('dump');
  });

  it('exportCLI manages loading state correctly', async () => {
    const mockCLI = 'set gyro_lpf1_static_hz = 250';
    vi.mocked(window.betaflight.exportCLI).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(mockCLI), 100))
    );

    const { result } = renderHook(() => useFCInfo());

    const promise = result.current.exportCLI('diff');

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    await promise;

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});
