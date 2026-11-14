// Pure helpers for the Compare view. The Earth-Mars pair helpers below are what
// the view renders; the three-body catalogue helpers (COMPARISON_MODES,
// measurement, terrainDifference) are kept for the catalogue data and the
// store's ComparisonMode type, but the Moon is not offered in Compare
// navigation in this release.
import type { AnalogRankResponse, ComparisonLocation, EnvironmentalMeasurement, FeatureDistance, ImageBounds, ImageryEntry, RankedCandidate } from "@/types";
import { BODY_NAME, otherBody, type Body } from "@/lib/analogFeatures";

export type ComparisonMode = "all" | "earth-mars" | "earth-moon" | "mars-moon";
export type BodyId = ComparisonLocation["body"];
export const COMPARISON_MODES: { id: ComparisonMode; label: string; bodies: BodyId[] }[] = [
  { id: "all", label: "All three", bodies: ["earth", "mars", "moon"] },
  { id: "earth-mars", label: "Earth ↔ Mars", bodies: ["earth", "mars"] },
  { id: "earth-moon", label: "Earth ↔ Moon", bodies: ["earth", "moon"] },
  { id: "mars-moon", label: "Mars ↔ Moon", bodies: ["mars", "moon"] },
];
export function measurement(location: ComparisonLocation, feature: string): EnvironmentalMeasurement | undefined {
  return location.measurements.find(m => m.feature_id === feature && !m.is_missing && m.value !== null);
}
/** Only harmonised terrain metrics may produce a local numeric difference. */
export function terrainDifference(a: ComparisonLocation, b: ComparisonLocation, feature: string): number | null {
  if (!["slope_regional_median_deg", "roughness_regional_m"].includes(feature)) return null;
  const x = measurement(a, feature), y = measurement(b, feature);
  if (!x || !y || x.unit !== y.unit || typeof x.value !== "number" || typeof y.value !== "number") return null;
  return Math.abs(x.value - y.value);
}

// ---- Earth-Mars pair ------------------------------------------------------

/** The two bodies Compare navigates between in this release. */
export const COMPARE_BODIES: readonly Body[] = ["earth", "mars"];

export type PairRole = "selected" | "reference";
export interface PairColumn { body: Body; role: PairRole; label: string }

/** Display order: the objective's selection body first, the reference body
 * second. `swapped` reverses the DISPLAY only; roles stay with their bodies. */
export function pairColumns(selectionBody: Body, swapped = false): [PairColumn, PairColumn] {
  const reference = otherBody(selectionBody);
  const cols: [PairColumn, PairColumn] = [
    { body: selectionBody, role: "selected", label: `Selected on ${BODY_NAME[selectionBody]}` },
    { body: reference, role: "reference", label: `Reference on ${BODY_NAME[reference]}` },
  ];
  return swapped ? [cols[1], cols[0]] : cols;
}

/** The rank entry for exactly this candidate id; never the top match by default. */
export function findPairCandidate(rank: AnalogRankResponse | null | undefined, candidateId: string | null | undefined): RankedCandidate | undefined {
  if (!rank || !candidateId) return undefined;
  return rank.candidates.find(c => c.location.id === candidateId);
}

/** Kilometres per degree of latitude: mean meridional degree on each body. */
export const KM_PER_DEG_LAT: Record<Body, number> = { earth: 111.19, mars: 59.27 };

export function isGeoreferenced(entry: ImageryEntry | null | undefined): entry is ImageryEntry & { bounds: ImageBounds } {
  return !!entry && entry.view === "orbital" && !!entry.bounds;
}

/** Ground metres per rendered screen pixel, from the N-S extent of the bounds
 * and the rendered height. Null until the image has a measured height. */
export function metresPerPixel(bounds: ImageBounds | null | undefined, renderedHeightPx: number | null | undefined, body: Body): number | null {
  if (!bounds || !renderedHeightPx || renderedHeightPx <= 0) return null;
  const span = bounds.north - bounds.south;
  if (!(span > 0)) return null;
  return (span * KM_PER_DEG_LAT[body] * 1000) / renderedHeightPx;
}

const NICE_KM = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

/** A scale bar no longer than `maxPx` with a round kilometre label. */
export function scaleBar(mpp: number | null | undefined, maxPx = 140): { px: number; km: number; label: string } | null {
  if (!mpp || mpp <= 0) return null;
  let best: number | null = null;
  for (const km of NICE_KM) {
    const px = (km * 1000) / mpp;
    if (px <= maxPx) best = km; else break;
  }
  if (best === null) return null;
  const px = (best * 1000) / mpp;
  return { px, km: best, label: best < 1 ? `${Math.round(best * 1000)} m` : `${best} km` };
}

/** Where a coordinate falls inside the bounds, as percentages; null if outside. */
export function pointPosition(bounds: ImageBounds | null | undefined, lat: number, lonEast: number): { xPct: number; yPct: number } | null {
  if (!bounds) return null;
  const w = bounds.east - bounds.west, h = bounds.north - bounds.south;
  if (!(w > 0) || !(h > 0)) return null;
  const xPct = ((lonEast - bounds.west) / w) * 100;
  const yPct = ((bounds.north - lat) / h) * 100;
  if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) return null;
  return { xPct, yPct };
}

