// Shared Recharts styling, read from the app theme (src/theme.css) so charts
// follow the same palette as everything else. Recharts wants literal colour
// strings, hence token() rather than CSS variables.
import { token } from "@/lib/theme";

export const AXIS = { stroke: token("--color-line-strong"), fontSize: 10, fill: token("--color-fg-muted") } as const;
export const GRID = token("--color-line");
export const TOOLTIP_STYLE = {
  backgroundColor: token("--color-bg-elev-2"),
  border: `1px solid ${token("--color-line-strong")}`,
  borderRadius: 4,
  fontSize: 11,
  color: token("--color-fg"),
  fontFamily: token("--font-mono"),
} as const;
export const COPPER = token("--color-copper");
export const COPPER_BRIGHT = token("--color-copper-bright");
export const INFO = token("--color-info");
export const MUTED = token("--color-line-strong");
