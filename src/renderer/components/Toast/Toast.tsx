import React from 'react';
import type { Toast as ToastType } from '@shared/types/toast.types';
import './Toast.css';

interface ToastProps extends ToastType {
  onDismiss: () => void;
}

const TOAST_ICONS = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠'
} as const;

export function Toast({ type, message, duration, dismissible, onDismiss }: ToastProps) {
  const ariaLive = type === 'error' ? 'assertive' : 'polite';

  return (
    <div
      className={`toast toast--${type}`}
      role="status"
      aria-live={ariaLive}
      aria-atomic="true"
    >
      <span className="toast__icon" aria-hidden="true">
        {TOAST_ICONS[type]}
      </span>
      <div className="toast__content">
        <p className="toast__message">{message}</p>
      </div>
      {dismissible && (
        <button
          className="toast__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          type="button"
        >
          ×
        </button>
      )}
      {duration !== undefined && (
        <div
          className="toast__progress"
          style={{ animationDuration: `${duration}ms` }}
        />
      )}
    </div>
  );
}
