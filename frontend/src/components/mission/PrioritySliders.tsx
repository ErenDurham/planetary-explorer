// Mission priorities as SHARE sliders: one row per data-available factor, the
// slider value IS the factor's integer percentage of the scored priorities,
// and the active shares always sum to 100 (lib/allocation.ts). Excluded
// factors sit in one muted "Unavailable" row with a disabled control, never a
// full card, so they can never read as part of the ranking. The thumb, the
// number beside it, the allocation bar and the backend's normalized_weight all
// agree because they are the same number.
import { RotateCcw } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { InfoTip } from "@/components/ui/InfoTip";
import { useAppStore } from "@/store/useAppStore";
import { PRIORITY_GUIDE, factorName } from "@/lib/objective";
import { activeTotal } from "@/lib/allocation";
import type { CriterionSpec, SuitabilityResult } from "@/types";

export function PrioritySliders({ criteria, result }: { criteria: CriterionSpec[]; result?: SuitabilityResult }) {
  const weights = useAppStore((s) => s.weights);
  const beginChange = useAppStore(s => s.beginPriorityChange);
  const setWeight = useAppStore((s) => s.setWeight);
  const resetWeights = useAppStore((s) => s.resetWeights);
  const excludedIds = useAppStore((s) => s.excludedCriteria);
  const excluded = new Set(excludedIds);
  const active = criteria.filter((c) => !excluded.has(c.criterion_id));
  const unavailable = criteria.filter((c) => excluded.has(c.criterion_id));
  const total = activeTotal(weights, excluded);
  const share = (id: string) => Math.round(weights[id] ?? 0);

  return (
    <Section
      title="Mission priorities"
      subtitle="Shares total 100%. Moving one factor rescales the others proportionally."
      actions={
        <button type="button" onClick={() => resetWeights()} className="inline-flex shrink-0 items-center gap-1 rounded border border-line px-2 py-1 text-xs text-fg-muted hover:text-fg" aria-label="Reset priorities to the applied objective's suggestion" title="Restore the applied objective's suggested shares">
          <RotateCcw className="h-3 w-3" aria-hidden /> Reset
        </button>
      }
    >
      <div className="mission-bar mb-2 flex h-1.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`Allocation: ${active.map((c) => `${factorName(c.criterion_id, c.label)} ${share(c.criterion_id)}%`).join(", ")}`}>
        {active.map((c) => (
          <span key={c.criterion_id} title={`${factorName(c.criterion_id, c.label)}: ${share(c.criterion_id)}%`} style={{ width: `${total ? (share(c.criterion_id) / total) * 100 : 0}%`, background: PRIORITY_GUIDE[c.criterion_id]?.color ?? "#9aa5b4" }} />
        ))}
      </div>

      <ul className="divide-y divide-line/60" aria-label="Priority shares">
        {active.map((c) => {
          const guide = PRIORITY_GUIDE[c.criterion_id];
          const name = factorName(c.criterion_id, c.label);
          const value = share(c.criterion_id);
          const id = `share-${c.criterion_id}`;
          return (
            <li key={id} className="mission-row py-1.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: guide?.color ?? "#9aa5b4" }} aria-hidden />
                <label htmlFor={id} className="min-w-0 truncate text-sm text-fg">{name}</label>
                <InfoTip label={`About ${name}`}>
                  <dl className="space-y-1.5">
                    <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">Preference</dt><dd>{guide?.preference ?? c.rationale}</dd></div>
                    <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">Measured or modelled quantity</dt><dd>{guide?.quantity ?? `${c.feature_id.replace(/_/g, " ")}${c.unit ? ` (${c.unit})` : ""}`}</dd></div>
                    <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">Caveat</dt><dd>{guide?.caveat ?? "Regional screening only."}</dd></div>
                  </dl>
                  <p className="mt-2 text-fg-muted">Scoring rule (backend, unchanged): {c.function.direction.replace(/_/g, " ")}. Fully suitable at {c.function.full} {c.unit}; zero at {c.function.zero} {c.unit}.</p>
                </InfoTip>
                <output htmlFor={id} className="num ml-auto shrink-0 text-sm text-fg" aria-hidden>{value}%</output>
              </div>
              <p id={`${id}-pref`} className="mb-1 truncate pl-4 text-[11px] leading-snug text-fg-muted" title={guide?.preference}>{guide?.preference ?? c.rationale}</p>
              <input
                id={id}
                type="range"
                min={0}
                max={100}
                step={1}
                value={value}
                aria-label={`${name} share of priorities`}
                aria-valuetext={`${value} percent`}
                aria-describedby={`${id}-pref`}
                style={{ ["--pct" as string]: `${value}%` }}
                onPointerDown={() => beginChange(c.criterion_id)}
                onKeyDown={e => { if (!e.repeat && ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(e.key)) beginChange(c.criterion_id); }}
                onChange={(e) => setWeight(c.criterion_id, Number(e.target.value))}
              />
            </li>
          );
        })}
        {unavailable.map((c) => {
          const name = factorName(c.criterion_id, c.label);
          const reason = PRIORITY_GUIDE[c.criterion_id]?.unavailableReason ?? result?.factor_scores.find((f) => f.criterion_id === c.criterion_id)?.excluded_reason ?? "No measurements for this factor; excluded from every score.";
          const id = `share-${c.criterion_id}`;
          return (
            <li key={id} className="mission-row mission-row-unavailable py-1.5 text-fg-faint" data-testid={`unavailable-${c.criterion_id}`}>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full border border-line-strong" aria-hidden />
                <label htmlFor={id} className="min-w-0 truncate text-xs">{name}</label>
                <span className="ml-auto shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Unavailable</span>
              </div>
              <p id={`${id}-pref`} className="pl-4 text-[11px] leading-snug">{reason}</p>
              <input id={id} type="range" min={0} max={100} value={0} disabled readOnly aria-label={`${name} share of priorities`} aria-valuetext="unavailable, 0 percent" aria-describedby={`${id}-pref`} className="mt-1 h-0.5 w-24 opacity-30" style={{ ["--pct" as string]: "0%" }} />
            </li>
          );
        })}
      </ul>
      {total !== 100 && active.length > 0 && <p className="mt-2 text-xs text-warn" role="alert">Shares total {total}%, not 100%. Reset to restore the applied objective's suggestion.</p>}
    </Section>
  );
}
