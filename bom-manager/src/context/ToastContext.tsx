import React, { createContext, useContext, useState, useCallback } from 'react';
import Toast from '../components/ui/Toast';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  showToast: (type: ToastType, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    
    // Auto-removal is handled by the Toast component itself via duration,
    // but we can keep a fallback here if needed. 
    // In our component, we use 5000ms by default.
  }, []);

  const success = (msg: string) => showToast('success', msg);
  const error = (msg: string) => showToast('error', msg);
  const info = (msg: string) => showToast('info', msg);
  const warn = (msg: string) => showToast('warning', msg);

  return (
    <ToastContext.Provider value={{ showToast, success, error, info, warn }}>
      {children}
      <div className="fixed top-8 right-8 z-[9999] flex flex-col items-end pointer-events-none">
        <div className="pointer-events-auto flex flex-col items-end">
            {toasts.map((toast) => (
            <Toast
                key={toast.id}
                id={toast.id}
                type={toast.type}
                message={toast.message}
                onClose={removeToast}
                duration={4500}
            />
            ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};
