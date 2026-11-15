// Geometry for what the Earth globe draws in Find Earth Analogs besides the
// centre markers: the surveyed bounds as a dashed ring, every evaluated
// sampling centre as a dot, and each presented candidate's footprint ring in
// its rank colour (the same colour as its marker and its row). Pure: server
// coordinates in, overlay specs out; nothing here measures anything.
import type { SurfaceDot, SurfacePoint, SurfaceRing } from "@/components/globe/SurfaceOverlays";
import { NOT_RANKED_COLOR, rankColor, rankPosition, type RankPalette } from "@/lib/rankColor";
import { footprintRings, readSamplingCentre } from "./geo";
import type { DiscoveryBounds, DiscoveryCandidate, DiscoverySurvey } from "../adapter";

/** Same blue as the survey map's dashed boundary. */
export const SURVEY_BOUNDS_COLOR = "#6ea0d9";
/** The dropped pin and its measured footprint, distinct from every rank colour. */
export const PIN_COLOR = "#f0a03c";

export interface PinOverlay { lat: number; lon: number; footprint?: Record<string, unknown> | null }

/** The bounds rectangle sampled along each edge so it follows the sphere. */
export function boundsRing(b: DiscoveryBounds, steps = 12): SurfacePoint[] {
  const pts: SurfacePoint[] = [];
  const dLon = (b.east - b.west) / steps, dLat = (b.north - b.south) / steps;
  for (let i = 0; i < steps; i++) pts.push({ lat: b.north, lonEast: b.west + dLon * i });
  for (let i = 0; i < steps; i++) pts.push({ lat: b.north - dLat * i, lonEast: b.east });
  for (let i = 0; i < steps; i++) pts.push({ lat: b.south, lonEast: b.east - dLon * i });
  for (let i = 0; i < steps; i++) pts.push({ lat: b.south + dLat * i, lonEast: b.west });
  return pts;
}

export function discoveryOverlays({ bounds, survey, candidates, selectedId, palette = "roygbiv", pin = null }: {
  bounds: DiscoveryBounds | null | undefined;
  survey: DiscoverySurvey | null | undefined;
  candidates: DiscoveryCandidate[];
  selectedId: string | null;
  palette?: RankPalette;
  /** The user's dropped pin and, once the service has measured it, its footprint. Not pickable: it is not a candidate. */
  pin?: PinOverlay | null;
}): { rings: SurfaceRing[]; dots: SurfaceDot[] } {
  const n = candidates.length;
  const rings: SurfaceRing[] = [];
  if (bounds) rings.push({ id: "survey-bounds", points: boundsRing(bounds), color: SURVEY_BOUNDS_COLOR, dashed: true, width: 1.5 });
  for (const c of candidates) {
    const color = rankColor(rankPosition(c.display_rank, n), palette) ?? NOT_RANKED_COLOR;
    const selected = c.id === selectedId;
    footprintRings(c.footprint_geojson).forEach((ring, i) => rings.push({ id: `${c.id}:${i}`, pickId: c.id, points: ring.map(p => ({ lat: p.lat, lonEast: p.lon })), color, fill: true, selected, width: selected ? 3 : 1.5 }));
  }
  const dots: SurfaceDot[] = (survey?.sampling_centres ?? [])
    .map(readSamplingCentre)
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s, i) => ({ id: s.id ?? `centre-${i}`, lat: s.lat, lonEast: s.lon, muted: s.status === "excluded" }));
  if (pin) {
    if (pin.footprint) footprintRings(pin.footprint).forEach((ring, i) => rings.push({ id: `pin:${i}`, points: ring.map(p => ({ lat: p.lat, lonEast: p.lon })), color: PIN_COLOR, dashed: true, width: 2 }));
    dots.push({ id: "pin", lat: pin.lat, lonEast: pin.lon, color: PIN_COLOR, size: 2.4 });
  }
  return { rings, dots };
}
