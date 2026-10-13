export type ThemePreset = {
  id: string;
  name: string;
  primary: string;
  secondary: string;
};

/** Curated brand palettes. Tenants may also pick any custom color. */
export const THEME_PRESETS: ThemePreset[] = [
  { id: 'emerald', name: 'Emerald', primary: '#1ecf8a', secondary: '#149a66' },
  { id: 'orange', name: 'Sunset', primary: '#f97316', secondary: '#ea580c' },
  { id: 'sky', name: 'Sky', primary: '#38bdf8', secondary: '#0284c7' },
  { id: 'violet', name: 'Violet', primary: '#8b5cf6', secondary: '#6d28d9' },
  { id: 'rose', name: 'Rose', primary: '#f43f5e', secondary: '#be123c' },
  { id: 'amber', name: 'Amber', primary: '#f59e0b', secondary: '#b45309' },
  { id: 'teal', name: 'Teal', primary: '#14b8a6', secondary: '#0f766e' },
  { id: 'indigo', name: 'Indigo', primary: '#6366f1', secondary: '#4338ca' },
];

/** Super Admin console always uses this — visually distinct from any tenant. */
export const PLATFORM_THEME = {
  primary: '#7c83ff',
  secondary: '#5b5bd6',
} as const;

export function findPreset(primary?: string | null) {
  if (!primary) return undefined;
  return THEME_PRESETS.find(
    (p) => p.primary.toLowerCase() === primary.toLowerCase(),
  );
}
