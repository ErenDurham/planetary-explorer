// The reference region (Jezero Crater), with its own verified orbital image
// when one exists. Shown in the evidence panel before a candidate is chosen,
// so the thing every candidate is compared with is never out of sight.
import { imageryAssetUrl } from "@/components/imagery/assetUrl";
import type { DiscoveryCriterion, DiscoveryReference } from "../adapter";

export interface ReferenceImage { entry_id: string; title: string; credit: string; relevance: string }

export function ReferenceCard({ reference, image, status, criteria, compact = false }: { reference: DiscoveryReference; image: ReferenceImage | null; status: string; criteria: DiscoveryCriterion[]; compact?: boolean }) {
  return (
    <section aria-label={`Reference region: ${reference.name}`} className={`grid overflow-hidden rounded-xl border border-line-strong bg-bg-elev ${compact ? "" : "sm:grid-cols-[180px_minmax(0,1fr)]"}`}>
      <div className={`relative bg-black ${compact ? "h-32" : "min-h-[120px]"}`}>
        {image ? <img src={imageryAssetUrl(image.entry_id)} alt={`${reference.name}: ${image.title}`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center p-3 text-center text-[11px] text-fg-faint">{status === "loading" ? "Loading reference imagery…" : "No verified imagery"}</div>}
        <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-fg">Mars · reference</span>
      </div>
      <div className="p-3 text-sm">
        <h3 className="text-base font-semibold text-fg">{reference.name}</h3>
        <p className="num text-xs text-fg-muted">{reference.lat.toFixed(4)}°N, {reference.lon_east.toFixed(4)}°E</p>
        <p className="mt-2 text-xs leading-relaxed text-fg-muted">Every candidate is compared with this region on {criteria.map(c => c.label.toLowerCase()).join(" and ")}. Both are measured the same way on both planets. Nothing else about {reference.name} is used in the index.</p>
        {image && <p className="mt-2 text-[10.5px] text-fg-faint">{image.credit}</p>}
      </div>
    </section>
  );
}
