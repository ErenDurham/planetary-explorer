// Score -> colour mapping shared by the globe markers, the ranked list and the
// ranked-sites chart, so one encoding is used everywhere. Colour is never the
// only encoding: every consumer also shows the rank number and status text.
import type { SuitabilityStatus } from "@/types";

/** Continuous scale: low = muted grey-red, high = bright copper/amber. */
const LOW: [number, number, number] = [0x6b, 0x3a, 0x33]; // muted grey-red
const MID: [number, number, number] = [0xa3, 0x4a, 0x2a]; // rust
const HIGH: [number, number, number] = [0xf0, 0xa0, 0x3c]; // bright copper/amber

export const INELIGIBLE_COLOR = "#4a4f57";
export const INSUFFICIENT_COLOR = "#8a919c";
export const UNSCORED_COLOR = "#7c8591";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function toHex(rgb: [number, number, number]): string {
  return "#" + rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("");
}

/** Map a 0..100 relative suitability index to a hex colour. */
export function scoreToColor(score: number): string {
  const t = Math.max(0, Math.min(1, score / 100));
  const stops: Array<[number, [number, number, number]]> = [
    [0, LOW],
    [0.55, MID],
    [1, HIGH],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      return toHex([lerp(c0[0], c1[0], u), lerp(c0[1], c1[1], u), lerp(c0[2], c1[2], u)]);
    }
  }
  return toHex(HIGH);
}

export type MarkerStyle = "scored" | "ineligible" | "insufficient_data" | "unscored";

export interface MarkerAppearance {
  color: string;
  style: MarkerStyle;
}

/**
 * Decide a marker's appearance from the evaluation status.
 * - ok            -> continuous colour from the score
 * - ineligible    -> dim grey, hatched
 * - insufficient  -> outline only
 * - no evaluation -> neutral grey
 */
export function markerAppearance(status: SuitabilityStatus | null | undefined, score: number | null | undefined): MarkerAppearance {
  if (status === "ineligible") return { color: INELIGIBLE_COLOR, style: "ineligible" };
  if (status === "insufficient_data") return { color: INSUFFICIENT_COLOR, style: "insufficient_data" };
  if (status === "ok" && typeof score === "number") return { color: scoreToColor(score), style: "scored" };
  return { color: UNSCORED_COLOR, style: "unscored" };
}

export const LEGEND_STOPS = [0, 25, 50, 75, 100].map((s) => ({ score: s, color: scoreToColor(s) }));
