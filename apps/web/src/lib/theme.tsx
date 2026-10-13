import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  deriveSecondary,
  ensureContrast,
  hexToRgb,
  hslHex,
  isHex,
  onColor,
  rgbToHsl,
} from './colors';
import { PLATFORM_THEME } from './themePresets';

export type Branding = {
  name?: string;
  logoUrl?: string | null;
  brandPrimary?: string;
  brandSecondary?: string;
  themeMode?: 'dark' | 'light';
};

export type ModePreference = 'light' | 'dark' | 'system' | null;
export type ThemeScope = 'tenant' | 'platform';
type Mode = 'dark' | 'light';

const PREF_KEY = 'erp.themePref';
const DEFAULT_PRIMARY = '#1ecf8a';

export type ThemeTokens = Record<string, string>;

/**
 * Build the full token set from one brand color.
 * Surfaces are tinted with the brand hue (low saturation) so every tenant
 * feels cohesive, and accents are contrast-corrected for the active mode.
 */
export function buildThemeTokens(
  mode: Mode,
  primaryInput?: string,
  secondaryInput?: string,
): ThemeTokens {
  const primary = isHex(primaryInput) ? primaryInput : DEFAULT_PRIMARY;
  const secondary = isHex(secondaryInput)
    ? secondaryInput
    : deriveSecondary(primary);
  const { h, s } = rgbToHsl(hexToRgb(primary));
  const t = Math.min(0.2, Math.max(0.06, s * 0.22));

  const dark = mode === 'dark';
  const bg = dark ? hslHex(h, t, 0.055) : hslHex(h, t * 1.2, 0.965);
  const panel = dark ? hslHex(h, t, 0.085) : '#ffffff';
  const panel2 = dark ? hslHex(h, t, 0.115) : hslHex(h, t * 1.2, 0.94);
  const line = dark ? hslHex(h, t, 0.17) : hslHex(h, t, 0.87);
  const lineHover = dark ? hslHex(h, t * 1.1, 0.27) : hslHex(h, t, 0.76);
  const text = dark ? hslHex(h, 0.15, 0.96) : hslHex(h, 0.3, 0.11);
  const muted = dark ? hslHex(h, 0.08, 0.68) : hslHex(h, 0.1, 0.38);

  const accent = ensureContrast(
    primary,
    panel,
    dark ? 4.5 : 3.6,
    dark ? 'lighten' : 'darken',
  );
  const accent2 = ensureContrast(
    secondary,
    panel,
    dark ? 3 : 3,
    dark ? 'lighten' : 'darken',
  );

  return {
    '--erp-bg': bg,
    '--erp-panel': panel,
    '--erp-panel-2': panel2,
    '--erp-line': line,
    '--erp-line-hover': lineHover,
    '--erp-text': text,
    '--erp-muted': muted,
    '--erp-accent': accent,
    '--erp-accent-2': accent2,
    '--erp-on-accent': onColor(accent),
    '--erp-hover': dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,20,0.045)',
    '--erp-danger': dark ? '#f87171' : '#dc2626',
    '--erp-warning': dark ? '#fbbf24' : '#b45309',
    '--erp-info': dark ? '#60a5fa' : '#2563eb',
    '--erp-success': dark ? '#34d399' : '#059669',
    '--erp-shadow': dark
      ? '0 12px 32px rgba(0,0,0,0.38)'
      : '0 10px 28px rgba(16,32,24,0.09)',
  };
}

function applyTokens(mode: Mode, tokens: ThemeTokens) {
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value);
  }
}

function systemMode(): Mode {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

function readPreference(): ModePreference {
  const raw = localStorage.getItem(PREF_KEY);
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : null;
}

type ThemeContextValue = {
  /** Resolved mode actually applied. */
  mode: Mode;
  /** User choice; null = follow company default. */
  preference: ModePreference;
  setPreference: (pref: ModePreference) => void;
  toggleMode: () => void;
  branding: Branding;
  setBranding: (branding: Branding) => void;
  scope: ThemeScope;
  setScope: (scope: ThemeScope) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] =
    useState<ModePreference>(readPreference);
  const [branding, setBrandingState] = useState<Branding>({});
  const [scope, setScope] = useState<ThemeScope>('tenant');
  const [system, setSystem] = useState<Mode>(systemMode);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!mq) return;
    const onChange = () => setSystem(mq.matches ? 'light' : 'dark');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const mode: Mode =
    preference === 'system'
      ? system
      : (preference ?? branding.themeMode ?? 'dark');

  useLayoutEffect(() => {
    const primary =
      scope === 'platform' ? PLATFORM_THEME.primary : branding.brandPrimary;
    const secondary =
      scope === 'platform' ? PLATFORM_THEME.secondary : branding.brandSecondary;
    applyTokens(mode, buildThemeTokens(mode, primary, secondary));
  }, [mode, scope, branding.brandPrimary, branding.brandSecondary]);

  const setPreference = useCallback((pref: ModePreference) => {
    setPreferenceState(pref);
    if (pref) localStorage.setItem(PREF_KEY, pref);
    else localStorage.removeItem(PREF_KEY);
  }, []);

  const setBranding = useCallback((next: Branding) => {
    setBrandingState((prev) =>
      prev.name === next.name &&
      prev.logoUrl === next.logoUrl &&
      prev.brandPrimary === next.brandPrimary &&
      prev.brandSecondary === next.brandSecondary &&
      prev.themeMode === next.themeMode
        ? prev
        : next,
    );
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      preference,
      setPreference,
      toggleMode: () => setPreference(mode === 'dark' ? 'light' : 'dark'),
      branding,
      setBranding,
      scope,
      setScope,
    }),
    [mode, preference, setPreference, branding, setBranding, scope],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
