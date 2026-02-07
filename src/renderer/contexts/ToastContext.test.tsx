import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ToastProvider, ToastContext } from './ToastContext';
import { useContext } from 'react';

describe('ToastContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('provides initial empty toast array', () => {
    const { result } = renderHook(() => useContext(ToastContext), {
      wrapper: ToastProvider
    });

    expect(result.current).toBeDefined();
    expect(result.current!.toasts).toEqual([]);
  });

  it('addToast generates unique IDs', () => {
    const { result } = renderHook(() => useContext(ToastContext), {
      wrapper: ToastProvider
    });

    act(() => {
      result.current!.addToast({ type: 'success', message: 'Test 1' });
      result.current!.addToast({ type: 'info', message: 'Test 2' });
    });

    expect(result.current!.toasts).toHaveLength(2);
    expect(result.current!.toasts[0].id).toBeDefined();
    expect(result.current!.toasts[1].id).toBeDefined();
    expect(result.current!.toasts[0].id).not.toBe(result.current!.toasts[1].id);
  });

  it('removeToast removes specific toast', () => {
    const { result } = renderHook(() => useContext(ToastContext), {
      wrapper: ToastProvider
    });

    let toastId: string;

    act(() => {
      toastId = result.current!.addToast({ type: 'success', message: 'Test' });
      result.current!.addToast({ type: 'info', message: 'Keep this' });
    });

    expect(result.current!.toasts).toHaveLength(2);

    act(() => {
      result.current!.removeToast(toastId);
    });

    expect(result.current!.toasts).toHaveLength(1);
    expect(result.current!.toasts[0].message).toBe('Keep this');
  });

  it('clearToasts removes all toasts', () => {
    const { result } = renderHook(() => useContext(ToastContext), {
      wrapper: ToastProvider
    });

    act(() => {
      result.current!.addToast({ type: 'success', message: 'Test 1' });
      result.current!.addToast({ type: 'info', message: 'Test 2' });
      result.current!.addToast({ type: 'warning', message: 'Test 3' });
    });

    expect(result.current!.toasts).toHaveLength(3);

    act(() => {
      result.current!.clearToasts();
    });

    expect(result.current!.toasts).toEqual([]);
  });

  it('auto-dismisses toasts with duration', () => {
    const { result } = renderHook(() => useContext(ToastContext), {
      wrapper: ToastProvider
    });

    act(() => {
      result.current!.addToast({
        type: 'success',
        message: 'Auto dismiss',
        duration: 3000
      });
    });

    expect(result.current!.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current!.toasts).toHaveLength(0);
  });

  it('error toasts persist without duration', async () => {
    const { result } = renderHook(() => useContext(ToastContext), {
      wrapper: ToastProvider
    });

    act(() => {
      result.current!.addToast({
        type: 'error',
        message: 'Persistent error'
        // No duration
      });
    });

    expect(result.current!.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Should still be there
    expect(result.current!.toasts).toHaveLength(1);
    expect(result.current!.toasts[0].message).toBe('Persistent error');
  });

  it('enforces max 5 toast limit with FIFO removal', () => {
    const { result } = renderHook(() => useContext(ToastContext), {
      wrapper: ToastProvider
    });

    act(() => {
      for (let i = 1; i <= 10; i++) {
        result.current!.addToast({
          type: 'info',
          message: `Toast ${i}`
        });
      }
    });

    expect(result.current!.toasts).toHaveLength(5);
    // First 5 should be removed, last 5 remain
    expect(result.current!.toasts[0].message).toBe('Toast 6');
    expect(result.current!.toasts[4].message).toBe('Toast 10');
  });

  it('sets dismissible to true by default', () => {
    const { result } = renderHook(() => useContext(ToastContext), {
      wrapper: ToastProvider
    });

    act(() => {
      result.current!.addToast({
        type: 'success',
        message: 'Test'
      });
    });

    expect(result.current!.toasts[0].dismissible).toBe(true);
  });

  it('respects custom dismissible value', () => {
    const { result } = renderHook(() => useContext(ToastContext), {
      wrapper: ToastProvider
    });

    act(() => {
      result.current!.addToast({
        type: 'error',
        message: 'Test',
        dismissible: false
      });
    });

    expect(result.current!.toasts[0].dismissible).toBe(false);
  });

  it('clears timer when toast is manually removed before auto-dismiss', async () => {
    const { result } = renderHook(() => useContext(ToastContext), {
      wrapper: ToastProvider
    });

    let toastId: string;

    act(() => {
      toastId = result.current!.addToast({
        type: 'success',
        message: 'Manual remove',
        duration: 3000
      });
    });

    expect(result.current!.toasts).toHaveLength(1);

    // Remove manually before timer expires
    act(() => {
      result.current!.removeToast(toastId);
    });

    expect(result.current!.toasts).toHaveLength(0);

    // Advance time to when timer would have fired
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Should still be 0 (no duplicate removal)
    expect(result.current!.toasts).toHaveLength(0);
  });
});
