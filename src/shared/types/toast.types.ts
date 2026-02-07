export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number; // undefined = persistent (errors)
  dismissible?: boolean; // default true
}

export interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export interface ToastHelpers {
  success: (message: string, duration?: number) => void;
  error: (message: string, dismissible?: boolean) => void;
  info: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
}
