// Mission metrics exactly as the service reported them. Before a plan exists
// the panel says so; it never shows a placeholder number. A new successful
// plan triggers a one-shot glow on the panel (disabled by reduced motion).
import { useEffect, useState } from "react";
import { CheckCircle2, Target } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyNote } from "@/components/ui/Section";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { METRIC_SPECS, formatMetric } from "../lib/session";
import { VERDICT_STYLE } from "../lib/risk";
import type { PlanResponse, ResearchTarget } from "../adapter/types";
import type { PlanState } from "../hooks/usePlanRoute";

export function MetricsPanel({ plan, planState, targets, runLabel, serviceConnected }: {
  plan: PlanResponse | null;
  planState: PlanState;
  targets: ResearchTarget[];
  runLabel: string | null;
  serviceConnected: boolean;
}) {
  const [glow, setGlow] = useState(false);
  useEffect(() => { if (plan) { setGlow(true); const t = setTimeout(() => setGlow(false), 1700); return () => clearTimeout(t); } }, [plan?.plan_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = (id: string) => targets.find(t => t.target_id === id)?.name ?? id;
  const reached = plan?.metrics.targets_reached ?? [];
  const unreached = plan?.metrics.targets_unreached ?? [];

  return (
    <div className={`rounded-xl border border-line-strong bg-bg-elev ${glow ? "settle-glow" : ""}`} data-testid="metrics-panel">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div><h3 className="eyebrow">Mission metrics</h3>{runLabel && <p className="mt-0.5 text-xs text-fg-muted">{runLabel}</p>}</div>
        {plan && <Badge tone={VERDICT_STYLE[plan.feasibility.verdict].tone}>{VERDICT_STYLE[plan.feasibility.verdict].label}</Badge>}
      </header>
      <div className="space-y-3 px-4 py-3 text-sm">
        {planState.kind === "running" && <p role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-copper-bright"><span className="h-2 w-2 animate-pulse rounded-full bg-copper-bright" aria-hidden />Waiting for the expedition service…</p>}
        {planState.kind === "rejected" && <div role="alert" className="rounded border border-warn/40 bg-warn/10 p-2.5 text-xs text-warn"><p className="font-semibold">The service rejected this request.</p><p className="mt-1">{planState.message}</p><p className="mt-1 text-[10.5px] opacity-80">code {planState.code}</p></div>}
        {planState.kind === "unavailable" && <div role="status" className="rounded border border-line-strong p-2.5 text-xs text-fg-muted">{planState.reason}</div>}
        {planState.kind === "error" && <ErrorNote error={planState.error} context="expedition/plan" />}

        {!plan && planState.kind !== "running" && (
          <EmptyNote>{serviceConnected ? "No route has been calculated yet. Place waypoints and choose Calculate route. Every value here will come from the service." : "Values appear once the expedition service is connected and a route is calculated."}</EmptyNote>
        )}

        {plan && (
          <>
            {planState.kind === "done" && <p className="flex items-center gap-1.5 text-xs text-ok" role="status"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Route computed · {plan.route.length} segment{plan.route.length === 1 ? "" : "s"}</p>}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              {METRIC_SPECS.map(m => (
                <div key={m.key} className="min-w-0">
                  <dt className="text-[10.5px] uppercase tracking-wide text-fg-faint">{m.label}</dt>
                  <dd className={`num mt-0.5 ${plan.metrics[m.key] == null ? "text-fg-faint" : "text-fg"} ${m.key === "total_distance_m" || m.key === "energy_wh" ? "text-lg" : "text-sm"}`}>{formatMetric(plan.metrics[m.key], m)}</dd>
                </div>
              ))}
            </dl>
            <div className="rounded-lg border border-line p-2.5">
              <p className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-fg-faint"><Target className="h-3 w-3" aria-hidden />Research targets</p>
              <p className="mt-0.5 text-[10.5px] text-fg-faint">"Reached" means the route entered the target's grid cell. It does not mean a sample was collected.</p>
              <p className="num mt-1 text-sm text-fg">{reached.length} reached{unreached.length ? ` · ${unreached.length} not reached` : ""}</p>
              {reached.length > 0 && <ul className="mt-1 flex flex-wrap gap-1">{reached.map(id => <li key={id}><Badge tone="info">{name(id)}</Badge></li>)}</ul>}
              {unreached.length > 0 && <ul className="mt-1 flex flex-wrap gap-1">{unreached.map(id => <li key={id}><Badge tone="warn">{name(id)} · not reached</Badge></li>)}</ul>}
            </div>
            <div className="rounded-lg border border-line p-2.5">
              <p className="text-[10.5px] uppercase tracking-wide text-fg-faint">Feasibility assessment</p>
              <p className="mt-1 text-sm text-fg">{plan.feasibility.summary}</p>
              {plan.feasibility.reasons.length > 0 && <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-fg-muted">{plan.feasibility.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
            </div>
            <p className="text-[10.5px] text-fg-faint">Engine {plan.engine_version} · computed {new Date(plan.computed_at).toLocaleTimeString()}</p>
          </>
        )}
      </div>
    </div>
  );
}
