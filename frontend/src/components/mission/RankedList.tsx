// Ranked candidate list. Colour comes from the shared score scale, but the
// rank number and the status text are always present so colour is never the
// only encoding.
import { Section, EmptyNote } from "@/components/ui/Section";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { markerAppearance } from "@/components/globe/colors";
import { formatNumber } from "@/lib/format";
import type { SuitabilityResult, SuitabilityStatus } from "@/types";

const STATUS: Record<SuitabilityStatus, { label: string; tone: BadgeTone }> = {
  ok: { label: "ok", tone: "ok" },
  insufficient_data: { label: "insufficient data", tone: "warn" },
  ineligible: { label: "ineligible", tone: "danger" },
};

export function RankedList({ results, selectedId, onSelect, isPending, warnings }: { results: SuitabilityResult[] | undefined; selectedId: string | null; onSelect: (id: string) => void; isPending?: boolean; warnings?: string[] }) {
  return (
    <Section
      title="Ranked candidates"
      subtitle="Relative suitability index 0–100 under the current priorities. Not a probability."
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
                  onKeyDown={e => {
                    if (e.altKey || e.ctrlKey || e.metaKey) return;
                    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
                    const buttons = Array.from(e.currentTarget.closest("ol")?.querySelectorAll<HTMLButtonElement>("button") ?? []);
                    const i = buttons.indexOf(e.currentTarget);
                    const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)));
                    e.preventDefault();
                    buttons[next]?.focus();
                  }}
                  aria-pressed={selected}
                  aria-label={`${r.site_name}, ${r.rank != null ? `rank ${r.rank}, ` : ""}${r.score != null ? `index ${formatNumber(r.score, { maxFractionDigits: 1 })}, ` : ""}${st.label}`}
                  className={`group grid w-full grid-cols-[22px_1fr_auto] items-center gap-2 rounded border px-2 py-1.5 text-left transition-colors ${selected ? "border-copper bg-copper/10" : "border-transparent hover:border-line-strong hover:bg-bg-elev-2"}`}
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
