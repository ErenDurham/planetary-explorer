import { ResearchStatusBadge } from "./ResearchStatusBadge";
// The server's diversified shortlist: display rank, raw rank before
// diversification, similarity index, terrain coverage and catalog relation.
import { Badge } from "@/components/ui/Badge";
import { rankColor, rankPosition, type RankPalette } from "@/lib/rankColor";
import { PROPOSED_LABEL, noveltyRelation } from "../lib/copy";
import type { DiscoveryCandidate } from "../adapter";

export function CandidateList({ candidates, selectedId, onSelect, palette = "roygbiv", pending }: { candidates: DiscoveryCandidate[]; selectedId: string | null; onSelect: (id: string) => void; palette?: RankPalette; pending?: boolean }) {
  const n = candidates.length;
  return (
    <section aria-labelledby="candidate-list" className={`rounded-xl border border-line-strong bg-bg-elev p-4 ${pending ? "opacity-70" : ""}`}>
      <div className="flex items-baseline justify-between gap-2"><h2 id="candidate-list" className="eyebrow">Proposed candidates · {n}</h2>{pending && <span className="text-[11px] text-copper-bright" role="status">Re-ranking…</span>}</div>
      <p className="mt-1 text-[11px] text-fg-muted">{PROPOSED_LABEL}</p>
      {n === 0 ? <p className="mt-3 rounded border border-dashed border-line px-3 py-2 text-xs text-fg-faint">No eligible region in this survey. The coverage panel lists why each sampled footprint was excluded.</p> : (
        <ol className="mt-3 space-y-1.5" aria-label="Ranked proposed candidates">
          {candidates.map(c => { const sel = c.id === selectedId; const pos = rankPosition(c.display_rank, n); const color = rankColor(pos, palette) ?? "#8a919c"; const nov = noveltyRelation(c.novelty); return (
            <li key={c.id}>
              <button type="button" onClick={() => onSelect(c.id)} aria-pressed={sel} aria-label={`Rank ${c.display_rank ?? "—"}: ${c.name}, similarity index ${c.similarity_index?.toFixed(1) ?? "not ranked"}`} className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${sel ? "border-copper bg-copper/10" : "border-line hover:border-line-strong"}`}>
                <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-black" style={{ background: color }} aria-hidden>{c.display_rank ?? "—"}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2"><span className="truncate text-sm text-fg">{c.name}</span><span className="num shrink-0 text-sm text-fg">{c.similarity_index != null ? `${c.similarity_index.toFixed(1)} / 100` : "—"}</span></span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-fg-muted"><span className="num">{c.lat.toFixed(3)}°, {c.lon_east.toFixed(3)}°E</span>{c.raw_rank != null && c.raw_rank !== c.display_rank && <span>raw rank {c.raw_rank}</span>}<span className="num">terrain valid {(c.terrain_valid_fraction * 100).toFixed(0)}%</span><Badge tone={nov.tone}>{nov.label}</Badge><ResearchStatusBadge status={c.research_status} /></span>
                </span>
              </button>
            </li>
          ); })}
        </ol>
      )}
    </section>
  );
}
