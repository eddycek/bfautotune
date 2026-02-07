import { useContext } from 'react';
import { ToastContext } from '../contexts/ToastContext';
import type { ToastHelpers } from '@shared/types/toast.types';

const DEFAULT_DURATION = 3000; // 3 seconds

export function useToast(): ToastHelpers {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }

  return {
    success: (message: string, duration: number = DEFAULT_DURATION) => {
      context.addToast({ type: 'success', message, duration });
    },

    error: (message: string, dismissible: boolean = true) => {
      context.addToast({ type: 'error', message, dismissible });
    },

    info: (message: string, duration: number = DEFAULT_DURATION) => {
      context.addToast({ type: 'info', message, duration });
    },

    warning: (message: string, duration: number = DEFAULT_DURATION) => {
      context.addToast({ type: 'warning', message, duration });
    }
  };
}
