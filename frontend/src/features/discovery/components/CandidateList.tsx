// Candidate results written to be understood: where it is, the index with
// what it means, why the terrain reads as similar, what differs or is missing,
// the review status, and the actions. Every figure is the service's.
import { MapPin, Microscope } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { NOT_RANKED_COLOR, rankColor, rankPosition, type RankPalette } from "@/lib/rankColor";
import { PROPOSED_LABEL, missingFactors, noveltyRelation, similarityExplanation, similarityReasons } from "../lib/copy";
import { ResearchStatusBadge } from "./ResearchStatusBadge";
import type { DiscoveryCandidate } from "../adapter";

export function CandidateList({ candidates, selectedId, onSelect, onResearch, referenceName, effectiveWeights, palette = "roygbiv", pending }: {
  candidates: DiscoveryCandidate[]; selectedId: string | null; onSelect: (id: string) => void; onResearch: (id: string) => void; referenceName: string; effectiveWeights: Record<string, number>; palette?: RankPalette; pending?: boolean;
}) {
  const n = candidates.length;
  return (
    <section aria-labelledby="candidate-list" className={`space-y-3 ${pending ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="candidate-list" className="text-lg font-semibold tracking-tight text-fg">Candidate regions · {n}</h2>
        {pending ? <span className="text-[11px] text-copper-bright" role="status">Re-ranking…</span> : <span className="text-[11px] text-fg-faint">{PROPOSED_LABEL}</span>}
      </div>
      {n === 0 ? <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-fg-muted">No footprint in this survey passed screening, so there is nothing to rank. The coverage section lists why each sampled footprint was excluded.</p> : (
        <ol className="space-y-3" aria-label="Ranked proposed candidates">
          {candidates.map(c => {
            const sel = c.id === selectedId; const pos = rankPosition(c.display_rank, n); const color = rankColor(pos, palette) ?? NOT_RANKED_COLOR; const nov = noveltyRelation(c.novelty); const why = similarityReasons(c.feature_distances, referenceName); const missing = missingFactors(c);
            return (
              <li key={c.id}>
                <article aria-label={`Rank ${c.display_rank ?? "—"}: ${c.name}, similarity index ${c.similarity_index?.toFixed(1) ?? "not ranked"}`} className={`rounded-2xl border bg-bg-elev p-4 transition-colors ${sel ? "border-copper ring-1 ring-copper/40" : "border-line hover:border-line-strong"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="num mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-black" style={{ background: color }} aria-hidden>{c.display_rank ?? "—"}</span>
                      <div className="min-w-0"><h3 className="text-base font-semibold text-fg">{c.name}</h3><p className="num flex items-center gap-1 text-xs text-fg-muted"><MapPin className="h-3 w-3" aria-hidden />{c.lat.toFixed(3)}°N, {Math.abs(c.lon_east).toFixed(3)}°{c.lon_east < 0 ? "W" : "E"} · 60 km footprint{c.raw_rank != null && c.raw_rank !== c.display_rank ? ` · ranked ${c.raw_rank} before spacing` : ""}</p></div>
                    </div>
                    <div className="text-right"><p className="num text-2xl text-copper-bright">{c.similarity_index != null ? c.similarity_index.toFixed(1) : "—"}<span className="ml-1 text-xs text-fg-muted">/ 100 index</span></p></div>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-fg-muted">{similarityExplanation(c, referenceName, effectiveWeights)}</p>
                  <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-lg border border-line p-2.5"><dt className="text-[10.5px] uppercase tracking-wide text-ok">Why it resembles {referenceName}</dt><dd className="mt-1 text-fg">{why.similar ?? "No factor breakdown was returned."}</dd></div>
                    <div className="rounded-lg border border-line p-2.5"><dt className="text-[10.5px] uppercase tracking-wide text-warn">Differences and what was not compared</dt><dd className="mt-1 text-fg">{why.differs ?? "Both compared factors are close."} Not compared: {missing.join(", ")}.</dd></div>
                  </dl>
                  <p className="mt-2 text-xs text-fg-muted">{nov.sentence}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5"><Badge tone={nov.tone}>{nov.label}</Badge><ResearchStatusBadge status={c.research_status} /><span className="num text-[10.5px] text-fg-faint">terrain data {(c.terrain_valid_fraction * 100).toFixed(0)}% complete</span></div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => onSelect(c.id)} aria-pressed={sel} className={`rounded-lg border px-3 py-1.5 text-xs ${sel ? "border-copper bg-copper/10 text-copper-bright" : "border-line-strong text-fg hover:border-copper"}`}>{sel ? "Showing evidence" : "Inspect evidence"}</button>
                      <button type="button" onClick={() => onResearch(c.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-info/60 bg-info/10 px-3 py-1.5 text-xs font-semibold text-info hover:bg-info/20"><Microscope className="h-3.5 w-3.5" aria-hidden />Research this candidate</button>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
