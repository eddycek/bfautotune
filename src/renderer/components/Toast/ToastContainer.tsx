import React, { useContext } from 'react';
import { createPortal } from 'react-dom';
import { ToastContext } from '../../contexts/ToastContext';
import { Toast } from './Toast';
import './ToastContainer.css';

export function ToastContainer() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('ToastContainer must be used within ToastProvider');
  }

  const { toasts, removeToast } = context;

  return createPortal(
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          {...toast}
          onDismiss={() => removeToast(toast.id)}
        />
      ))}
    </div>,
    document.body
  );
}
