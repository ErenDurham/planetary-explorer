// Schematic-map geometry for the survey view: geographic degrees mapped onto
// an equirectangular frame whose x axis is scaled by cos(mid-latitude) so a 60 km
// footprint reads roughly square. This is display geometry for server-provided
// coordinates; no terrain, distance or score is derived here.
import type { DiscoveryBounds } from "../adapter/types";

export const KM_PER_DEG_LAT_EARTH = 111.19;

export interface LonLat { lon: number; lat: number }

/** Polygon rings (outer first) from a GeoJSON Polygon, MultiPolygon or Feature carrying one. */
export function footprintRings(geojson: Record<string, unknown> | null | undefined): LonLat[][] {
  if (!geojson) return [];
  const geom = (geojson.type === "Feature" ? (geojson as { geometry?: Record<string, unknown> }).geometry : geojson) as Record<string, unknown> | undefined;
  if (!geom) return [];
  const coords = geom.coordinates as unknown;
  const ring = (r: unknown): LonLat[] => Array.isArray(r) ? r.filter((p): p is [number, number] => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])).map(([lon, lat]) => ({ lon, lat })) : [];
  if (geom.type === "Polygon" && Array.isArray(coords)) return (coords as unknown[]).map(ring).filter(r => r.length >= 3);
  if (geom.type === "MultiPolygon" && Array.isArray(coords)) return (coords as unknown[]).flatMap(poly => (Array.isArray(poly) ? (poly as unknown[]).map(ring) : [])).filter(r => r.length >= 3);
  return [];
}

export function ringsBounds(rings: LonLat[][]): DiscoveryBounds | null {
  const pts = rings.flat();
  if (!pts.length) return null;
  return { west: Math.min(...pts.map(p => p.lon)), east: Math.max(...pts.map(p => p.lon)), south: Math.min(...pts.map(p => p.lat)), north: Math.max(...pts.map(p => p.lat)) };
}

export function unionBounds(list: Array<DiscoveryBounds | null | undefined>): DiscoveryBounds | null {
  const b = list.filter((x): x is DiscoveryBounds => !!x);
  if (!b.length) return null;
  return { west: Math.min(...b.map(x => x.west)), east: Math.max(...b.map(x => x.east)), south: Math.min(...b.map(x => x.south)), north: Math.max(...b.map(x => x.north)) };
}

export function padBounds(b: DiscoveryBounds, fraction: number): DiscoveryBounds {
  const dw = (b.east - b.west) * fraction, dh = (b.north - b.south) * fraction;
  return { west: b.west - dw, east: b.east + dw, south: b.south - dh, north: b.north + dh };
}

/** A frame that maps the extent onto `width` x `height` px, preserving ground aspect. */
export interface Frame { extent: DiscoveryBounds; width: number; height: number; scaleX: number; scaleY: number; offsetX: number; offsetY: number }

export function makeFrame(extent: DiscoveryBounds, width: number, height: number): Frame {
  const midLat = (extent.north + extent.south) / 2;
  const cos = Math.max(0.05, Math.cos((midLat * Math.PI) / 180));
  const groundW = (extent.east - extent.west) * cos, groundH = extent.north - extent.south;
  const k = Math.min(width / Math.max(groundW, 1e-9), height / Math.max(groundH, 1e-9));
  const scaleX = k * cos, scaleY = k;
  const drawnW = groundW * k, drawnH = groundH * k;
  return { extent, width, height, scaleX, scaleY, offsetX: (width - drawnW) / 2, offsetY: (height - drawnH) / 2 };
}

export function project(f: Frame, p: LonLat): { x: number; y: number } {
  return { x: f.offsetX + (p.lon - f.extent.west) * f.scaleX, y: f.offsetY + (f.extent.north - p.lat) * f.scaleY };
}

export function boundsPath(f: Frame, b: DiscoveryBounds): string {
  const a = project(f, { lon: b.west, lat: b.north }), c = project(f, { lon: b.east, lat: b.south });
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}H${c.x.toFixed(1)}V${c.y.toFixed(1)}H${a.x.toFixed(1)}Z`;
}

export function ringPath(f: Frame, ring: LonLat[]): string {
  return ring.map((p, i) => { const q = project(f, p); return `${i === 0 ? "M" : "L"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`; }).join(" ") + "Z";
}

/** Rendered px per km of latitude, for a scale bar. */
export function pxPerKm(f: Frame): number { return f.scaleY / KM_PER_DEG_LAT_EARTH; }

/** Approximate N-S and E-W ground extent of a bounds box, for the "searched extent" line. */
export function extentKm(b: DiscoveryBounds): { ns: number; ew: number } {
  const midLat = (b.north + b.south) / 2;
  return { ns: (b.north - b.south) * KM_PER_DEG_LAT_EARTH, ew: (b.east - b.west) * KM_PER_DEG_LAT_EARTH * Math.cos((midLat * Math.PI) / 180) };
}

export function formatBounds(b: DiscoveryBounds): string {
  const f = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`;
  return `${f(b.south, "N", "S")}–${f(b.north, "N", "S")}, ${f(b.west, "E", "W")}–${f(b.east, "E", "W")}`;
}

/** A sampling centre record as the survey lists it; keys are the service's, read defensively. */
export interface SamplingCentre { lat: number; lon: number; id: string | null; status: string | null }
export function readSamplingCentre(row: Record<string, unknown>): SamplingCentre | null {
  const lat = Number(row.lat), lon = Number(row.lon_east ?? row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const id = typeof row.candidate_id === "string" ? row.candidate_id : typeof row.id === "string" ? row.id : null;
  const status = typeof row.status === "string" ? row.status : typeof row.eligible === "boolean" ? (row.eligible ? "eligible" : "excluded") : typeof row.exclusion_reason === "string" ? "excluded" : null;
  return { lat, lon, id, status };
}
