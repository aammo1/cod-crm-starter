// WCAG 2.x contrast helpers. Pure, no dependencies. Server/config use only: never import in client bundles.
const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const LIGHT_FOREGROUND = "#ffffff";
export const DARK_FOREGROUND = "#111827";

/** The better-contrast of white / dark text against `bg`. */
export function bestForeground(bg: string): string {
  return contrastRatio(bg, LIGHT_FOREGROUND) >= contrastRatio(bg, DARK_FOREGROUND) ? LIGHT_FOREGROUND : DARK_FOREGROUND;
}
