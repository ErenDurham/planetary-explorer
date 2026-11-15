// Read a theme token (src/theme.css) as a literal colour string, for the few
// places that cannot take a CSS variable: Recharts presentation attributes and
// three.js colours. Falls back to the token's shipped value where no document
// is available (tests, SSR), so the app and its tests agree.
const FALLBACK: Record<string, string> = {
  "--color-bg": "#181818", "--color-bg-elev": "#1f1f1f", "--color-bg-elev-2": "#272727", "--color-canvas": "#121212",
  "--color-line": "#313131", "--color-line-strong": "#51514b",
  "--color-fg": "#ecebe6", "--color-fg-muted": "#b8b8af", "--color-fg-faint": "#a09f96",
  "--color-copper": "#c2622b", "--color-copper-bright": "#f0a03c", "--color-copper-dim": "#7a3f1f",
  "--color-ok": "#6fb98f", "--color-warn": "#d9a441", "--color-danger": "#d16a5a", "--color-info": "#6ea0d9",
  "--color-teal": "#5fb8b0", "--color-lavender": "#c4a4e8",
  "--font-mono": "IBM Plex Mono, ui-monospace, monospace",
};

export function token(name: keyof typeof FALLBACK | string): string {
  if (typeof document !== "undefined") {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) return v;
  }
  return FALLBACK[name] ?? "";
}

/** `var(--name)` for inline styles and CSS; use `token()` only where a literal is required. */
export const cssVar = (name: string): string => `var(${name})`;
