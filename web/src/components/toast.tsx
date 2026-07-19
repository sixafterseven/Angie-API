/**
 * Lightweight toast system. Mounted once in AppShell so every authenticated
 * screen can confirm an action (export ready, list saved, copied) without a
 * per-page setup. Auto-dismisses; restrained, no animation beyond a soft fade.
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { Check, Info, X } from "lucide-react";

type ToastTone = "success" | "info";
type Toast = { id: number; message: string; tone: ToastTone };

type ToastContextValue = {
  notify: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  // A no-op fallback keeps components usable outside the provider (e.g. tests).
  return ctx ?? { notify: () => {} };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const notify = useCallback((message: string, tone: ToastTone = "success") => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((current) => [...current, { id, message, tone }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <ToastRow key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 3200);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  const Icon = toast.tone === "success" ? Check : Info;

  return (
    <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-line bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-lg">
      <Icon size={16} className={toast.tone === "success" ? "text-positive" : "text-accent"} />
      <span>{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-1 text-white/60 transition hover:text-white"
      >
        <X size={14} />
      </button>
    </div>
  );
}
