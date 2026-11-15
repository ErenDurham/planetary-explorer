import { PRIORITY_GUIDE } from "@/lib/objective";
import type { FactorScore } from "@/types";

/** Direct labels remain legible in a narrow detail pane and on the keyboard.
 * Bar lengths use the same 0–100 index scale, never a per-row scale. */
export function FactorBreakdownChart({ factors }: { factors: FactorScore[] }) {
  const active = factors.filter(f => !f.excluded_reason && !f.is_missing && f.weighted_contribution != null);
  const excluded = factors.filter(f => f.excluded_reason || f.is_missing || f.weighted_contribution == null);
  return <figure aria-label="Factor breakdown: weighted contribution per criterion" className="mt-3">
    <ul className="space-y-4">{[...active].sort((a,b) => (b.weighted_contribution ?? 0) - (a.weighted_contribution ?? 0)).map(f => {
      const guide = PRIORITY_GUIDE[f.criterion_id];
      const points = f.weighted_contribution ?? 0;
      return <li key={f.criterion_id}>
        <div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="text-fg">{guide?.name ?? f.label}</span><span className="num shrink-0 font-semibold text-fg">{points.toFixed(1)} <span className="font-normal text-fg-muted">pts</span></span></div>
        <div className="h-2 overflow-hidden rounded-full bg-line" aria-hidden><div className="h-full rounded-full" style={{width: `${Math.max(0, Math.min(100, points))}%`, background: guide?.color ?? "var(--color-data-highlight)"}} /></div>
        <p className="mt-1 text-xs text-fg-muted">{Math.round((f.normalized_weight ?? 0) * 100)}% influence</p>
      </li>;
    })}</ul>
    {excluded.length > 0 && <p className="mt-4 text-xs text-fg-muted">Not scored: {excluded.map(f => PRIORITY_GUIDE[f.criterion_id]?.name ?? f.label).join(", ")}</p>}
  </figure>;
}
