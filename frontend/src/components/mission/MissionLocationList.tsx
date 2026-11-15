import { Section, EmptyNote } from "@/components/ui/Section";
import { formatLatLon, formatValueWithUnit } from "@/lib/format";
import type { ComparisonLocation } from "@/types";

export function MissionLocationList({locations,selectedId,onSelect,isPending}:{locations:ComparisonLocation[];selectedId:string|null;onSelect:(id:string)=>void;isPending:boolean}) {
  return <Section title="Earth mission sites" subtitle="Browse the measurements. There is no overall score.">
    <p className="mb-3 text-xs leading-relaxed text-fg-muted">Select a site to see its profile. Then find Mars analogs.</p>
    {isPending && <EmptyNote>Loading Earth sites…</EmptyNote>}
    <ol className="space-y-2" aria-label="Earth mission locations">{locations.map(location => {
      const values = ["slope_regional_median_deg", "roughness_regional_m"].map(fid => location.measurements.find(m => m.feature_id === fid && !m.is_missing));
      return <li key={location.id}><button type="button" aria-pressed={location.id === selectedId} onClick={() => onSelect(location.id)} className={`w-full rounded border p-3 text-left ${location.id === selectedId ? "border-copper bg-copper/10" : "border-line hover:border-line-strong"}`}>
        <span className="block text-sm font-medium text-fg">{location.name}</span><span className="mt-1 block text-xs text-fg-muted">{formatLatLon(location.lat,location.lon_east)}</span>
        <span className="mt-2 block text-xs text-fg-muted">{values.map((m,i) => `${i === 0 ? "Slope" : "Relief"}: ${m && typeof m.value === "number" ? formatValueWithUnit(m.value,m.unit) : "unavailable"}`).join(" · ")}</span>
      </button></li>;
    })}</ol>
  </Section>;
}
