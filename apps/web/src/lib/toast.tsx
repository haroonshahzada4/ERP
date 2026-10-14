import {
  CheckCircle2,
  Info,
  AlertTriangle,
  X,
  XCircle,
} from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

type ToastItem = {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
};

type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastContextValue = {
  push: (input: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let idSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = `toast-${++idSeq}`;
      const tone = input.tone ?? 'info';
      setItems((prev) => [
        ...prev.slice(-4),
        {
          id,
          tone,
          title: input.title,
          description: input.description,
        },
      ]);
      const ms = input.durationMs ?? (tone === 'error' ? 6500 : 4200);
      window.setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (title, description) =>
        push({ title, description, tone: 'success' }),
      error: (title, description) => push({ title, description, tone: 'error' }),
      info: (title, description) => push({ title, description, tone: 'info' }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(100vw-2rem,24rem)] flex-col gap-2"
        aria-live="polite"
      >
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: () => void;
}) {
  const Icon =
    item.tone === 'success'
      ? CheckCircle2
      : item.tone === 'error'
        ? XCircle
        : item.tone === 'warning'
          ? AlertTriangle
          : Info;

  const toneClass =
    item.tone === 'success'
      ? 'border-[color-mix(in_srgb,var(--erp-success)_35%,transparent)] bg-[color-mix(in_srgb,var(--erp-success)_12%,var(--erp-panel))] text-[var(--erp-success)]'
      : item.tone === 'error'
        ? 'border-[color-mix(in_srgb,var(--erp-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--erp-danger)_12%,var(--erp-panel))] text-[var(--erp-danger)]'
        : item.tone === 'warning'
          ? 'border-[color-mix(in_srgb,var(--erp-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--erp-warning)_12%,var(--erp-panel))] text-[var(--erp-warning)]'
          : 'border-[color-mix(in_srgb,var(--erp-info)_35%,transparent)] bg-[color-mix(in_srgb,var(--erp-info)_12%,var(--erp-panel))] text-[var(--erp-info)]';

  return (
    <div
      role="status"
      className={`pointer-events-auto flex gap-3 rounded-xl border px-3.5 py-3 shadow-[var(--erp-shadow)] backdrop-blur ${toneClass}`}
    >
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--erp-text)]">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--erp-muted)]">
            {item.description}
          </p>
        )}
      </div>
      <button
        type="button"
        className="shrink-0 rounded-lg p-1 text-[var(--erp-muted)] transition hover:bg-[var(--erp-hover)] hover:text-[var(--erp-text)]"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
