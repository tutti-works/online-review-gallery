'use client';

import { useEffect, useState } from 'react';

export interface ToastMessage {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
}

export default function ToastNotification() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleToastEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{
        type: 'info' | 'warning' | 'error' | 'success';
        message: string;
        duration?: number;
      }>;
      const { type = 'info', message, duration = 4000 } = customEvent.detail || {};
      const id = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      setToasts((prev) => [...prev, { id, type, message }]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    };

    window.addEventListener('app:toast', handleToastEvent);
    return () => {
      window.removeEventListener('app:toast', handleToastEvent);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 max-w-md pointer-events-none">
      {toasts.map((toast) => {
        let borderClass = 'border-amber-500/50 bg-[#151a26]/95 text-amber-200';
        let icon = '🔒';

        if (toast.type === 'error') {
          borderClass = 'border-rose-500/50 bg-[#1c141a]/95 text-rose-200';
          icon = '⚠️';
        } else if (toast.type === 'success') {
          borderClass = 'border-emerald-500/50 bg-[#121c18]/95 text-emerald-200';
          icon = '✓';
        } else if (toast.type === 'info') {
          borderClass = 'border-blue-500/50 bg-[#131b2c]/95 text-blue-200';
          icon = 'ℹ';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-xl animate-slide-up text-sm transition-all duration-300 ${borderClass}`}
            role="status"
          >
            <span className="text-base select-none mt-0.5">{icon}</span>
            <div className="flex-1 font-medium leading-relaxed">{toast.message}</div>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-xs opacity-50 hover:opacity-100 transition-opacity p-0.5"
              aria-label="閉じる"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
