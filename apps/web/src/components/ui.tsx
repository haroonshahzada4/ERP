import { Check, ImagePlus, Trash2, X } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { buildThemeTokens } from '../lib/theme';
import { isHex } from '../lib/colors';
import { THEME_PRESETS, findPreset } from '../lib/themePresets';

/* ---------- Layout bits ---------- */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  icon,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && (
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--erp-accent)]">
            {icon}
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm text-[var(--erp-muted)]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="erp-panel p-5">
      <div className="flex items-center justify-between text-[var(--erp-muted)]">
        <p className="text-xs font-semibold uppercase tracking-wider">{label}</p>
        {icon && (
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--erp-accent-soft)] text-[var(--erp-accent)]">
            {icon}
          </span>
        )}
      </div>
      {loading ? (
        <div className="erp-skeleton mt-3 h-8 w-20" />
      ) : (
        <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      )}
      {hint && <p className="mt-1 text-xs text-[var(--erp-muted)]">{hint}</p>}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'success' | 'danger' | 'warning' | 'accent' | 'neutral';
  children: ReactNode;
}) {
  return <span className={`erp-badge erp-badge-${tone}`}>{children}</span>;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="erp-panel flex flex-col items-center px-6 py-14 text-center">
      {icon && (
        <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--erp-accent-soft)] text-[var(--erp-accent)]">
          {icon}
        </span>
      )}
      <p className="font-semibold">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-[var(--erp-muted)]">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Drawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="erp-backdrop" onMouseDown={onClose}>
      <aside
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-[var(--erp-line)] bg-[var(--erp-panel)] shadow-2xl"
        style={{ animation: 'erp-slide-in 0.2s ease' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--erp-line)] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle && (
              <p className="text-sm text-[var(--erp-muted)]">{subtitle}</p>
            )}
          </div>
          <button type="button" className="erp-icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-[var(--erp-line)] px-6 py-4">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}

/* ---------- Branding helpers ---------- */

export function CompanyAvatar({
  name,
  logoUrl,
  size = 40,
  radius = 12,
}: {
  name: string;
  logoUrl?: string | null;
  size?: number;
  radius?: number;
}) {
  return (
    <div
      className="grid shrink-0 place-items-center overflow-hidden font-bold"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: size * 0.36,
        background: logoUrl ? 'var(--erp-panel-2)' : 'var(--erp-grad-accent)',
        color: 'var(--erp-on-accent)',
        boxShadow: '0 4px 16px var(--erp-accent-glow)',
      }}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" />
      ) : (
        name.slice(0, 2).toUpperCase()
      )}
    </div>
  );
}

