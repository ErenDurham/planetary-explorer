import { CandidatePanel } from "./CandidatePanel";
// Ranked candidate list for the VISIBLE body. Two modes share one list shape:
// landing mode (Mars only) colours rows from the suitability scale and shows
// the index 0-100; analog mode (Earth or Mars) colours rows from the rank
// palette and shows the match rank and similarity against a named reference.
// In both, the rank number and the status text are always present so colour
// is never the only encoding, and Earth rows never show a landing score.
import { CandidateRow } from "./CandidateRow";
import { EmptyNote } from "@/components/ui/Section";
import { type BadgeTone } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { markerAppearance } from "@/components/globe/colors";
import { NOT_RANKED_COLOR, missionRankPosition, rankColor, type RankPalette } from "@/lib/rankColor";
import { formatNumber } from "@/lib/format";
import type { RankedCandidate, SuitabilityResult, SuitabilityStatus } from "@/types";

const STATUS: Record<SuitabilityStatus, { label: string; tone: BadgeTone }> = {
  ok: { label: "ok", tone: "ok" },
  insufficient_data: { label: "insufficient data", tone: "warn" },
  ineligible: { label: "ineligible", tone: "danger" },
};

export { rowKeyDown } from "./CandidateRow";

export function RankedList({ results, selectedId, onSelect, isPending, warnings }: { results: SuitabilityResult[] | undefined; selectedId: string | null; onSelect: (id: string) => void; isPending?: boolean; warnings?: string[] }) {
  return (
    <CandidatePanel
      title="Ranked candidates"
      subtitle="Mars sites, scored 0–100 for the current priorities. The score is a relative index, not a probability."
      actions={isPending ? <Spinner label="Scoring" /> : undefined}
      controls={<>
      {warnings && warnings.some(w => !w.includes("thermal_conditions")) && (
        <ul className="mb-2 space-y-1" aria-label="Scoring warnings">
          {warnings.filter(w => !w.includes("thermal_conditions")).map((w, i) => (
            <li key={i} className="rounded border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] leading-snug text-warn">
              {w}
            </li>
          ))}
        </ul>
      )}
      </>}>
      {!results ? (
        <EmptyNote>{isPending ? "Scoring sites…" : "No evaluation yet."}</EmptyNote>
      ) : (
        <ol className="space-y-1" aria-label="Ranked sites">
          {results.map((r) => {
            const color = r.status === "ok" ? rankColor(missionRankPosition(r.rank,results.map(r=>r.rank))) ?? NOT_RANKED_COLOR : markerAppearance(r.status,r.score).color;
            const selected = r.site_id === selectedId;
            const st = STATUS[r.status];
            return (
              <li key={r.site_id}>
                <CandidateRow name={r.site_name} rank={r.rank} score={r.score}
                  color={r.status === "ok" ? color : undefined} selected={selected}
                  status={st.label} tone={st.tone} onSelect={() => onSelect(r.site_id)} />
              </li>
            );
          })}
        </ol>
      )}
    </CandidatePanel>
  );
}

export interface AnalogRankedListProps {
  /** Candidates on the visible body, as the backend ranked them (unrankable last). */
  candidates: RankedCandidate[] | undefined;
  bodyName: string;
  /** The reference on the other body the candidates are ranked against. */
  referenceName: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  isPending?: boolean;
  error?: Error | null;
  palette: RankPalette;
  /** A one-time best-match hint, shown as a chip and never auto-selected. */
  suggestedId?: string | null;
  /** Rendered when no reference exists yet (a reference selector). */
  emptyReference?: React.ReactNode;
  /** Text filter; filtering never recolours the remaining rows (positions come from the full pool). */
  filter?: string;
  onFilterChange?: (f: string) => void;
}

export function AnalogRankedList({ candidates, bodyName, referenceName, selectedId, onSelect, isPending, error, palette, suggestedId, emptyReference, filter = "", onFilterChange }: AnalogRankedListProps) {
  const q = filter.trim().toLowerCase();
  const visible = (candidates ?? []).filter((c) => !q || c.location.name.toLowerCase().includes(q) || c.location.id.includes(q));
  const ranked = (candidates ?? []).filter((c) => c.rank != null).length;
  return (
    <CandidatePanel
      title="Ranked candidates"
      subtitle={referenceName ? <>{bodyName} sites, matched against <span className="text-fg">{referenceName}</span>. Match % is a similarity index, not a probability.</> : `Pick a site on the other planet to rank ${bodyName} sites against.`}
      actions={isPending ? <Spinner label="Ranking" /> : undefined}
      controls={<>
      {onFilterChange && candidates && candidates.length > 0 && (
        <label className="mb-2 block text-xs text-fg-muted">
          <span className="sr-only">Filter candidates by name</span>
          <input type="search" value={filter} onChange={(e) => onFilterChange(e.target.value)} placeholder="Filter by name. Colours do not change." className="w-full rounded border border-line-strong bg-bg px-2 py-1 text-xs text-fg" />
        </label>
      )}
      {error && <p role="alert" className="mb-2 rounded border border-danger/40 bg-danger/10 px-2 py-1 text-[11px] text-danger">Ranking failed: {error.message}</p>}
      </>}>
      {!referenceName ? (
        emptyReference ?? <EmptyNote>No reference selected.</EmptyNote>
      ) : !candidates ? (
        <EmptyNote>{isPending ? "Ranking candidates…" : "No ranking yet."}</EmptyNote>
      ) : (
        <ol className="space-y-1" aria-label={`${bodyName} candidates ranked against ${referenceName}`}>
          {visible.map((c) => {
            const colour = rankColor(c.rank_color_position, palette);
            const selected = c.location.id === selectedId;
            const unranked = c.rank == null;
            const sim = c.similarity != null ? formatNumber(c.similarity, { maxFractionDigits: 1 }) : null;
            const label = `${c.location.name}, ${unranked ? "not ranked" : `match rank ${c.rank} of ${ranked}`}${sim ? `, ${sim}% match` : ""}${c.location.id === suggestedId ? ", suggested reference" : ""}`;
            return (
              <li key={c.location.id}>
                <CandidateRow name={c.location.name} rank={c.rank} score={unranked ? null : c.similarity}
                  color={colour ?? undefined} selected={selected} scoreSuffix="%" accessibleLabel={label}
                  status={unranked ? "not ranked" : c.location.id === suggestedId ? "suggested" : "match"}
                  tone={unranked ? "neutral" : "info"}
                  detail={unranked ? c.unrankable_reason ?? "Not ranked" : `Match rank ${c.rank} of ${ranked}. This is similarity, not suitability.${c.location.id === suggestedId ? " Suggested reference." : ""}`}
                  onSelect={() => onSelect(c.location.id)} />
              </li>
            );
          })}
          {visible.length === 0 && <li><EmptyNote>No candidate matches “{filter}”.</EmptyNote></li>}
        </ol>
      )}
    </CandidatePanel>
  );
}
