// What the selected site SCORES under the current mission. Kept visually and
// conceptually separate from the environmental profile (what the site IS).
import { Section, BulletList, EmptyNote } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { formatNumber, formatPercent, formatValueWithUnit } from "@/lib/format";
import { rankColor, rankPosition } from "@/lib/rankColor";
import { FactorBreakdownChart } from "@/components/charts/FactorBreakdownChart";
import type { SuitabilityResult } from "@/types";

export function SuitabilityPanel({ result, scoringSpecVersion, isPending, totalRanked }: { result: SuitabilityResult | undefined; scoringSpecVersion?: string; isPending?: boolean; totalRanked?: number }) {
  if (!result) {
    return (
      <Section title="Mission suitability" subtitle="Relative index under the current mission priorities">
        {isPending ? <Spinner label="Scoring" /> : <EmptyNote>Select a site to see its suitability under the current priorities.</EmptyNote>}
      </Section>
    );
  }
  const color = result.status === "ok" && result.score != null ? rankColor(rankPosition(result.rank,totalRanked??1)) ?? undefined : undefined;
  return (
    <>
      <Section
        title="Mission suitability"
        subtitle={<span>Relative suitability index, not a probability · spec {scoringSpecVersion ?? "—"}</span>}
        actions={isPending ? <Spinner label="Updating" /> : undefined}
      >
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="num text-3xl font-medium leading-none" style={{ color }}>
              {result.score != null ? formatNumber(result.score, { maxFractionDigits: 1 }) : "—"}
              <span className="ml-1 text-sm text-fg-faint">/ 100</span>
            </div>
            <div className="mt-1 text-[10.5px] uppercase tracking-wide text-fg-faint">relative suitability index</div>
          </div>
          <div className="text-right">
            <div className="num text-sm text-fg">
              {result.rank != null ? (
                <>
                  Rank {result.rank}
                  {totalRanked ? <span className="text-fg-faint"> of {totalRanked}</span> : null}
                </>
              ) : (
                "Unranked"
              )}
            </div>
            <Badge tone={result.status === "ok" ? "ok" : result.status === "ineligible" ? "danger" : "warn"} className="mt-1">
              {result.status.replace("_", " ")}
            </Badge>
          </div>
        </div>

        {result.eligibility.failed_constraints && result.eligibility.failed_constraints.length > 0 && (
          <div className="mt-3">
            <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-danger">Failed hard constraints</h3>
            <ul className="space-y-1 text-xs">
              {result.eligibility.failed_constraints.map((c) => (
                <li key={c.constraint_id} className="rounded border border-danger/40 bg-danger/10 px-2 py-1 text-danger">
                  <span className="text-fg">{c.feature_id.replace(/_/g, " ")}</span> {c.operator} <span className="num">{formatNumber(c.threshold)}</span>
                  {c.feature_value != null && (
                    <>
                      {" "}· value <span className="num">{formatNumber(c.feature_value)}</span>
                    </>
                  )}
                  {c.rationale && <div className="text-[11px] text-fg-muted">{c.rationale}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3 text-[11px] text-fg-muted">
          Criteria scored <span className="num text-fg">{result.completeness.criteria_supported}/{result.completeness.criteria_requested}</span> ({formatPercent(result.completeness.fraction)})
          {result.completeness.excluded_criteria && result.completeness.excluded_criteria.length > 0 && (
            <span> · excluded: {result.completeness.excluded_criteria.join(", ")}</span>
          )}
        </div>
      </Section>

      <Section title="Why this score?" subtitle="How each scored priority contributes to the total">
        <FactorBreakdownChart factors={result.factor_scores} />
      </Section>
      <details className="m-4 rounded-lg border border-line-strong"><summary className="cursor-pointer p-3 text-sm text-fg">Full scoring calculation</summary>
      <Section title="Factor breakdown" subtitle="Weighted contributions sum to the index">
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="text-[10px] uppercase tracking-wide text-fg-faint">
              <tr>
                <th className="py-1 pr-2 font-medium">Criterion</th>
                <th className="py-1 pr-2 font-medium">Value</th>
                <th className="num py-1 pr-2 text-right font-medium">Suit.</th>
                <th className="num py-1 pr-2 text-right font-medium">Weight</th>
                <th className="num py-1 text-right font-medium">Contrib.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {result.factor_scores.map((f) => (
                <tr key={f.criterion_id} className={f.is_missing || f.excluded_reason ? "text-fg-faint" : "text-fg"}>
                  <td className="py-1 pr-2">
                    {f.label}
                    {f.excluded_reason && <div className="text-[10px] text-fg-faint">excluded: {f.excluded_reason}</div>}
                  </td>
                  <td className="num py-1 pr-2">{f.is_missing || f.feature_value == null ? <span className="italic">No data</span> : formatValueWithUnit(f.feature_value, f.unit)}</td>
                  <td className="num py-1 pr-2 text-right">{f.suitability != null ? f.suitability.toFixed(2) : "—"}</td>
                  <td className="num py-1 pr-2 text-right">{f.normalized_weight != null ? f.normalized_weight.toFixed(2) : "—"}</td>
                  <td className="num py-1 text-right">{f.weighted_contribution != null ? f.weighted_contribution.toFixed(1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      </details>
      <Section title="Favorable">
        <BulletList items={result.favorable} tone="ok" empty="Nothing scored favourably under these priorities." />
      </Section>
    </>
  );
}
