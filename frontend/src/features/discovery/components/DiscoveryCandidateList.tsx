// Left column of Find Earth Analogs, the discovery counterpart of the Browse
// Regions ranked list: one compact row per presented candidate, then the
// inputs (weights, shortlist size) and the export. Selecting a row drives the
// globe and the evidence panel through the discovery store. Every figure is
// the service's; the row shows where, the rank, the index and the two status
// chips, and leaves the evidence to the panel.
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { NOT_RANKED_COLOR, rankColor, rankPosition, type RankPalette } from "@/lib/rankColor";
import type { Shares } from "@/lib/allocation";
import { PROPOSED_LABEL, noveltyRelation } from "../lib/copy";
import { formatPoint } from "../lib/geo";
import { ResearchStatusBadge } from "./ResearchStatusBadge";
import { WeightControls } from "./WeightControls";
import { ExportPanel } from "./ExportPanel";
import type { DiscoveryCandidate, DiscoveryCriterion, DiscoveryRankResponse } from "../adapter";

export interface WeightInputs { shares: Shares; defaults: Shares; criteria: DiscoveryCriterion[]; onChange: (id: string, v: number) => void; onReset: () => void; topK: number; onTopK: (n: number) => void; disabled: boolean }

export function DiscoveryCandidateList({ candidates, evaluated, selectedId, onSelect, palette = "roygbiv", pending, error, status, runId, ranking, weights }: {
  /** undefined until a ranking has arrived */
  candidates: DiscoveryCandidate[] | undefined;
  /** survey.generated_count, for "4 of 16 evaluated" */
  evaluated: number | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  palette?: RankPalette;
  pending?: boolean;
  /** A rendered rank error, shown in place of the rows. */
  error?: ReactNode;
  /** A rendered loading or not-ready state, shown while there is no ranking. */
  status?: ReactNode;
  runId: string | null;
  ranking: DiscoveryRankResponse | undefined;
  weights: WeightInputs | null;
}) {
  const n = candidates?.length ?? 0;
  return (
    <div className="scroll-thin flex h-full flex-col overflow-y-auto">
      <section aria-labelledby="candidate-list" className={`px-3 py-3 ${pending ? "opacity-70" : ""}`}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="candidate-list" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Candidates · {candidates ? n : "—"}</h2>
          {pending ? <span role="status" className="text-[10.5px] text-copper-bright">Re-ranking…</span> : candidates && evaluated != null ? <span className="num text-[10.5px] text-fg-faint">{n} of {evaluated} evaluated</span> : null}
        </div>
        <p className="mt-1 text-[10.5px] leading-snug text-fg-faint">{PROPOSED_LABEL}</p>
        {error ? <div className="mt-3">{error}</div>
          : !candidates ? <div className="mt-3">{status}</div>
          : n === 0 ? <p className="mt-3 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-fg-muted">No footprint in this survey passed screening, so there is nothing to rank. The survey coverage section in the panel lists why each sampled footprint was excluded.</p>
          : (
            <ol className="mt-3 space-y-1.5" aria-label="Ranked proposed candidates">
              {candidates.map(c => {
                const sel = c.id === selectedId;
                const color = rankColor(rankPosition(c.display_rank, n), palette) ?? NOT_RANKED_COLOR;
                const nov = noveltyRelation(c.novelty);
                return (
                  <li key={c.id}>
                    <article aria-label={`Rank ${c.display_rank ?? "—"}: ${c.name}, similarity index ${c.similarity_index?.toFixed(1) ?? "not ranked"}`}>
                      <button type="button" onClick={() => onSelect(c.id)} aria-pressed={sel} className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${sel ? "border-copper bg-copper/10" : "border-transparent hover:border-line-strong"}`}>
                        <span className="flex items-start gap-2.5">
                          <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-black" style={{ background: color }} aria-hidden>{c.display_rank ?? "—"}</span>
                          <span className="min-w-0 flex-1">
                            <span className="num block text-[11px] leading-tight text-fg">{formatPoint(c.lat, c.lon_east)}</span>
                            <span className="block truncate text-[10.5px] text-fg-muted">{c.name}</span>
                          </span>
                          <span className="num shrink-0 text-right text-xs text-copper-bright">{c.similarity_index != null ? c.similarity_index.toFixed(1) : "—"}<span className="ml-0.5 text-[9px] text-fg-faint">/100</span></span>
                        </span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-1"><Badge tone={nov.tone}>{nov.label}</Badge><ResearchStatusBadge status={c.research_status} /></span>
                      </button>
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
      </section>
      {weights && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          <WeightControls {...weights} />
          <ExportPanel runId={runId} ranking={ranking} />
        </div>
      )}
    </div>
  );
}
