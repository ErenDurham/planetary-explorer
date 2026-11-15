// Linked weights over whatever features the chosen survey scores (inputs only).
// Moving one rebalances the rest so they always sum to 100; the server
// normalises and scores. Sliders are grouped by dimension, because a weighting
// is really a statement about which KIND of likeness matters -- terrain,
// illumination or water -- and each slider carries the service's own rationale
// for why that feature is comparable between the two bodies at all.
import { RotateCcw } from "lucide-react";
import { InfoTip } from "@/components/ui/InfoTip";
import type { Shares } from "@/lib/allocation";
import { TOP_K_MAX, TOP_K_MIN } from "../lib/weights";
import { SEPARATE_SCORES_NOTE } from "../lib/copy";
import type { DiscoveryCriterion } from "../adapter";

/** Criteria in the service's group order, so the panel's shape follows the basis. */
export function groupCriteria(criteria: readonly DiscoveryCriterion[]): Array<{ group: string; label: string; items: DiscoveryCriterion[] }> {
  const out: Array<{ group: string; label: string; items: DiscoveryCriterion[] }> = [];
  for (const criterion of criteria) {
    const group = criterion.group ?? "terrain";
    const found = out.find((g) => g.group === group);
    if (found) found.items.push(criterion);
    else out.push({ group, label: criterion.group_label || group, items: [criterion] });
  }
  return out;
}

export function WeightControls({ shares, defaults, criteria, onChange, onReset, topK, onTopK, disabled }: {
  shares: Shares; defaults: Shares; criteria: DiscoveryCriterion[]; onChange: (id: string, v: number) => void; onReset: () => void; topK: number; onTopK: (n: number) => void; disabled?: boolean;
}) {
  const ids = criteria.map((c) => c.feature_id);
  const atDefault = ids.every((id) => (shares[id] ?? 0) === (defaults[id] ?? 0));
  const groups = groupCriteria(criteria);
  return (
    <section aria-labelledby="weight-controls" className="rounded-xl border border-line-strong bg-bg-elev p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <h2 id="weight-controls" className="eyebrow">What should count</h2>
          <InfoTip label="About the comparison weights">{SEPARATE_SCORES_NOTE}</InfoTip>
        </div>
        <button type="button" onClick={onReset} disabled={atDefault || disabled} className="inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-fg disabled:opacity-40"><RotateCcw className="h-3 w-3" aria-hidden />Defaults</button>
      </div>
      {criteria.length === 0 ? <p className="mt-2 text-xs text-fg-muted">This survey has not declared the features it scores.</p> : null}
      <div className="mt-3 space-y-4">
        {groups.map((group) => {
          const share = group.items.reduce((total, c) => total + (shares[c.feature_id] ?? 0), 0);
          return (
            <div key={group.group}>
              <p className="flex items-baseline justify-between gap-2 text-[10.5px] uppercase tracking-wide text-fg-faint">
                <span>{group.label}</span><span className="num">{share}%</span>
              </p>
              <div className="mt-1.5 space-y-2.5">
                {group.items.map((c) => { const id = c.feature_id; const v = shares[id] ?? 0; return (
                  <label key={id} className="block text-xs">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-1 text-fg">{c.label || id.replace(/_/g, " ")}{c.rationale ? <InfoTip label={`Why ${c.label} is compared`}>{c.rationale}</InfoTip> : null}</span>
                      <span className="num text-fg-muted">{v}%</span>
                    </span>
                    <input type="range" min={0} max={100} step={1} value={v} disabled={disabled} aria-label={`${c.label || id} weight share`} aria-valuetext={`${v} percent`} onChange={e => onChange(id, Number(e.target.value))} style={{ ["--pct" as string]: `${v}%` }} className="mt-1" />
                  </label>
                ); })}
              </div>
            </div>
          );
        })}
        <label className="flex items-center justify-between gap-2 text-xs text-fg-muted">Shortlist size (top_k)
          <input type="number" min={TOP_K_MIN} max={TOP_K_MAX} value={topK} disabled={disabled} aria-label="Shortlist size" onChange={e => onTopK(Number(e.target.value))} className="num w-16 rounded border border-line-strong bg-bg px-1.5 py-1 text-right text-fg" />
        </label>
      </div>
    </section>
  );
}
