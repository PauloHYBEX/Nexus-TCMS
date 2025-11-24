export type ThemeVars = Record<string, string>;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const match = hex.trim().replace('#', '');
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(match)) return null;
  const full = match.length === 3
    ? match.split('').map((c) => c + c).join('')
    : match;
  const r = parseInt(full.substring(0, 2), 16) / 255;
  const g = parseInt(full.substring(2, 4), 16) / 255;
  const b = parseInt(full.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function fmtHsl(h: number, s: number, l: number) {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

function shiftLightness(l: number, delta: number) {
  return clamp(l + delta, 0, 100);
}

export function computeThemeVars(hex: string): ThemeVars | null {
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  const { h, s, l } = hsl;
  const hoverL = shiftLightness(l, 7); // sutil

  const { r, g, b } = hslToRgb(h, s, l);
  const lum = relativeLuminance(r, g, b);
  const useDarkText = lum > 0.6; // fundo claro → texto escuro; caso contrário, texto claro
  const primaryFg = useDarkText ? '0 0% 10%' : '0 0% 100%';

  return {
    // Tokens de marca/gradiente
    '--brand': fmtHsl(h, s, l),
    '--brand-hover': fmtHsl(h, s, hoverL),
    '--brand-foreground': primaryFg,
    // Tokens primários (shadcn/ui)
    '--primary': fmtHsl(h, s, l),
    '--primary-foreground': primaryFg,
    '--ring': fmtHsl(h, s, l),
  };
}

export function applyProjectTheme(hex: string) {
  const vars = computeThemeVars(hex);
  if (!vars) return;
  const root = document.documentElement;
  const body = document.body;
  Object.entries(vars).forEach(([k, v]) => {
    root.style.setProperty(k, v);
    body.style.setProperty(k, v);
  });
}

export function resetProjectTheme() {
  const root = document.documentElement;
  const body = document.body;
  [
    '--brand',
    '--brand-hover',
    '--brand-foreground',
    '--primary',
    '--primary-foreground',
    '--ring',
  ].forEach((k) => {
    root.style.removeProperty(k);
    body.style.removeProperty(k);
  });
}

// Helpers
function hslToRgb(h: number, s: number, l: number) {
  const S = s / 100;
  const L = l / 100;
  const C = (1 - Math.abs(2 * L - 1)) * S;
  const X = C * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - C / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (0 <= h && h < 60) { r1 = C; g1 = X; b1 = 0; }
  else if (60 <= h && h < 120) { r1 = X; g1 = C; b1 = 0; }
  else if (120 <= h && h < 180) { r1 = 0; g1 = C; b1 = X; }
  else if (180 <= h && h < 240) { r1 = 0; g1 = X; b1 = C; }
  else if (240 <= h && h < 300) { r1 = X; g1 = 0; b1 = C; }
  else { r1 = C; g1 = 0; b1 = X; }
  return {
    r: r1 + m,
    g: g1 + m,
    b: b1 + m,
  };
}

function relativeLuminance(r: number, g: number, b: number) {
  const srgb = [r, g, b].map((v) => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  const [R, G, B] = srgb;
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
