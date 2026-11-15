// Rank -> colour for analog matching. The backend gives every ranked candidate
// a `rank_color_position` in 0..1 computed over the FULL ranked pool
// ((rank-1)/(ranked-1)), so the strongest match is always 0 and the weakest is
// always 1 whatever the pool size. This module maps that position monotonically
// onto a seven-stop ROYGBIV scale (red = strongest ... violet = weakest) or an
// accessible single-hue scale (light = strongest ... dark = weakest).
//
// Colour is relative RANK only. It encodes neither danger nor safety nor
// confidence nor scientific equivalence, and it is never the only encoding:
// every marker and list row also shows the rank number and the similarity
// index as text. Unranked candidates (position null) get a neutral, hollow
// "Not ranked" treatment and are excluded from the scale.

export type RankPalette = "roygbiv" | "single_hue";

type Rgb = [number, number, number];

/** Seven stops, strongest -> weakest. Tuned slightly away from pure spectral
 * values so each reads on both the dark Mars mosaic and the bright Earth
 * oceans; markers also carry a dark backplate for contrast. */
export const ROYGBIV_STOPS: readonly string[] = [
  "#e8322d", // red
  "#f0862a", // orange
  "#f2d02c", // yellow
  "#3fbd62", // green
  "#2f7fe0", // blue
  "#4b3fb8", // indigo
  "#8e44c6", // violet
];

/** Single hue: light amber -> deep brown-orange, same direction (strongest first). */
export const SINGLE_HUE_STOPS: readonly string[] = ["#ffe6b8", "#f6c777", "#eaa445", "#d47f2a", "#a9601e", "#7a4316", "#4a2a0e"];

/** Neutral used for "Not ranked": hollow marker, patterned swatch. */
export const NOT_RANKED_COLOR = "#8a919c";

export const RANK_LEGEND_SENTENCE = "Colours show the relative match rank. They do not show danger, safety, confidence or scientific equivalence.";

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex([r, g, b]: Rgb): string {
  return "#" + [r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("");
}

export function paletteStops(palette: RankPalette): readonly string[] {
  return palette === "single_hue" ? SINGLE_HUE_STOPS : ROYGBIV_STOPS;
}

/**
 * Colour for a rank position. `position` 0 = strongest match, 1 = weakest,
 * interpolated linearly between the seven stops, so the endpoints are exactly
 * the first and last stop for any pool of two or more and a lone ranked match
 * (position 0) is the first stop. Values outside 0..1 are clamped; null, NaN
 * and undefined mean "Not ranked" and return null.
 */
export function rankColor(position: number | null | undefined, palette: RankPalette = "roygbiv"): string | null {
  if (position == null || Number.isNaN(position)) return null;
  const stops = paletteStops(palette);
  const t = Math.max(0, Math.min(1, position));
  const scaled = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const u = scaled - i;
  if (u === 0) return stops[i];
  if (i === stops.length - 2 && t === 1) return stops[stops.length - 1];
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  return rgbToHex([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]);
}

/**
 * Client-side equivalent of the backend's `rank_color_position`, for tests and
 * for any consumer that has a rank and a ranked count but no position:
 * (rank-1)/(rankedCount-1). A single ranked match is 0 (strongest). Returns
 * null for an unranked candidate (rank null) or an empty pool. Ranks beyond
 * the ranked count are clamped to 1 rather than wrapping.
 */
export function rankPosition(rank: number | null | undefined, rankedCount: number): number | null {
  if (rank == null || rankedCount <= 0 || rank < 1) return null;
  if (rankedCount === 1) return 0;
  return Math.max(0, Math.min(1, (rank - 1) / (rankedCount - 1)));
}

/** Positions for every rank 1..rankedCount, in order. Empty for a pool of 0. */
export function assignRankPositions(rankedCount: number): number[] {
  const out: number[] = [];
  for (let r = 1; r <= rankedCount; r++) out.push(rankPosition(r, rankedCount) as number);
  return out;
}

/** CSS gradient string for the legend bar, strongest on the left. */
export function rankGradient(palette: RankPalette): string {
  const stops = paletteStops(palette);
  return `linear-gradient(to right, ${stops.map((c, i) => `${c} ${Math.round((i / (stops.length - 1)) * 100)}%`).join(", ")})`;
}

/** Use the full pool's maximum rank so tied weakest sites share violet. */
export function missionRankPosition(rank: number | null | undefined, ranks: Array<number | null | undefined>): number | null {
  return rankPosition(rank, Math.max(0, ...ranks.filter((r): r is number => r != null)));
}
