// Left column of Find Earth Analogs, built from the SAME primitives as the
// Browse Regions ranked list (CandidatePanel, candidateRowClass, rowKeyDown) so
// the two Explore modes read as one product rather than two apps. What differs
// is what a discovery row has to say: a candidate is a place in a named survey
// region, and its headline index hides the fact that a region can be an
// excellent match on terrain and a poor one on water. So each row carries the
// region, the overall index, and the service's per-dimension breakdown.
// Every figure is the service's; nothing here is computed.
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { CandidatePanel } from "@/components/mission/CandidatePanel";
import { candidateRowClass, rowKeyDown } from "@/components/mission/CandidateRow";
import { formatNumber } from "@/lib/format";
import { NOT_RANKED_COLOR, rankColor, rankPosition, type RankPalette } from "@/lib/rankColor";
import type { Shares } from "@/lib/allocation";
import { PROPOSED_LABEL, noveltyRelation } from "../lib/copy";
import { formatPoint } from "../lib/geo";
import { ResearchStatusBadge } from "./ResearchStatusBadge";
import { WeightControls } from "./WeightControls";
import { ExportPanel } from "./ExportPanel";
import type { DiscoveryCandidate, DiscoveryCriterion, DiscoveryDimensionScore, DiscoveryRankResponse } from "../adapter";

export interface WeightInputs { shares: Shares; defaults: Shares; criteria: DiscoveryCriterion[]; onChange: (id: string, v: number) => void; onReset: () => void; topK: number; onTopK: (n: number) => void; disabled: boolean }

/** The per-dimension indices, shortest-label first, as the service reported them. */
export function DimensionStrip({ dimensions, color }: { dimensions: DiscoveryDimensionScore[]; color: string }) {
  if (dimensions.length === 0) return null;
  return (
    <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1" aria-hidden>
      {dimensions.map((d) => (
        <span key={d.group} className="flex min-w-[64px] flex-1 flex-col gap-0.5">
          <span className="flex items-baseline justify-between gap-1 text-[9.5px] uppercase tracking-wide text-fg-faint">
            <span className="truncate">{d.group}</span>
            <span className="num">{formatNumber(d.similarity_index, { maxFractionDigits: 0 })}</span>
          </span>
          <span className="block h-1 w-full overflow-hidden rounded-sm bg-line">
            <span className="block h-full" style={{ width: `${Math.max(0, Math.min(100, d.similarity_index))}%`, backgroundColor: color }} />
          </span>
        </span>
      ))}
    </span>
  );
}

/** Spoken summary of the dimension breakdown, so the bars are not the only encoding. */
export function dimensionSentence(dimensions: DiscoveryDimensionScore[]): string {
  if (dimensions.length === 0) return "";
  return dimensions.map((d) => `${d.label} ${formatNumber(d.similarity_index, { maxFractionDigits: 0 })} of 100`).join("; ");
}

export function DiscoveryCandidateList({ candidates, evaluated, regionsSearched, referenceName, selectedId, onSelect, palette = "roygbiv", pending, error, status, runId, ranking, weights }: {
  /** undefined until a ranking has arrived */
  candidates: DiscoveryCandidate[] | undefined;
  /** survey.generated_count, for "6 of 144 evaluated" */
  evaluated: number | null;
  /** how many distinct regions the survey covered */
  regionsSearched?: number | null;
  referenceName?: string;
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
  const subtitle = candidates && evaluated != null
    ? <>{n} of {evaluated} surveyed footprints{regionsSearched ? <> across {regionsSearched} regions</> : null} · similarity to {referenceName ?? "the reference"} is an index, not a probability.</>
    : PROPOSED_LABEL;
  return (
    <div className="scroll-thin flex h-full flex-col overflow-y-auto">
      <div className="min-h-0 flex-1">
        <CandidatePanel
          title="Ranked candidates"
          subtitle={subtitle}
          actions={pending ? <span role="status" className="text-[10.5px] text-copper-bright">Re-ranking…</span> : undefined}
          controls={<div className="space-y-1 text-[10.5px] leading-snug text-fg-faint">
            <p>{PROPOSED_LABEL} Shortlisted regions are kept apart on the map, so each row is a different place rather than a neighbouring cell.</p>
            {candidates && n > 0 ? <p>Numbered outlines: candidate footprints. Dots: sampled centres. Dashed boundary: survey area. Grey markers: catalog sites.</p> : null}
          </div>}
        >
          {error ? <div className="pt-1">{error}</div>
            : !candidates ? <div className="pt-1">{status}</div>
            : n === 0 ? <p className="mt-1 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-fg-muted">No footprint in this survey passed screening, so there is nothing to rank. The survey coverage section in the panel lists why each sampled footprint was excluded.</p>
            : (
              <ol className="space-y-1" aria-label="Ranked proposed candidates">
                {candidates.map(c => {
                  const selected = c.id === selectedId;
                  const color = rankColor(rankPosition(c.display_rank, n), palette) ?? NOT_RANKED_COLOR;
                  const nov = noveltyRelation(c.novelty);
                  const dimensions = c.dimension_scores ?? [];
                  const index = c.similarity_index;
                  const label = `Rank ${c.display_rank ?? "not ranked"}: ${c.name}, similarity index ${index != null ? formatNumber(index, { maxFractionDigits: 1 }) : "not ranked"}${dimensions.length ? `. ${dimensionSentence(dimensions)}` : ""}`;
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => onSelect(c.id)} onKeyDown={rowKeyDown} aria-pressed={selected} aria-label={label} className={candidateRowClass(selected)}>
                        <span className="num text-xs text-fg-muted">{c.display_rank ?? "—"}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs text-fg" title={c.name}>{c.name}</span>
                          <span className="num block truncate text-[10px] text-fg-faint">{formatPoint(c.lat, c.lon_east)}</span>
                          <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-sm bg-line" aria-hidden>
                            {index != null && <span className="block h-full" style={{ width: `${index}%`, backgroundColor: color }} />}
                          </span>
                          <DimensionStrip dimensions={dimensions} color={color} />
                        </span>
                        <span className="flex flex-col items-end gap-0.5">
                          <span className="num text-xs" style={{ color }}>{index != null ? formatNumber(index, { maxFractionDigits: 1 }) : "—"}</span>
                          <Badge tone={nov.tone} title={nov.label}>{nov.label}</Badge>
                          <ResearchStatusBadge status={c.research_status} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
        </CandidatePanel>
      </div>
      {weights && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          <WeightControls {...weights} />
          <ExportPanel runId={runId} ranking={ranking} />
        </div>
      )}
    </div>
  );
}
