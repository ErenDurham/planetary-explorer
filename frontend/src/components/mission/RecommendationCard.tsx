// The recommendation card beside the sliders: what the applied objective
// suggested, whether the current shares still match it, an immediate
// deterministic reading of the last slider move, and - once the backend
// guidance settles - the ranking deltas the scoring engine reports. Nothing
// in here invents a ranking change: only what GuidanceResponse returns is
// rendered. Landing priorities only; analog weights never reach this card.
import { Loader2, Sparkles, Cpu, Target } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useAppStore } from "@/store/useAppStore";
import { usePriorityGuidance } from "@/hooks/usePriorityGuidance";
import { shareDeltas, sharesEqual } from "@/lib/allocation";
import { factorName } from "@/lib/objective";
import type { CriterionSpec, GuidanceResponse } from "@/types";

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function RecommendationCard({ criteria }: { criteria: CriterionSpec[] }) {
  const weights = useAppStore((s) => s.weights);
  const recommended = useAppStore((s) => s.recommendedWeights);
  const appliedObjective = useAppStore((s) => s.appliedObjective);
  const missionObjective = useAppStore((s) => s.missionObjective);
  const priorityChange = useAppStore((s) => s.priorityChange);
  const setWeights = useAppStore((s) => s.setWeights);
  const guidance = usePriorityGuidance({
    weights,
    objective: appliedObjective || missionObjective,
    changedCriterionId: priorityChange?.criterionId ?? null,
    enabled: priorityChange !== null,
  });
  const label = (id: string) => factorName(id, criteria.find((c) => c.criterion_id === id)?.label);
  const hasSuggestion = Object.keys(recommended).length > 0;
  const matches = hasSuggestion && sharesEqual(weights, recommended);
  const customised = hasSuggestion && !matches ? shareDeltas(weights, recommended) : [];
  const moved = priorityChange ? shareDeltas(weights, priorityChange.previous) : [];
  const gained = moved.filter((d) => d.delta > 0);
  const lost = moved.filter((d) => d.delta < 0);
  const changedName = priorityChange ? label(priorityChange.criterionId) : null;

  return (
    <section aria-label="Recommendation" className="flex h-full min-w-0 flex-col gap-2 px-4 py-3 text-xs" data-testid="recommendation-card">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Recommendation</h2>
          <p className="mt-0.5 truncate text-fg-faint" title={appliedObjective || undefined}>{appliedObjective ? `For: ${appliedObjective}` : "No objective applied yet."}</p>
        </div>
        {hasSuggestion && !matches && (
          <button type="button" onClick={() => setWeights({ ...recommended })} className="inline-flex shrink-0 items-center gap-1 rounded border border-info px-2 py-1 text-[11px] text-info hover:bg-info/10" aria-label="Restore the applied objective's suggested shares">
            <Target className="h-3 w-3" aria-hidden /> Restore suggestion
          </button>
        )}
      </header>

      <div role="status" aria-live="polite" className="flex min-w-0 flex-col gap-2">
        {hasSuggestion && (
          <p className={`rounded border px-2 py-1 ${matches ? "border-ok/40 bg-ok/10 text-ok" : "border-info/40 bg-info/10 text-info"}`} data-testid="suggestion-match">
            {matches ? "Matches your objective's suggestion." : `Customised: ${customised.map((d) => `${label(d.id)} ${signed(d.delta)}`).join(", ")} vs suggestion.`}
          </p>
        )}

        {priorityChange ? (
          <div data-testid="last-change">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-fg">Last change</span>
              <Badge tone="neutral"><Cpu className="h-3 w-3" aria-hidden /> Rule-based reading</Badge>
            </div>
            {moved.length === 0 ? (
              <p className="text-fg-muted">{changedName} is back where it started; nothing else moved.</p>
            ) : (
              <p className="text-fg">
                {gained.length > 0 && <>{gained.map((d) => `${label(d.id)} gained ${d.delta} (now ${Math.round(weights[d.id] ?? 0)}%)`).join("; ")}. </>}
                {lost.length > 0 && <span className="text-fg-muted">{lost.map((d) => `${label(d.id)} ${d.delta}`).join(", ")}.</span>}
              </p>
            )}
          </div>
        ) : (
          <p className="text-fg-faint">Move a slider to see which factors gain and lose, then how the ranking responds.</p>
        )}

        <ObjectiveGuidance data={guidance.data} isPending={guidance.isPending} error={guidance.error} />
      </div>
    </section>
  );
}

/** The backend's objective-aware reading of the settled slider position. The
 * numbers in it come from the scoring engine; only the phrasing may be a
 * model's, and the badge says which. */
function ObjectiveGuidance({ data, isPending, error }: { data: GuidanceResponse | null; isPending: boolean; error: Error | null }) {
  if (!data && !isPending && !error) return null;
  return (
    <div className="border-t border-line pt-2" data-testid="objective-guidance">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className="font-semibold text-fg">Ranking response</span>
        {isPending && <span className="inline-flex items-center gap-1 text-fg-muted"><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> checking against your objective…</span>}
        {data && !isPending && (data.generated_by === "llm"
          ? <Badge tone="copper" title={data.model ?? undefined}><Sparkles className="h-3 w-3" aria-hidden /> Phrased by language model{data.model ? ` · ${data.model}` : ""}</Badge>
          : <Badge tone="neutral"><Cpu className="h-3 w-3" aria-hidden /> Rule-based guidance</Badge>)}
        {data?.cached && !isPending && <Badge tone="neutral">cached</Badge>}
      </div>
      {error && !isPending && <p className="text-warn">Guidance unavailable - rule-based reading shown.</p>}
      {data && !isPending && (
        <>
          <p className="text-fg">{data.summary}</p>
          {(data.de_emphasised ?? []).length > 0 && <p className="mt-1 text-fg-muted">De-emphasised: {data.de_emphasised!.map((n) => factorName(n, n)).join(", ")}</p>}
          <p className="mt-1 text-fg-muted">{data.leader_changed ? `Leader changed: ${leaderChange(data)}` : `Leader unchanged${data.leader ? `: ${data.leader}` : ""}`}</p>
          {(data.rank_changes ?? []).length > 0 ? (
            <ul className="mt-1 flex flex-wrap gap-1" aria-label="Rank changes">
              {data.rank_changes!.map((r) => <li key={r.site_id} className="num rounded border border-line-strong px-1.5 py-0.5 text-[11px] text-fg-muted">{r.site_name} {r.previous_rank ?? "—"}→{r.new_rank ?? "—"}</li>)}
            </ul>
          ) : (
            <p className="mt-1 text-fg-faint">No site changed rank.</p>
          )}
          {(data.missing_data_notes ?? []).length > 0 && <ul className="mt-1 space-y-0.5 text-[11px] text-warn">{data.missing_data_notes!.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </>
      )}
    </div>
  );
}

function leaderChange(d: GuidanceResponse): string {
  const prev = d.rank_changes?.find((r) => r.previous_rank === 1)?.site_name;
  const next = d.leader ?? d.rank_changes?.find((r) => r.new_rank === 1)?.site_name;
  return prev && next ? `${prev} → ${next}` : next ?? "see rank changes";
}
