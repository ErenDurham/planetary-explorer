import { Download, ExternalLink, X } from "lucide-react";
import { formatValueWithUnit } from "@/lib/format";
import { candidateTitle } from "../lib/copy";
import { downloadJson } from "../lib/download";
import type { DiscoveryCandidate, DiscoveryCriterion, DiscoveryRankResponse } from "../adapter";

export function CandidateCompare({ saved, ranking, pending, runId, criteria = [], onRemove, onResearch }: {
  criteria?: DiscoveryCriterion[];
  saved: DiscoveryCandidate[]; ranking?: DiscoveryRankResponse; pending?: boolean; runId: string;
  onRemove: (candidate: DiscoveryCandidate) => void; onResearch: (id: string) => void;
}) {
  if (!saved.length) return null;
  const reference = ranking?.reference.name ?? "Jezero Crater";
  const featureIds = [...new Set(saved.flatMap(candidate => candidate.feature_distances?.map(f => f.feature_id) ?? []))];
  const features = featureIds.map(id => ({ id, label: criteria.find(c => c.feature_id === id)?.label ?? id.replaceAll("_", " ") }));
  const download = () => downloadJson(`discovery-${runId}-shortlist.json`, {
    format: "planetary-explorer/shortlist-v1", run_id: runId, reference: ranking?.reference ?? { id: "jezero_crater" },
    purpose: "Analyst-selected regions for further research. No field validation or access assessment is implied.",
    candidates: saved.map(candidate => ({
      id: candidate.id, name: candidate.name, lat: candidate.lat, lon_east: candidate.lon_east,
      footprint_geojson: candidate.footprint_geojson, terrain_valid_fraction: candidate.terrain_valid_fraction,
      measurements: (candidate.feature_distances ?? []).map(f => ({ feature_id: f.feature_id, earth_value: f.earth_value, mars_value: f.mars_value, unit: f.unit })),
      sources: candidate.sources,
    })),
  });
  return <section aria-labelledby="discovery-shortlist" className="rounded-xl border border-copper/30 bg-bg-elev p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="discovery-shortlist" className="text-base font-semibold text-fg">Your shortlist <span className="num ml-1 text-sm text-fg-muted">{saved.length} / 3</span></h2><p className="mt-1 text-xs text-fg-muted">Compare measurements, then investigate the evidence. Saved for this session.</p></div><button type="button" onClick={download} className="inline-flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-xs text-fg hover:border-copper"><Download className="h-3.5 w-3.5" aria-hidden />Download shortlist</button></div>
    <div className="scroll-thin mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Shortlist comparison table">
      <table className="w-full min-w-[620px] border-collapse text-left text-sm">
        <caption className="sr-only">Candidate measurements compared with {reference}. Similarity indices are shown only for the current ranking.</caption>
        <thead><tr className="border-b border-line"><th className="w-40 py-3 pr-4 text-xs font-medium text-fg-muted">Measured properties</th><th className="w-36 py-3 pr-4 text-xs font-medium text-copper-bright">{reference}<span className="mt-1 block font-normal text-fg-faint">Mars reference</span></th>{saved.map(c => <th key={c.id} className="min-w-44 px-3 py-3 align-top font-medium text-fg"><span className="flex items-start justify-between gap-2"><span>{candidateTitle(c)}</span><button type="button" onClick={() => onRemove(c)} aria-label={`Remove ${c.name} from comparison`} className="rounded p-0.5 text-fg-muted hover:text-fg"><X className="h-3.5 w-3.5" aria-hidden /></button></span></th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {features.map(feature => { const ref = saved.flatMap(c => c.feature_distances ?? []).find(f => f.feature_id === feature.id); return <tr key={feature.id}><th className="py-3 pr-4 text-xs font-normal text-fg-muted">{feature.label}</th><td className="num py-3 pr-4 text-copper-bright">{ref ? formatValueWithUnit(ref.mars_value, ref.unit) : "Not available"}</td>{saved.map(c => { const f = c.feature_distances?.find(d => d.feature_id === feature.id); return <td key={c.id} className="num px-3 py-3 text-fg">{f ? formatValueWithUnit(f.earth_value, f.unit) : "Not available"}</td>; })}</tr>; })}
          <tr><th className="py-3 pr-4 text-xs font-normal text-fg-muted">Terrain coverage</th><td className="py-3 pr-4 text-fg-faint">—</td>{saved.map(c => <td key={c.id} className="num px-3 py-3">{Math.round(c.terrain_valid_fraction * 100)}%</td>)}</tr>
          <tr><th className="py-3 pr-4 text-xs font-normal text-fg-muted">Current similarity index</th><td className="py-3 pr-4 text-fg-faint">Reference</td>{saved.map(c => { const current = ranking?.candidates.find(result => result.id === c.id); return <td key={c.id} className="px-3 py-3">{pending ? <span className="text-xs text-fg-muted">Updating…</span> : current?.similarity_index != null ? <span className="num">{current.similarity_index.toFixed(1)} <span className="text-xs text-fg-muted">/ 100</span></span> : <span className="text-xs text-fg-muted">Outside current results</span>}</td>; })}</tr>
          <tr><th className="py-3 pr-4 text-xs font-normal text-fg-muted">Next step</th><td className="py-3 pr-4 text-fg-faint">—</td>{saved.map(c => <td key={c.id} className="px-3 py-3"><button type="button" onClick={() => onResearch(c.id)} className="inline-flex items-center gap-1 text-xs font-medium text-copper-bright hover:underline">Research candidate <ExternalLink className="h-3 w-3" aria-hidden /></button></td>)}</tr>
        </tbody>
      </table>
    </div>
    <p className="mt-3 text-xs leading-relaxed text-fg-muted">A similar regional surface is one reason to investigate a site. Geology, climate, permissions and finer terrain still need review.</p>
  </section>;
}
