// The "Plan an Expedition" call to action on the Research page. Immersive but
// honest: the backdrop is the region's own verified orbital mosaic, and the
// facts beneath the title (basemap, service state) are read live.
import { Compass, ArrowRight } from "lucide-react";
import { imageryAssetUrl } from "@/components/imagery/assetUrl";
import { useBasemaps } from "../hooks/useTerrainContext";
import { useExpeditionCapabilities } from "../hooks/useExpeditionCapabilities";
import type { ExpeditionBody } from "../adapter/types";

export function PlanEntryCard({ body, siteId, siteName, onOpen }: { body: ExpeditionBody; siteId: string; siteName: string; onOpen: () => void }) {
  const basemaps = useBasemaps(body, siteId);
  const service = useExpeditionCapabilities();
  const bg = basemaps.basemaps[0]?.entry ?? null;
  return (
    <section aria-label="Plan an expedition" className="relative overflow-hidden rounded-2xl border border-line-strong bg-bg-elev">
      {bg && <img src={imageryAssetUrl(bg.entry_id)} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-70" />}
      <div className="expedition-hero relative flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="eyebrow flex items-center gap-1.5 text-copper-bright"><Compass className="h-3.5 w-3.5" aria-hidden />Expedition Planner</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-fg">Plan an expedition across {siteName}</h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">Lay out a rover traverse on the region's georeferenced orbital imagery, choose what it should achieve, and let the shared expedition service compute distance, energy, slopes and feasibility.</p>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-muted">
            <li>{basemaps.status === "loading" ? "Checking imagery…" : basemaps.status === "ready" ? `${basemaps.basemaps.length} georeferenced basemap${basemaps.basemaps.length === 1 ? "" : "s"}` : "No georeferenced basemap"}</li>
            <li>{service.kind === "available" ? "Expedition service connected" : service.kind === "loading" ? "Connecting to the expedition service…" : "Expedition service not connected"}</li>
          </ul>
        </div>
        <button type="button" onClick={onOpen} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-copper bg-copper px-5 py-3 text-sm font-semibold text-bg transition-colors hover:bg-copper-bright hover:text-bg">Plan an Expedition <ArrowRight className="h-4 w-4" aria-hidden /></button>
      </div>
    </section>
  );
}
