// The existing Earth globe with the shortlist's CENTRES as markers (the viewer
// draws points, not polygons; footprints are on the schematic map). Selection
// goes to the discovery store, never to the app's curated selection.
import { useState } from "react";
import { PlanetViewer } from "@/components/globe/PlanetViewer";
import { EARTH_CONFIG } from "@/components/globe/PlanetConfig";
import { analogMarkerAppearance } from "@/components/globe/colors";
import type { MarkerDatum } from "@/components/globe/MarkerData";
import { rankPosition, type RankPalette } from "@/lib/rankColor";
import type { EarthSite } from "@/hooks/useEarthSites";
import type { DiscoveryCandidate } from "../adapter";

export function DiscoveryGlobe({ candidates, established, selectedId, onSelect, palette, runLabel }: { candidates: DiscoveryCandidate[]; established: EarthSite[]; selectedId: string | null; onSelect: (id: string | null) => void; palette: RankPalette; runLabel: string }) {
  const [autoRotate, setAutoRotate] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [focusToken, setFocusToken] = useState(0);
  const n = candidates.length;
  const markers: MarkerDatum[] = [
    ...candidates.map(c => ({ id: c.id, name: c.name, region: "Proposed candidate footprint centre", lat: c.lat, lonEast: c.lon_east, mode: "analog" as const, score: null, rank: c.display_rank ?? null, status: null, similarity: c.similarity_index ?? null, unrankableReason: null, appearance: analogMarkerAppearance(rankPosition(c.display_rank, n), palette) })),
    ...established.map(s => ({ id: `established:${s.id}`, name: `${s.name} (established analog)`, region: s.region, lat: s.lat, lonEast: s.lonEast, mode: "browse" as const, score: null, rank: null, status: null, similarity: null, unrankableReason: "Established catalog site, not part of the discovery pool", appearance: analogMarkerAppearance(null, palette) })),
  ];
  return (
    <div className="h-full">
      <PlanetViewer config={EARTH_CONFIG} markers={markers} selectedId={selectedId} focusToken={focusToken}
        onSelect={id => { if (!id.startsWith("established:")) { onSelect(id); setFocusToken(t => t + 1); } }} onDeselect={() => onSelect(null)}
        autoRotate={autoRotate} onAutoRotateChange={setAutoRotate} resetToken={resetToken} onRequestReset={() => setResetToken(t => t + 1)}
        statusLine={`${n} proposed candidate centres from ${runLabel} · footprints on the survey map`} mode="analog" palette={palette}
        legendHeading="Proposed candidates ranked against Jezero Crater" rankedCount={n} />
    </div>
  );
}
