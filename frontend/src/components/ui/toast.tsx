import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RiBroadcastLine } from 'react-icons/ri';
import { XCircle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info' | 'auth_error';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

let toastId = 0;
const listeners: Array<(toasts: Toast[]) => void> = [];
let toasts: Toast[] = [];

const addToast = (message: string, type: ToastType = 'info', duration = 3000) => {
  const id = `toast-${toastId++}`;
  const newToast: Toast = { id, message, type };
  
  toasts = [...toasts, newToast];
  listeners.forEach(listener => listener(toasts));
  
  if (duration > 0) {
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }
  
  return id;
};

const removeToast = (id: string) => {
  toasts = toasts.filter(toast => toast.id !== id);
  listeners.forEach(listener => listener(toasts));
};

const subscribe = (callback: (toasts: Toast[]) => void) => {
  listeners.push(callback);
  return () => {
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
};

// Export API similar to message
export const message = {
  success: (content: string, duration?: number) => addToast(content, 'success', duration),
  error: (content: string, duration?: number, isAuthError?: boolean) => 
    addToast(content, isAuthError ? 'auth_error' : 'error', duration),
  warning: (content: string, duration?: number) => addToast(content, 'warning', duration),
  info: (content: string, duration?: number) => addToast(content, 'info', duration),
};

const ToastItem: React.FC<{ toast: Toast }> = ({ toast }) => {
  // Neutral style: no success/error color distinction
  const getToastStyles = () => {
    return {
      container: 'bg-white/70 border border-gray-300/70 backdrop-blur-[1px]',
      icon: toast.type === 'auth_error'
        ? <XCircle className="w-5 h-5 text-gray-600 flex-shrink-0" />
        : <RiBroadcastLine className="w-5 h-5 text-gray-600 flex-shrink-0" />,
      text: 'text-gray-900'
    };
  };

  const styles = getToastStyles();

  return (
    <div
      className={`${styles.container} rounded-lg shadow-lg px-4 py-3 text-sm font-medium max-w-sm mb-2 flex items-center gap-3 ${styles.text} animate-slide-in-from-right`}
    >
      {styles.icon}
      <span className="flex-1">{toast.message}</span>
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const [currentToasts, setCurrentToasts] = useState<Toast[]>([]);
  const [topOffset, setTopOffset] = useState(68); // 64(header) + 4px gap

  useEffect(() => {
    const unsubscribe = subscribe(setCurrentToasts);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const syncTopOffset = () => {
      const header = document.querySelector('.app-header') as HTMLElement | null;
      if (!header) {
        setTopOffset(68);
        return;
      }
      const headerBottom = Math.round(header.getBoundingClientRect().bottom);
      setTopOffset(headerBottom + 4);
    };

    syncTopOffset();
    window.addEventListener('resize', syncTopOffset);
    window.addEventListener('scroll', syncTopOffset, true);
    return () => {
      window.removeEventListener('resize', syncTopOffset);
      window.removeEventListener('scroll', syncTopOffset, true);
    };
  }, []);

  if (currentToasts.length === 0) return null;

  return createPortal(
    <>
      <style>
        {`
          @keyframes slideInFromRight {
            from {
              opacity: 0;
              transform: translateX(100%);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
          .animate-slide-in-from-right {
            animation: slideInFromRight 0.3s ease-out;
          }
        `}
      </style>
      <div
        className="fixed right-2 z-[10000] flex flex-col gap-2"
        style={{ top: `${topOffset}px` }}
      >
        {currentToasts.map(toast => (
          <ToastItem
            key={toast.id}
            toast={toast}
          />
        ))}
      </div>
    </>,
    document.body
  );
};

