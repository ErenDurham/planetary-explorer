import { Bookmark, BookmarkCheck } from "lucide-react";
import { rankColor, rankPosition, type RankPalette } from "@/lib/rankColor";
import { candidateTitle } from "../lib/copy";
import type { DiscoveryCandidate } from "../adapter";

export function CandidateList({ candidates, selectedId, onSelect, palette = "roygbiv", pending, savedIds = [], onSave, onInspect }: {
  candidates: DiscoveryCandidate[]; selectedId: string | null; onSelect: (id: string) => void; palette?: RankPalette; pending?: boolean; savedIds?: string[]; onSave?: (candidate: DiscoveryCandidate) => void; onInspect?: () => void;
}) {
  return <section aria-labelledby="candidate-list" className="flex h-full min-h-0 flex-col rounded-xl border border-line bg-bg-elev">
    <header className="border-b border-line px-4 py-4"><div className="flex items-center justify-between gap-2"><h2 id="candidate-list" className="text-sm font-semibold text-fg">Terrain matches <span className="num ml-1 text-fg-muted">{candidates.length}</span></h2>{pending && <span className="text-xs text-copper-bright" role="status">Updating…</span>}</div><p className="mt-1 text-xs leading-relaxed text-fg-muted">Select to inspect. Save up to 3 to compare.</p></header>
    {candidates.length === 0 ? <p className="p-4 text-sm text-fg-muted">No eligible region in this survey. Review the screening audit below.</p> : <ol className={`scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto p-2 ${pending ? "opacity-60" : ""}`} aria-label="Ranked proposed candidates" aria-busy={pending}>
      {candidates.map(c => {
        const selected = c.id === selectedId, saved = savedIds.includes(c.id), color = rankColor(rankPosition(c.display_rank, candidates.length), palette) ?? "#8a919c";
        return <li key={c.id} className={`relative rounded-lg border transition-colors ${selected ? "border-copper/70 bg-copper/10" : "border-transparent hover:bg-bg-elev-2"}`}>
          <button type="button" onClick={() => onSelect(c.id)} aria-pressed={selected} aria-label={`Rank ${c.display_rank ?? "—"}: ${c.name}, similarity index ${c.similarity_index?.toFixed(1) ?? "not ranked"}`} className="grid w-full grid-cols-[22px_minmax(0,1fr)] gap-3 rounded-lg py-3 pl-3 pr-11 text-left">
            <span className="num mt-1 text-xs" style={{ color }}>{c.display_rank ?? "—"}</span>
            <span className="min-w-0"><span className="flex items-baseline justify-between gap-2"><span className="text-sm font-medium leading-snug text-fg">{candidateTitle(c)}</span><span className="num shrink-0 text-sm text-fg" title="Two-feature terrain similarity index, out of 100">{c.similarity_index?.toFixed(1) ?? "—"}</span></span>
              <span className="mt-2 block h-1 overflow-hidden rounded bg-line" aria-hidden><span className="block h-full" style={{ width: `${c.similarity_index ?? 0}%`, backgroundColor: color }} /></span>
              <span className="mt-2 block text-[11px] text-fg-muted">{Math.round(c.terrain_valid_fraction * 100)}% terrain coverage{c.research_status === "literature_reviewed" ? " · Literature reviewed" : c.research_status === "in_progress" ? " · Review in progress" : ""}</span>
            </span>
          </button>
          {onSave && <button type="button" onClick={() => onSave(c)} aria-label={`${saved ? "Remove" : "Save"} ${c.name} ${saved ? "from" : "to"} shortlist`} aria-pressed={saved} disabled={pending || (!saved && savedIds.length >= 3)} title={saved ? "Remove from shortlist" : savedIds.length >= 3 ? "Shortlist full (3 regions)" : "Save for comparison"} className={`absolute right-1.5 top-2 rounded-md p-2 disabled:opacity-25 ${saved ? "text-copper-bright" : "text-fg-muted hover:text-fg"}`}>{saved ? <BookmarkCheck className="h-4 w-4" aria-hidden /> : <Bookmark className="h-4 w-4" aria-hidden />}</button>}
        </li>;
      })}
    </ol>}
    <footer className="border-t border-line px-4 py-3"><p className="text-[11px] text-fg-faint">Terrain index / 100 · field validation required</p>{selectedId && onInspect && <button type="button" onClick={onInspect} className="mt-2 text-xs font-medium text-copper-bright hover:underline">View selected evidence ↓</button>}</footer>
  </section>;
}
