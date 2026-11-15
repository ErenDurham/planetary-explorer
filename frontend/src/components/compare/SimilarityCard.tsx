// The pair's similarity index from POST /analogs/rank: the entry for exactly
// this candidate in the pool ranked against the reference. Rank colour is
// relative rank only (lib/rankColor). Landing suitability never appears here.
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { BulletList, EmptyNote } from "@/components/ui/Section";
import { rankColor, RANK_LEGEND_SENTENCE, NOT_RANKED_COLOR } from "@/lib/rankColor";
import { analogFeatureLabel, BODY_NAME, type Body } from "@/lib/analogFeatures";
import { topTwo } from "@/lib/comparison";
import { formatNumber, formatPercent } from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";
import type { AnalogRankResponse, RankedCandidate } from "@/types";
import type { UseQueryResult } from "@tanstack/react-query";

export function SimilarityCard({ rank, candidate, candidateBody, candidateName, referenceName }: { rank: UseQueryResult<AnalogRankResponse>; candidate: RankedCandidate | undefined; candidateBody: Body; candidateName: string; referenceName: string }) {
  const palette = useAppStore(s => s.rankPalette);
  const data = rank.data;
  const swatch = rankColor(candidate?.rank_color_position, palette);
  return (
    <section aria-label="Similarity index for this pair" className="rounded border border-line bg-bg-elev p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Similarity index</h2>
          <p className="mt-0.5 text-xs text-fg-faint">{candidateName} against the reference {referenceName} · 100 / (1 + D) over the common feature basis · heuristic, not landing suitability{data && <> · spec {data.analog_spec_version}</>}</p>
        </div>
        {rank.isPending && <Spinner label="Ranking the pool" />}
        {rank.error && <div className="max-w-sm"><ErrorNote error={rank.error} context="analogs/rank" /><button type="button" className="mt-2 text-xs text-copper-bright underline" onClick={() => void rank.refetch()}>Retry ranking</button></div>}
        {data && candidate && (
          <div className="flex items-center gap-3" data-testid="pair-similarity">
            <span aria-hidden className="h-10 w-10 shrink-0 rounded" style={swatch ? { background: swatch } : { border: `2px dashed ${NOT_RANKED_COLOR}` }} data-testid="rank-swatch" />
            <div>
              <div className="num text-3xl font-medium leading-none text-fg">{candidate.similarity != null ? formatNumber(candidate.similarity, { maxFractionDigits: 1 }) : "—"}<span className="ml-1.5 text-sm text-fg-muted">/ 100</span></div>
              <div className="mt-1 text-xs text-fg-muted">{candidate.rank != null ? <>Rank <span className="num text-fg">{candidate.rank}</span> of {data.ranked_count} ranked {BODY_NAME[candidateBody]} candidates (pool {data.pool_size})</> : <span className="text-warn">Not ranked{candidate.unrankable_reason ? `: ${candidate.unrankable_reason}` : ""}</span>}</div>
              <div className="num text-[10.5px] text-fg-faint">D = {candidate.distance != null ? candidate.distance.toFixed(3) : "—"} · comparable features {formatPercent(candidate.coverage_fraction)}</div>
            </div>
          </div>
        )}
        {data && !candidate && <p role="status" className="max-w-sm text-sm text-warn">{candidateName} is not in the pool ranked against {referenceName}; no similarity can be shown for this pair.</p>}
      </div>
      {data && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs" aria-label="Feature basis">
          <span className="text-fg-faint">Basis:</span>
          {data.basis_features.map(f => <Badge key={f} tone="neutral">{analogFeatureLabel(f)} {data.effective_weights[f] != null && <span className="num normal-case">{Math.round(data.effective_weights[f] * 100)}%</span>}</Badge>)}
          {data.excluded_features.map(f => <Badge key={f.feature_id} tone="warn" title={f.reason}>Excluded: {f.label}</Badge>)}
        </div>
      )}
      {data && data.excluded_features.length > 0 && <ul className="mt-1 text-[11px] text-fg-faint">{data.excluded_features.map(f => <li key={f.feature_id}>{f.label}: {f.reason}</li>)}</ul>}
      {candidate && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div><h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-ok">Strongest supported similarities</h3><BulletList items={topTwo(candidate.shared_characteristics)} tone="ok" empty="No feature is close at the harmonised scale." /></div>
          <div><h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-danger">Important differences</h3><BulletList items={topTwo(candidate.important_differences)} tone="danger" empty="No large difference among comparable features." /></div>
        </div>
      )}
      {data && candidate && (candidate.shared_characteristics?.length ?? 0) + (candidate.important_differences?.length ?? 0) === 0 && <EmptyNote>No characteristic statements were returned for this pair.</EmptyNote>}
      <p className="mt-3 text-[11px] text-fg-faint">{RANK_LEGEND_SENTENCE} {data?.tie_rule}</p>
    </section>
  );
}
