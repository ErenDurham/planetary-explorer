// The Earth globe for Find Earth Analogs: the shortlist's centres as markers,
// plus what the survey map shows drawn on the sphere itself - the surveyed
// bounds as a dashed ring, every evaluated centre as a dot, and each
// candidate's footprint as a filled ring in its rank colour. Selecting a
// marker or a footprint goes to the discovery store, never to the app's
// curated selection, and the store's selection revision is the focus token
// that flies the camera in close enough to frame a 60 km footprint.
import { useMemo, useState } from "react";
import { PlanetViewer } from "@/components/globe/PlanetViewer";
import { EARTH_CONFIG } from "@/components/globe/PlanetConfig";
import { SurfaceOverlays } from "@/components/globe/SurfaceOverlays";
import { analogMarkerAppearance } from "@/components/globe/colors";
import type { MarkerDatum } from "@/components/globe/MarkerData";
import { rankPosition, type RankPalette } from "@/lib/rankColor";
import type { EarthSite } from "@/hooks/useEarthSites";
import { discoveryOverlays, PIN_COLOR } from "../lib/globeOverlays";
import type { PinPoint } from "../hooks/useDiscoveryProbe";
import type { DiscoveryBounds, DiscoveryCandidate, DiscoverySurvey } from "../adapter";

/** Close enough that a 60 km footprint is a clear shape and the whole surveyed
 * area still fits the view (about 500 km across at a 42 degree field of view). */
export const FOOTPRINT_FOCUS_DISTANCE = 1.1;

export function DiscoveryGlobe({ candidates, established, selectedId, onSelect, palette, runLabel, focusToken = 0, bounds = null, survey = null, pin = null, onPin, pinFootprint = null, pinIndex = null }: {
  candidates: DiscoveryCandidate[]; established: EarthSite[]; selectedId: string | null; onSelect: (id: string | null) => void; palette: RankPalette; runLabel: string; focusToken?: number;
  /** The surveyed area, drawn as a dashed ring. */
  bounds?: DiscoveryBounds | null;
  /** The survey, for its sampling centres. */
  survey?: DiscoverySurvey | null;
  /** The user's dropped pin, drawn as its own marker; never a candidate. */
  pin?: PinPoint | null;
  /** A click on the planet surface drops or moves the pin. Absent: the surface is not pickable. */
  onPin?: (pin: PinPoint) => void;
  /** The service's measured footprint for the pin, once it exists. */
  pinFootprint?: Record<string, unknown> | null;
  /** The service's index for the pin, once scored. */
  pinIndex?: number | null;
}) {
  const [autoRotate, setAutoRotate] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const n = candidates.length;
  const overlays = useMemo(() => discoveryOverlays({ bounds, survey, candidates, selectedId, palette, pin: pin ? { ...pin, footprint: pinFootprint } : null }), [bounds, survey, candidates, selectedId, palette, pin, pinFootprint]);
  const markers: MarkerDatum[] = [
    ...(pin ? [{ id: "pin", name: "Dropped pin (not a candidate)", region: "Your chosen point, scored on demand", lat: pin.lat, lonEast: pin.lon, mode: "analog" as const, score: null, rank: null, status: null, similarity: pinIndex, unrankableReason: pinIndex == null ? "Not yet scored, or the service could not measure this footprint" : null, appearance: { color: PIN_COLOR, style: "ranked" as const } }] : []),
    ...candidates.map(c => ({ id: c.id, name: c.name, region: "Proposed candidate footprint centre", lat: c.lat, lonEast: c.lon_east, mode: "analog" as const, score: null, rank: c.display_rank ?? null, status: null, similarity: c.similarity_index ?? null, unrankableReason: null, appearance: analogMarkerAppearance(rankPosition(c.display_rank, n), palette) })),
    ...established.map(s => ({ id: `established:${s.id}`, name: `${s.name} (catalog context site, not a candidate)`, region: s.region, lat: s.lat, lonEast: s.lonEast, mode: "browse" as const, score: null, rank: null, status: null, similarity: null, unrankableReason: "Catalog context site from Browse Regions, not part of the discovery pool", appearance: analogMarkerAppearance(null, palette) })),
  ];
  return (
    <div className="h-full">
      <PlanetViewer config={EARTH_CONFIG} markers={markers} selectedId={selectedId} focusToken={focusToken}
        onSelect={id => { if (!id.startsWith("established:") && id !== "pin") onSelect(id); }} onDeselect={() => onSelect(null)}
        onPickSurface={onPin ? p => onPin({ lat: p.lat, lon: p.lonEast }) : undefined}
        autoRotate={autoRotate} onAutoRotateChange={setAutoRotate} resetToken={resetToken} onRequestReset={() => setResetToken(t => t + 1)}
        statusLine={`${n} proposed candidate footprints and ${overlays.dots.length - (pin ? 1 : 0)} evaluated centres from ${runLabel} · the dashed ring is the area searched${onPin ? " · click the surface to drop a pin" : ""}`} mode="analog" palette={palette}
        legendHeading={`${n} shortlist candidates ranked against Jezero Crater · grey markers are catalog context sites, not candidates`} rankedCount={n}
        overlays={<SurfaceOverlays radius={EARTH_CONFIG.radius} rings={overlays.rings} dots={overlays.dots} onPick={id => onSelect(id)} />}
        focusDistance={FOOTPRINT_FOCUS_DISTANCE} />
    </div>
  );
}