/** The analysis footprint (a `halfWidthDeg` square around the coordinate)
 * clipped to the image bounds, as percentages. Null when they do not overlap. */
export function footprintBox(bounds: ImageBounds | null | undefined, lat: number, lonEast: number, halfWidthDeg: number): { leftPct: number; topPct: number; widthPct: number; heightPct: number; clipped: boolean } | null {
  if (!bounds || !(halfWidthDeg > 0)) return null;
  const w = bounds.east - bounds.west, h = bounds.north - bounds.south;
  if (!(w > 0) || !(h > 0)) return null;
  const west = Math.max(bounds.west, lonEast - halfWidthDeg), east = Math.min(bounds.east, lonEast + halfWidthDeg);
  const south = Math.max(bounds.south, lat - halfWidthDeg), north = Math.min(bounds.north, lat + halfWidthDeg);
  if (east <= west || north <= south) return null;
  const clipped = lonEast - halfWidthDeg < bounds.west || lonEast + halfWidthDeg > bounds.east || lat - halfWidthDeg < bounds.south || lat + halfWidthDeg > bounds.north;
  return { leftPct: ((west - bounds.west) / w) * 100, topPct: ((bounds.north - north) / h) * 100, widthPct: ((east - west) / w) * 100, heightPct: ((north - south) / h) * 100, clipped };
}

/** Linked zoom is only meaningful when BOTH panes show georeferenced orbital entries. */
export function canMatchScale(a: ImageryEntry | null | undefined, b: ImageryEntry | null | undefined): boolean {
  return isGeoreferenced(a) && isGeoreferenced(b);
}

/** The zoom pane B needs so that its metres per screen pixel equal pane A's at
 * zoom `zoomA`. `mppFit*` are each pane's metres per pixel at zoom 1. Clamped;
 * `exact` is false when the clamp prevented an equal scale. */
export function linkedZoom(zoomA: number, mppFitA: number | null, mppFitB: number | null, min = 1, max = 8): { zoom: number; exact: boolean } | null {
  if (!mppFitA || !mppFitB || zoomA <= 0) return null;
  const ideal = (zoomA * mppFitB) / mppFitA;
  const zoom = Math.max(min, Math.min(max, ideal));
  return { zoom, exact: Math.abs(zoom - ideal) < 1e-9 };
}

export function tagList(v: FeatureDistance["mars_value"] | FeatureDistance["earth_value"]): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

export function splitTags(a: readonly string[] | undefined, b: readonly string[] | undefined): { shared: string[]; onlyA: string[]; onlyB: string[] } {
  const A = new Set(a ?? []), B = new Set(b ?? []);
  return { shared: [...A].filter(t => B.has(t)), onlyA: [...A].filter(t => !B.has(t)), onlyB: [...B].filter(t => !A.has(t)) };
}

/** Half-width of a location's analysis footprint, read off its measurements. */
export function footprintHalfWidthDeg(location: ComparisonLocation | null | undefined, fallback: number): number {
  const hw = location?.measurements.find(m => m.geographic_footprint?.half_width_deg != null)?.geographic_footprint?.half_width_deg;
  return typeof hw === "number" && hw > 0 ? hw : fallback;
}

export function topTwo<T>(items: readonly T[] | undefined): T[] {
  return (items ?? []).slice(0, 2);
}

const RELATIONSHIP_LABEL: Record<ImageryEntry["relationship"], string> = {
  exact_location: "Exact location",
  landing_ellipse: "Landing ellipse",
  candidate_region: "Candidate region",
  nearby_scene: "Nearby scene",
};

/** "Candidate region · scene centre ~12 km from the site". */
export function relationshipLabel(entry: Pick<ImageryEntry, "relationship" | "distance_from_site_km">): string {
  const base = RELATIONSHIP_LABEL[entry.relationship] ?? entry.relationship.replace(/_/g, " ");
  const d = entry.distance_from_site_km;
  if (d == null) return base;
  if (d === 0) return `${base} · scene centred on the site`;
  return `${base} · scene centre ~${d < 10 ? d.toFixed(1) : Math.round(d)} km from the site`;
}

/** Regional context versus exact-site imagery, for the pane badge. */
export function coverageKind(entry: Pick<ImageryEntry, "relationship" | "image_type">): "exact site" | "regional" {
  return entry.relationship === "exact_location" || entry.relationship === "landing_ellipse" ? "exact site" : "regional";
}

const EMPHASIS_SHORT: Record<string, string> = { slope_regional_median_deg: "slopes", roughness_regional_m: "relief", terrain_morphology: "landforms", mineralogy_tags: "materials", precipitation_mm_day: "dryness" };

/** "slopes 25% · relief 25% · landforms 20% · materials 20% · dryness 10%" for the context line. */
export function emphasisSummary(shares: Record<string, number>): string {
  return Object.entries(shares)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, v]) => `${EMPHASIS_SHORT[id] ?? id.replace(/_/g, " ")} ${Math.round(v)}%`)
    .join(" · ");
}
