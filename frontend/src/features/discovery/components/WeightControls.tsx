// Two linked terrain weights (inputs only). Moving one rebalances the other so
// they always sum to 100; the server normalises and scores.
import { RotateCcw } from "lucide-react";
import type { Shares } from "@/lib/allocation";
import { SLOPE_ID, RELIEF_ID, TOP_K_MAX, TOP_K_MIN } from "../lib/weights";
import { SEPARATE_SCORES_NOTE } from "../lib/copy";
import type { DiscoveryCriterion } from "../adapter";

export function WeightControls({ shares, defaults, criteria, onChange, onReset, topK, onTopK, disabled }: {
  shares: Shares; defaults: Shares; criteria: DiscoveryCriterion[]; onChange: (id: string, v: number) => void; onReset: () => void; topK: number; onTopK: (n: number) => void; disabled?: boolean;
}) {
  const atDefault = shares[SLOPE_ID] === defaults[SLOPE_ID] && shares[RELIEF_ID] === defaults[RELIEF_ID];
  const spec = (id: string) => criteria.find(c => c.feature_id === id);
  return (
    <section aria-labelledby="weight-controls" className="rounded-xl border border-line-strong bg-bg-elev p-4">
      <div className="flex items-center justify-between gap-2"><h2 id="weight-controls" className="eyebrow">Terrain weights (inputs)</h2><button type="button" onClick={onReset} disabled={atDefault || disabled} className="inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-fg disabled:opacity-40"><RotateCcw className="h-3 w-3" aria-hidden />Defaults</button></div>
      <div className="mt-3 space-y-3">
        {[SLOPE_ID, RELIEF_ID].map(id => { const c = spec(id); const v = shares[id] ?? 0; return (
          <label key={id} className="block text-xs">
            <span className="flex items-baseline justify-between gap-2"><span className="text-fg">{c?.label ?? id.replace(/_/g, " ")}</span><span className="num text-fg-muted">{v}%</span></span>
            <input type="range" min={0} max={100} step={1} value={v} disabled={disabled} aria-label={`${c?.label ?? id} weight share`} aria-valuetext={`${v} percent`} onChange={e => onChange(id, Number(e.target.value))} style={{ ["--pct" as string]: `${v}%` }} className="mt-1" />
            {c && <span className="block text-[10.5px] text-fg-faint">Unit {c.unit} · fixed distance scale {c.scale} {c.unit} (an unvalidated assumption declared by the service)</span>}
          </label>
        ); })}
        <label className="flex items-center justify-between gap-2 text-xs text-fg-muted">Shortlist size (top_k)
          <input type="number" min={TOP_K_MIN} max={TOP_K_MAX} value={topK} disabled={disabled} aria-label="Shortlist size" onChange={e => onTopK(Number(e.target.value))} className="num w-16 rounded border border-line-strong bg-bg px-1.5 py-1 text-right text-fg" />
        </label>
      </div>
      <p className="mt-3 text-[10.5px] leading-relaxed text-fg-faint">{SEPARATE_SCORES_NOTE}</p>
    </section>
  );
}
