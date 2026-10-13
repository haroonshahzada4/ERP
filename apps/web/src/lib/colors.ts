export type RGB = { r: number; g: number; b: number };
export type HSL = { h: number; s: number; l: number };

export function isHex(value: string | undefined | null): value is string {
  return !!value && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function hexToRgb(hex: string): RGB {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: RGB) {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export const hslHex = (h: number, s: number, l: number) =>
  rgbToHex(hslToRgb({ h, s, l }));

function channel(v: number) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio (1–21). */
export function contrast(a: string, b: string) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Nudge lightness of `hex` (lighter on dark surfaces, darker on light ones)
 * until it reaches `min` contrast against `bg`. Keeps hue/saturation.
 */
export function ensureContrast(
  hex: string,
  bg: string,
  min: number,
  direction: 'lighten' | 'darken',
) {
  let hsl = rgbToHsl(hexToRgb(hex));
  let guard = 0;
  let out = hex;
  while (contrast(out, bg) < min && guard < 40) {
    hsl = {
      ...hsl,
      l:
        direction === 'lighten'
          ? Math.min(0.96, hsl.l + 0.02)
          : Math.max(0.05, hsl.l - 0.02),
    };
    out = rgbToHex(hslToRgb(hsl));
    guard += 1;
  }
  return out;
}

/** Readable text color to place on top of `bg` fills. */
export function onColor(bg: string) {
  return contrast(bg, '#ffffff') >= contrast(bg, '#0a0f0d')
    ? '#ffffff'
    : '#0a0f0d';
}

/** Derive a harmonious secondary when the tenant only supplied a primary. */
export function deriveSecondary(primary: string) {
  const { h, s, l } = rgbToHsl(hexToRgb(primary));
  return hslHex(h, Math.min(1, s * 1.05), Math.max(0.2, l - 0.12));
}
