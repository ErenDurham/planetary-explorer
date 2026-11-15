// Map geometry for the expedition terrain map. The basemap is a georeferenced
// orbital mosaic whose `bounds` come from the imagery manifest (tile-grid
// extents), so a coordinate maps linearly onto the image: x by longitude,
// y by latitude. The same mapping the Compare footprints use (lib/comparison),
// here in both directions so a click can become a coordinate.
//
// Nothing in this file measures anything: no distances, no slopes. Those are
// the service's.
import type { ImageBounds } from "@/types";
import type { ExpeditionBody, GeoPoint } from "../adapter/types";

export interface Pct { xPct: number; yPct: number }

/** Kilometres per degree of latitude on each body the contract names (mean
 * radius: Earth 6371 km, Mars 3396 km MOLA sphere, Moon 1737.4 km). */
export const KM_PER_DEG_LAT: Record<ExpeditionBody, number> = { earth: 111.19, mars: 59.27, moon: 30.32 };

/** Ground metres per rendered pixel from a basemap's N-S extent. */
export function metresPerPixelFor(b: ImageBounds, renderedHeightPx: number, body: ExpeditionBody): number | null {
  if (!(renderedHeightPx > 0) || !boundsValid(b)) return null;
  return ((b.north - b.south) * KM_PER_DEG_LAT[body] * 1000) / renderedHeightPx;
}

export function boundsValid(b: ImageBounds | null | undefined): b is ImageBounds {
  return !!b && b.east - b.west > 0 && b.north - b.south > 0;
}

/** Where a coordinate falls in the image, as percentages (may lie outside 0..100). */
export function toPct(b: ImageBounds, p: GeoPoint): Pct {
  return { xPct: ((p.lon_east - b.west) / (b.east - b.west)) * 100, yPct: ((b.north - p.lat) / (b.north - b.south)) * 100 };
}

/** Inverse of `toPct`, clamped to the image so a drag past the edge stays on the map. */
export function toGeo(b: ImageBounds, pct: Pct): GeoPoint {
  const x = clamp01(pct.xPct / 100), y = clamp01(pct.yPct / 100);
  return { lon_east: round(b.west + x * (b.east - b.west)), lat: round(b.north - y * (b.north - b.south)) };
}

export function inside(b: ImageBounds, p: GeoPoint): boolean {
  return p.lon_east >= b.west && p.lon_east <= b.east && p.lat >= b.south && p.lat <= b.north;
}

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }
/** Seven decimals: ~0.01 m on Mars, finer than any dataset here, and exact on tile-grid bounds. */
function round(v: number): number { return Math.round(v * 1e7) / 1e7; }

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 12;

export interface View { zoom: number; /** pan offset in CSS px of the frame, at the current zoom */ x: number; y: number }
export const FIT_VIEW: View = { zoom: 1, x: 0, y: 0 };

export function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 1000) / 1000));
}

/** Zoom by `factor` keeping the frame point (fx, fy) fixed under the cursor. */
export function zoomAt(view: View, factor: number, fx: number, fy: number): View {
  const zoom = clampZoom(view.zoom * factor);
  const k = zoom / view.zoom;
  return { zoom, x: fx - (fx - view.x) * k, y: fy - (fy - view.y) * k };
}

/** Keep at least a third of the image inside the frame so it cannot be lost. */
export function clampPan(view: View, frame: { w: number; h: number }, fit: { w: number; h: number }): View {
  const w = fit.w * view.zoom, h = fit.h * view.zoom;
  const minX = Math.min(0, frame.w - w) - w / 3, maxX = Math.max(0, frame.w - w) + w / 3;
  const minY = Math.min(0, frame.h - h) - h / 3, maxY = Math.max(0, frame.h - h) + h / 3;
  return { zoom: view.zoom, x: Math.max(minX, Math.min(maxX, view.x)), y: Math.max(minY, Math.min(maxY, view.y)) };
}

/** Frame pixel -> image percentage, given the view and the image's fit size. */
export function frameToPct(view: View, fit: { w: number; h: number }, fx: number, fy: number): Pct {
  return { xPct: ((fx - view.x) / (fit.w * view.zoom)) * 100, yPct: ((fy - view.y) / (fit.h * view.zoom)) * 100 };
}

let counter = 0;
export function newWaypointId(): string {
  counter += 1;
  return `wp-${Date.now().toString(36)}-${counter}`;
}

export function formatCoordinate(p: GeoPoint): string {
  const ns = p.lat >= 0 ? "N" : "S", ew = p.lon_east >= 0 ? "E" : "W";
  return `${Math.abs(p.lat).toFixed(4)}°${ns} ${Math.abs(p.lon_east).toFixed(4)}°${ew}`;
}
