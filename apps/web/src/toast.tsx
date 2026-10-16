import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cx } from './ui.js';

/**
 * Lightweight toasts. Written in-house rather than pulled from a library: the
 * production CSP is `style-src 'self'`, and common toast packages inject a
 * <style> element at runtime, which that policy blocks.
 */

type Tone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
}

type Notify = (title: string, options?: { tone?: Tone; body?: string }) => void;

const ToastContext = createContext<Notify>(() => undefined);

export function useToast(): Notify {
  return useContext(ToastContext);
}

const ICON = { success: CheckCircle2, error: XCircle, info: Info } as const;
const ICON_TONE = { success: 'text-emerald-500', error: 'text-red-500', info: 'text-brand-500' } as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);

  const notify = useCallback<Notify>(
    (title, options) => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-3), { id, title, tone: options?.tone ?? 'success', body: options?.body }]);
      setTimeout(() => dismiss(id), options?.tone === 'error' ? 7000 : 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => notify, [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-3 sm:inset-x-auto sm:right-0 sm:items-end sm:p-4"
      >
        {items.map((item) => {
          const Icon = ICON[item.tone];
          return (
            <div
              key={item.id}
              className={cx(
                'pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-2.5 rounded-xl bg-white p-3 shadow-lift ring-1',
                item.tone === 'error' ? 'ring-red-200' : 'ring-slate-200',
              )}
            >
              <Icon aria-hidden className={cx('mt-px h-4 w-4 shrink-0', ICON_TONE[item.tone])} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-slate-900">{item.title}</p>
                {item.body && <p className="mt-0.5 text-xs text-slate-600">{item.body}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Dismiss notification"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
