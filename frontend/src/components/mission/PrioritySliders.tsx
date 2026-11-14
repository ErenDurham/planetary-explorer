// One real <input type=range> per scoring criterion, seeded from
// GET /scoring/default-mission. The rationale is a disclosure next to the
// label; the slider's accessible name is the criterion label.
import { RotateCcw } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { InfoTip } from "@/components/ui/InfoTip";
import { useAppStore } from "@/store/useAppStore";
import { formatUnit } from "@/lib/format";
import type { CriterionSpec } from "@/types";

export function PrioritySliders({ criteria }: { criteria: CriterionSpec[] }) {
  const weights = useAppStore((s) => s.weights);
  const setWeight = useAppStore((s) => s.setWeight);
  const resetWeights = useAppStore((s) => s.resetWeights);
  const total = Object.values(weights).reduce((a, b) => a + b, 0);

  return (
    <Section
      title="Mission priorities"
      subtitle={<span>Raw weights 0–100, normalised to sum 1 · total <span className="num text-fg">{total}</span></span>}
      actions={
        <button type="button" onClick={resetWeights} className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[10.5px] text-fg-muted hover:text-fg" aria-label="Reset priorities to defaults">
          <RotateCcw className="h-3 w-3" aria-hidden /> Defaults
        </button>
      }
    >
      <ul className="space-y-3">
        {criteria.map((c) => {
          const w = weights[c.criterion_id] ?? c.default_weight;
          const id = `w-${c.criterion_id}`;
          const pct = total > 0 ? (w / total) * 100 : 0;
          return (
            <li key={c.criterion_id}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label htmlFor={id} className="flex items-center gap-1 text-xs text-fg">
                  {c.label}
                  <InfoTip label={`Why ${c.label} matters`}>
                    <p className="mb-1.5 text-fg-muted">
                      Feature <span className="num text-fg">{c.feature_id}</span>{c.unit ? ` (${formatUnit(c.unit)})` : ""} · {c.function.direction.replace(/_/g, " ")} · full at <span className="num">{c.function.full}</span>, zero at <span className="num">{c.function.zero}</span>
                    </p>
                    <p>{c.rationale}</p>
                  </InfoTip>
                </label>
                <span className="num text-xs text-fg-muted">
                  <span className="text-fg">{w}</span>
                  <span className="text-fg-faint"> · {pct.toFixed(0)}%</span>
                </span>
              </div>
              <input
                id={id}
                type="range"
                min={0}
                max={100}
                step={1}
                value={w}
                aria-label={`${c.label} weight`}
                aria-valuetext={`${w} of 100`}
                style={{ ["--pct" as string]: `${w}%` }}
                onChange={(e) => setWeight(c.criterion_id, Number(e.target.value))}
              />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