/** Wrap children in a subtree that carries its own derived palette. */
export function ThemeScope({
  mode,
  primary,
  secondary,
  className,
  children,
}: {
  mode: 'dark' | 'light';
  primary: string;
  secondary?: string;
  className?: string;
  children: ReactNode;
}) {
  const style = buildThemeTokens(mode, primary, secondary) as CSSProperties;
  return (
    <div className={`erp-scope ${className ?? ''}`} style={style}>
      {children}
    </div>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div>
      <span className="erp-label">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isHex(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-11 cursor-pointer rounded-lg border border-[var(--erp-line)] bg-transparent p-0.5"
          aria-label={label}
        />
        <input
          className="erp-input font-mono"
          value={text}
          maxLength={7}
          onChange={(e) => {
            setText(e.target.value);
            if (isHex(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
          onBlur={() => setText(value)}
        />
      </div>
    </div>
  );
}

export function ThemePresetPicker({
  primary,
  onPick,
}: {
  primary: string;
  onPick: (primary: string, secondary: string) => void;
}) {
  const active = findPreset(primary);
  return (
    <div>
      <span className="erp-label">Brand palette</span>
      <div className="flex flex-wrap gap-2">
        {THEME_PRESETS.map((p) => {
          const selected = active?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              title={p.name}
              onClick={() => onPick(p.primary, p.secondary)}
              className="group relative grid h-9 w-9 place-items-center rounded-full border-2 transition hover:scale-110"
              style={{
                background: `linear-gradient(135deg, ${p.primary}, ${p.secondary})`,
                borderColor: selected ? 'var(--erp-text)' : 'transparent',
              }}
            >
              {selected && <Check size={14} className="text-white drop-shadow" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Downscale to a small PNG/WebP data URL so it fits comfortably in JSON. */
export async function fileToLogoDataUrl(file: File, max = 192): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image');
  if (file.size > 4 * 1024 * 1024) throw new Error('Image must be under 4 MB');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.9);
}

export function LogoUploader({
  value,
  name,
  onChange,
}: {
  value: string;
  name: string;
  onChange: (dataUrlOrUrl: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <span className="erp-label">Company logo</span>
      <div className="flex items-center gap-4">
        <CompanyAvatar name={name || 'Co'} logoUrl={value || null} size={56} radius={14} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="erp-btn erp-btn-ghost erp-btn-sm"
            onClick={() => input.current?.click()}
          >
            <ImagePlus size={14} />
            Upload
          </button>
          {value && (
            <button
              type="button"
              className="erp-btn erp-btn-danger erp-btn-sm"
              onClick={() => onChange('')}
            >
              <Trash2 size={13} />
              Remove
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              setError(null);
              onChange(await fileToLogoDataUrl(file));
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        />
      </div>
      <p className="mt-1.5 text-xs text-[var(--erp-muted)]">
        PNG, JPG, SVG or WebP. Automatically resized.
      </p>
      {error && <p className="mt-1 text-xs text-[var(--erp-danger)]">{error}</p>}
    </div>
  );
}

/** Miniature app mockup rendered with the tenant's derived palette. */
export function BrandPreview({
  name,
  logoUrl,
  primary,
  secondary,
  mode,
}: {
  name: string;
  logoUrl?: string | null;
  primary: string;
  secondary?: string;
  mode: 'dark' | 'light';
}) {
  return (
    <ThemeScope mode={mode} primary={primary} secondary={secondary}>
      <div
        className="overflow-hidden rounded-2xl border border-[var(--erp-line)]"
        style={{ background: 'var(--erp-bg)', color: 'var(--erp-text)' }}
      >
        <div className="flex">
          <div
            className="w-28 space-y-2 border-r border-[var(--erp-line)] p-3"
            style={{ background: 'var(--erp-panel)' }}
          >
            <div className="flex items-center gap-2">
              <CompanyAvatar name={name || 'Co'} logoUrl={logoUrl} size={22} radius={7} />
              <span className="truncate text-[10px] font-semibold">{name || 'Company'}</span>
            </div>
            <div className="erp-nav-item !px-2 !py-1 !text-[10px] erp-nav-item-active">
              Dashboard
            </div>
            <div className="erp-nav-item !px-2 !py-1 !text-[10px]">Employees</div>
            <div className="erp-nav-item !px-2 !py-1 !text-[10px]">Payroll</div>
          </div>
          <div className="flex-1 space-y-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold">Overview</span>
              <span className="erp-btn erp-btn-primary !px-2 !py-0.5 !text-[10px]">
                + Create
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="erp-panel p-2">
                <p className="text-[9px] text-[var(--erp-muted)]">Employees</p>
                <p className="text-sm font-semibold">128</p>
              </div>
              <div className="erp-panel p-2">
                <p className="text-[9px] text-[var(--erp-muted)]">On leave</p>
                <p className="text-sm font-semibold text-[var(--erp-accent)]">6</p>
              </div>
            </div>
            <div className="flex gap-1.5">
              <span className="erp-badge erp-badge-accent !text-[9px]">Active</span>
              <span className="erp-badge erp-badge-neutral !text-[9px]">Draft</span>
            </div>
          </div>
        </div>
      </div>
    </ThemeScope>
  );
}
