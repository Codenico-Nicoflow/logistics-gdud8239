import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { he } from '../i18n/he';

export type ToastTone = 'success' | 'error' | 'info';

export type ToastInput = {
  /** The headline — what happened, in the past tense. */
  title: string;
  /** The specifics worth keeping: who, which item, which מסד. */
  detail?: string;
  tone?: ToastTone;
  /** An undo or follow-up the operator may want immediately. */
  action?: { label: string; onClick: () => void };
};

type Toast = ToastInput & { id: number; tone: ToastTone; leaving: boolean };

type ToastApi = {
  success: (input: Omit<ToastInput, 'tone'>) => void;
  error: (input: Omit<ToastInput, 'tone'>) => void;
  info: (input: Omit<ToastInput, 'tone'>) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** Long enough to read a serial and a name; an error stays until dismissed. */
const DISMISS_AFTER: Record<ToastTone, number> = {
  success: 5000,
  info: 5000,
  error: 0,
};

/** Beyond this the stack is taller than it is useful; the oldest drop off. */
const MAX_VISIBLE = 4;

const LEAVE_MS = 200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    // Marked leaving first so the exit animation can run; the row is only
    // dropped once it has played, which keeps the stack from jumping.
    setToasts((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    const timer = setTimeout(() => {
      setToasts((all) => all.filter((t) => t.id !== id));
      timers.current.delete(id);
    }, LEAVE_MS);
    timers.current.set(id, timer);
  }, []);

  const push = useCallback(
    (tone: ToastTone, input: Omit<ToastInput, 'tone'>) => {
      const id = nextId.current++;
      setToasts((all) => [...all, { ...input, id, tone, leaving: false }].slice(-MAX_VISIBLE));

      const after = DISMISS_AFTER[tone];
      if (after > 0) {
        const timer = setTimeout(() => remove(id), after);
        timers.current.set(id, timer);
      }
    },
    [remove],
  );

  // Timers outlive the toast if the tree unmounts mid-flight.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (input) => push('success', input),
      error: (input) => push('error', input),
      info: (input) => push('info', input),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastStack toasts={toasts} onDismiss={remove} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside ToastProvider');
  return api;
}

const TONE_STYLE: Record<ToastTone, { bar: string; icon: string; title: string }> = {
  success: { bar: 'bg-field', icon: 'text-field-dark', title: 'text-field-dark' },
  error: { bar: 'bg-oxide', icon: 'text-oxide', title: 'text-oxide' },
  info: { bar: 'bg-brass-bright', icon: 'text-brass', title: 'text-brass' },
};

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    /* Pinned to the physical left. The navigation rail occupies the right in
       this RTL layout, so a logical `start` would put every toast underneath
       it. `pointer-events-none` on the column keeps a stale toast from
       swallowing a click aimed at the page. */
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-stretch gap-2 p-4 sm:inset-x-auto sm:left-0 sm:w-96"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const tone = TONE_STYLE[toast.tone];

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={`toast pointer-events-auto flex w-full gap-3 overflow-hidden rounded-panel border border-rule bg-card-raised shadow-lift ${
        toast.leaving ? 'toast-leaving' : ''
      }`}
    >
      <span className={`w-1 shrink-0 ${tone.bar}`} aria-hidden="true" />
      <div className="flex-1 py-3">
        <div className="flex items-start gap-2">
          <span className={`shrink-0 font-bold ${tone.icon}`} aria-hidden="true">
            {toast.tone === 'success' ? '✓' : toast.tone === 'error' ? '!' : 'i'}
          </span>
          <div className="min-w-0 flex-1">
            <p className={`font-semibold ${tone.title}`}>{toast.title}</p>
            {toast.detail && <p className="mt-0.5 text-meta text-ink-soft">{toast.detail}</p>}
            {toast.action && (
              <button
                onClick={() => {
                  toast.action?.onClick();
                  onDismiss();
                }}
                className="mt-1.5 text-meta font-semibold text-field hover:underline"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={onDismiss}
        aria-label={he.common.close}
        className="shrink-0 px-3 py-3 text-graphite hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
