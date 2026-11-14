// Ranked candidate list for the VISIBLE body. Two modes share one list shape:
// landing mode (Mars only) colours rows from the suitability scale and shows
// the index 0-100; analog mode (Earth or Mars) colours rows from the rank
// palette and shows the match rank and similarity against a named reference.
// In both, the rank number and the status text are always present so colour
// is never the only encoding, and Earth rows never show a landing score.
import { Section, EmptyNote } from "@/components/ui/Section";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { markerAppearance } from "@/components/globe/colors";
import { NOT_RANKED_COLOR, rankColor, type RankPalette } from "@/lib/rankColor";
import { formatNumber } from "@/lib/format";
import type { RankedCandidate, SuitabilityResult, SuitabilityStatus } from "@/types";

const STATUS: Record<SuitabilityStatus, { label: string; tone: BadgeTone }> = {
  ok: { label: "ok", tone: "ok" },
  insufficient_data: { label: "insufficient data", tone: "warn" },
  ineligible: { label: "ineligible", tone: "danger" },
};

function rowKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
  const buttons = Array.from(e.currentTarget.closest("ol")?.querySelectorAll<HTMLButtonElement>("button") ?? []);
  const i = buttons.indexOf(e.currentTarget);
  const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
  e.preventDefault();
  buttons[next]?.focus();
}

const ROW = (selected: boolean) => `group grid w-full grid-cols-[22px_1fr_auto] items-center gap-2 rounded border px-2 py-1.5 text-left transition-colors ${selected ? "border-copper bg-copper/10" : "border-transparent hover:border-line-strong hover:bg-bg-elev-2"}`;

export function RankedList({ results, selectedId, onSelect, isPending, warnings }: { results: SuitabilityResult[] | undefined; selectedId: string | null; onSelect: (id: string) => void; isPending?: boolean; warnings?: string[] }) {
  return (
    <Section
      title="Ranked candidates"
      subtitle="Mars · relative suitability index 0–100 under the current priorities. Not a probability."
      actions={isPending ? <Spinner label="Scoring" /> : undefined}
    >
      <p className="mb-3 text-xs text-fg-muted">↑ ↓ browse · Enter or Space select · Home / End first or last</p>
      {warnings && warnings.length > 0 && (
        <ul className="mb-2 space-y-1" aria-label="Scoring warnings">
          {warnings.map((w, i) => (
            <li key={i} className="rounded border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] leading-snug text-warn">
              {w.includes("thermal_conditions") ? "Temperature data is unavailable. Thermal conditions are excluded; the remaining priorities are rescaled fairly across every site." : w}
            </li>
          ))}
        </ul>
      )}
      {!results ? (
        <EmptyNote>{isPending ? "Scoring sites…" : "No evaluation yet."}</EmptyNote>
      ) : (
        <ol className="space-y-1" aria-label="Ranked sites">
          {results.map((r) => {
            const { color } = markerAppearance(r.status, r.score);
            const selected = r.site_id === selectedId;
            const st = STATUS[r.status];
            return (
              <li key={r.site_id}>
                <button
                  type="button"
                  onClick={() => onSelect(r.site_id)}
                  onKeyDown={rowKeyDown}
                  aria-pressed={selected}
                  aria-label={`${r.site_name}, ${r.rank != null ? `rank ${r.rank}, ` : ""}${r.score != null ? `index ${formatNumber(r.score, { maxFractionDigits: 1 })}, ` : ""}${st.label}`}
                  className={ROW(selected)}
                >
                  <span className="num text-xs text-fg-muted">{r.rank != null ? r.rank : "—"}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-fg">{r.site_name}</span>
                    <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-sm bg-line" aria-hidden>
                      {r.score != null && <span className="block h-full" style={{ width: `${r.score}%`, backgroundColor: color }} />}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="num text-xs" style={{ color: r.status === "ok" ? color : undefined }}>
                      {r.score != null ? formatNumber(r.score, { maxFractionDigits: 1 }) : "—"}
                    </span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
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
    <Section
      title={`${bodyName} analog candidates`}
      subtitle={referenceName ? <>Match rank against <span className="text-fg">{referenceName}</span> · similarity index 0–100, not scientific equivalence.</> : `Pick a reference on the other body to rank ${bodyName} candidates.`}
      actions={isPending ? <Spinner label="Ranking" /> : undefined}
    >
      <p className="mb-2 text-xs text-fg-muted">↑ ↓ browse · Enter or Space select · Home / End first or last</p>
      {onFilterChange && candidates && candidates.length > 0 && (
        <label className="mb-2 block text-xs text-fg-muted">
          <span className="sr-only">Filter candidates by name</span>
          <input type="search" value={filter} onChange={(e) => onFilterChange(e.target.value)} placeholder="Filter by name (colours stay fixed)" className="w-full rounded border border-line-strong bg-bg px-2 py-1 text-xs text-fg" />
        </label>
      )}
      {error && <p role="alert" className="mb-2 rounded border border-danger/40 bg-danger/10 px-2 py-1 text-[11px] text-danger">Ranking failed: {error.message}</p>}
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
            const label = `${c.location.name}, ${unranked ? "not ranked" : `match rank ${c.rank} of ${ranked}`}${sim ? `, similarity ${sim}` : ""}${c.location.id === suggestedId ? ", suggested reference" : ""}`;
            return (
              <li key={c.location.id}>
                <button type="button" onClick={() => onSelect(c.location.id)} onKeyDown={rowKeyDown} aria-pressed={selected} aria-label={label} className={ROW(selected)}>
                  <span
                    className="num inline-flex h-[20px] w-[22px] items-center justify-center rounded-full border text-[11px] font-semibold"
                    style={unranked ? { borderColor: NOT_RANKED_COLOR, borderStyle: "dashed", color: NOT_RANKED_COLOR } : { backgroundColor: colour ?? undefined, borderColor: "#ffffff", color: "#ffffff", textShadow: "0 0 2px #000" }}
                    aria-hidden
                  >
                    {c.rank ?? "–"}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-fg">{c.location.name}</span>
                    <span className="block truncate text-[10.5px] text-fg-muted">{unranked ? `Not ranked${c.unrankable_reason ? ` · ${c.unrankable_reason}` : ""}` : `rank ${c.rank} of ${ranked}`}{c.location.id === suggestedId && <Badge tone="info" className="ml-1">Suggested reference</Badge>}</span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="num text-xs text-fg">{sim ?? "—"}</span>
                    <span className="text-[10px] uppercase tracking-wide text-fg-faint">{unranked ? "not ranked" : "similarity"}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && <li><EmptyNote>No candidate matches “{filter}”.</EmptyNote></li>}
        </ol>
      )}
    </Section>
  );
}
