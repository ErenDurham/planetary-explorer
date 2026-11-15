// Step 5: the mission summary. Everything scientific on this page is quoted
// from the service's PlanResponse: metrics, feasibility, interpretation (with
// its provenance badge), assumptions, limitations and dataset attribution. The
// comparison table sets two runs' service numbers side by side.
import { ArrowLeft, Cpu, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { BulletList } from "@/components/ui/Section";
import { TerrainMap } from "./TerrainMap";
import { MetricsPanel } from "./MetricsPanel";
import { useExpeditionStore, useWorkspace, type RegionContext } from "../store/useExpeditionStore";
import { objectiveSpec, OPTIMIZATION_LABEL } from "../lib/objectives";
import { METRIC_SPECS, formatMetric, metricDelta, signed } from "../lib/session";
import { VERDICT_STYLE } from "../lib/risk";
import type { GeoPoint, ResearchTarget } from "../adapter/types";
import type { Basemap } from "../hooks/useTerrainContext";
import type { RegionInfo } from "./ExpeditionPlanner";

export function MissionReport({ context, region, start, basemap, targets, onBack }: { context: RegionContext; region: RegionInfo; start: GeoPoint; basemap: Basemap | null; targets: ResearchTarget[]; onBack: () => void }) {
  const w = useWorkspace();
  const update = useExpeditionStore(s => s.update);
  const active = w.runs.find(r => r.run === w.activeRun) ?? w.runs[w.runs.length - 1];
  const other = w.runs.find(r => r.run === w.compareRun && r.run !== active?.run) ?? null;
  if (!active) {
    return <div className="rise-in space-y-3"><p className="text-sm text-fg-muted">No route has been calculated for this region yet.</p><button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-sm text-fg"><ArrowLeft className="h-4 w-4" aria-hidden />Return to planning</button></div>;
  }
  const plan = active.plan; const spec = objectiveSpec(plan.objective);
  const name = (id: string) => targets.find(t => t.target_id === id)?.name ?? id;
  const interp = plan.interpretation;
  const generatedBy: string = interp?.generated_by ?? "rule_based";
  const reached = plan.metrics.targets_reached ?? [];
  const unreached = plan.metrics.targets_unreached ?? [];
  const visited = plan.visited_targets ?? [];
  const fmtOffset = (m: number | null | undefined) => m == null ? "—" : m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;

  return (
    <div className="rise-in space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Mission report · route {active.run} of {w.runs.length}</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-fg">{spec?.label ?? plan.objective} at {region.name}</h2>
          <p className="mt-1 text-sm text-fg-muted">{region.body === "mars" ? "Mars" : "Earth"} · {OPTIMIZATION_LABEL[active.inputs.optimization as keyof typeof OPTIMIZATION_LABEL]?.label ?? active.inputs.optimization} · {active.inputs.waypoints} stops · computed {new Date(plan.computed_at).toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={VERDICT_STYLE[plan.feasibility.verdict].tone}>{VERDICT_STYLE[plan.feasibility.verdict].label}</Badge>
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-lg border border-copper px-3 py-2 text-sm text-copper-bright hover:bg-copper/10"><ArrowLeft className="h-4 w-4" aria-hidden />Return to planning</button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <TerrainMap basemap={basemap} body={context.body} start={start} waypoints={w.waypoints} selectedWaypointId={null} targets={targets} selectedTargetIds={w.targetIds} route={plan.route} snappedStops={plan.stops} revealToken={active.run} tool="pan" readOnly className="h-[48vh] min-h-[340px]" />
        <MetricsPanel plan={plan} planState={{ kind: "idle" }} targets={targets} runLabel={null} serviceConnected />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line-strong bg-bg-elev p-4" aria-labelledby="rep-interp">
          <div className="flex items-center justify-between gap-2"><h3 id="rep-interp" className="eyebrow">Scientific interpretation</h3>{interp && (generatedBy === "llm" ? <Badge tone="copper" title={interp.model ?? undefined}><Sparkles className="h-3 w-3" aria-hidden />Language model{interp.model ? ` · ${interp.model}` : ""}</Badge> : <Badge tone="neutral"><Cpu className="h-3 w-3" aria-hidden />{generatedBy === "rule_based" ? "Rule based" : "Deterministic fallback"}</Badge>)}</div>
          {interp ? <p className="mt-2 text-sm leading-relaxed text-fg">{interp.text}</p> : <p className="mt-2 text-sm text-fg-muted">The service returned no interpretation for this route.</p>}
          <h4 className="eyebrow mt-4">Research targets visited</h4>
          {visited.length ? <ul className="mt-1.5 flex flex-wrap gap-1.5">{visited.map(t => <li key={t.target_id}><Badge tone={t.visited ? "info" : "warn"}>{t.name} · {t.visited ? "reached" : "not reached"} · {t.coordinate_status === "verified" ? "verified coordinate" : "user-defined hypothesis"}</Badge></li>)}</ul>
            : reached.length ? <ul className="mt-1.5 flex flex-wrap gap-1.5">{reached.map(id => <li key={id}><Badge tone="info">{name(id)}</Badge></li>)}</ul> : <p className="mt-1 text-xs text-fg-muted">No research targets were part of this route.</p>}
          {!visited.length && unreached.length > 0 && <p className="mt-1.5 text-xs text-warn">Not reached: {unreached.map(name).join(", ")}</p>}
          <p className="mt-1.5 text-[10.5px] text-fg-faint">Reached means the route entered the target's grid cell; it does not mean a sample was collected.</p>
          <h4 className="eyebrow mt-4">Requested and snapped stops</h4>
          <div className="mt-1.5 overflow-x-auto"><table className="w-full text-left text-[11px]"><thead className="text-fg-muted"><tr><th className="py-1 pr-2 font-medium">Stop</th><th className="py-1 pr-2 font-medium">Requested</th><th className="py-1 pr-2 font-medium">Snapped to</th><th className="py-1 pr-2 font-medium">Offset</th><th className="py-1 font-medium">Visited</th></tr></thead><tbody className="divide-y divide-line">{plan.stops.map(s => <tr key={s.stop_id}><td className="py-1 pr-2 text-fg">{s.stop_id}</td><td className="num py-1 pr-2 text-fg-muted">{s.requested.lat.toFixed(4)}, {s.requested.lon_east.toFixed(4)}</td><td className="num py-1 pr-2 text-fg-muted">{s.snapped ? `${s.snapped.lat.toFixed(4)}, ${s.snapped.lon_east.toFixed(4)}` : "outside the grid"}</td><td className="num py-1 pr-2 text-fg-muted">{fmtOffset(s.offset_m)}</td><td className="py-1">{s.visited ? "yes" : "no"}</td></tr>)}</tbody></table></div>
          <p className="mt-1.5 text-[10.5px] text-fg-faint">Terrain data {plan.data_status}: {plan.terrain.dem.note ?? "see limitations"}</p>
        </section>
        <section className="rounded-xl border border-line-strong bg-bg-elev p-4" aria-labelledby="rep-limits">
          <h3 id="rep-limits" className="eyebrow">Assumptions and limitations</h3>
          <h4 className="mt-2 text-xs font-semibold text-fg">Assumptions</h4>
          <div className="mt-1"><BulletList items={plan.assumptions} empty="The service listed no assumptions." /></div>
          <h4 className="mt-3 text-xs font-semibold text-fg">Limitations</h4>
          <div className="mt-1"><BulletList items={plan.limitations} tone="warn" empty="The service listed no limitations." /></div>
          {plan.warnings.length > 0 && <><h4 className="mt-3 text-xs font-semibold text-fg">Warnings</h4><div className="mt-1"><BulletList items={plan.warnings.map(x => x.message)} tone="warn" /></div></>}
        </section>
      </div>

      <section className="rounded-xl border border-line-strong bg-bg-elev p-4" aria-labelledby="rep-data">
        <h3 id="rep-data" className="eyebrow">Dataset attribution</h3>
        <ul className="mt-2 grid gap-2 md:grid-cols-2 text-xs">
          {basemap && <li className="rounded-lg border border-line p-2.5"><p className="font-semibold text-fg">Basemap · {basemap.entry.title}</p><p className="mt-0.5 text-fg-muted">{basemap.entry.credit} · {basemap.entry.license}{basemap.entry.instrument ? ` · ${basemap.entry.instrument}` : ""}</p><p className="mt-0.5 text-fg-faint">Extent: {basemap.entry.bounds.source}</p>{basemap.entry.source_page_url && <a href={basemap.entry.source_page_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-copper-bright underline">Source page</a>}</li>}
          {plan.datasets.map((d, i) => <li key={i} className="rounded-lg border border-line p-2.5"><p className="font-semibold text-fg">{d.name}</p><p className="mt-0.5 text-fg-muted">{d.source}{d.resolution_m != null ? ` · ~${Math.round(d.resolution_m)} m` : ""}{d.license ? ` · ${d.license}` : ""}</p>{d.note && <p className="mt-0.5 text-fg-faint">{d.note}</p>}{d.url && <a href={d.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-copper-bright underline">Dataset</a>}</li>)}
          {plan.datasets.length === 0 && <li className="text-fg-muted">The service listed no datasets for this computation.</li>}
        </ul>
        <p className="mt-2 text-[10.5px] text-fg-faint">Engine {plan.engine_version} · plan {plan.plan_id}</p>
      </section>

      {w.runs.length > 1 && (
        <section className="rounded-xl border border-line-strong bg-bg-elev p-4" aria-labelledby="rep-compare">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="rep-compare" className="eyebrow">Compare revised routes</h3>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="text-fg-muted">This report<select value={active.run} onChange={e => update({ activeRun: Number(e.target.value) })} aria-label="Route shown in this report" className="ml-1.5 rounded border border-line-strong bg-bg px-2 py-1 text-fg">{w.runs.map(r => <option key={r.run} value={r.run}>Route {r.run}</option>)}</select></label>
              <label className="text-fg-muted">Compare with<select value={other?.run ?? ""} onChange={e => update({ compareRun: e.target.value ? Number(e.target.value) : null })} aria-label="Route to compare against" className="ml-1.5 rounded border border-line-strong bg-bg px-2 py-1 text-fg"><option value="">None</option>{w.runs.filter(r => r.run !== active.run).map(r => <option key={r.run} value={r.run}>Route {r.run}</option>)}</select></label>
            </div>
          </div>
          {other ? (
            <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-fg-muted"><tr><th className="p-2 font-medium">Metric</th><th className="p-2 font-medium">Route {active.run}</th><th className="p-2 font-medium">Route {other.run}</th><th className="p-2 font-medium">Difference</th></tr></thead><tbody className="divide-y divide-line">
              <tr><td className="p-2 text-fg-muted">Inputs</td><td className="p-2">{active.inputs.waypoints} stops · {active.inputs.targets} targets · {OPTIMIZATION_LABEL[active.inputs.optimization as keyof typeof OPTIMIZATION_LABEL]?.label ?? active.inputs.optimization}</td><td className="p-2">{other.inputs.waypoints} stops · {other.inputs.targets} targets · {OPTIMIZATION_LABEL[other.inputs.optimization as keyof typeof OPTIMIZATION_LABEL]?.label ?? other.inputs.optimization}</td><td className="p-2 text-fg-muted">—</td></tr>
              {METRIC_SPECS.map(m => { const a = active.plan.metrics[m.key], b = other.plan.metrics[m.key]; const d = metricDelta(a, b); const tone = d == null || d === 0 || m.lowerIsBetter == null ? "text-fg-muted" : (d < 0) === m.lowerIsBetter ? "text-ok" : "text-warn"; return <tr key={m.key}><td className="p-2 text-fg-muted">{m.label}</td><td className="num p-2 text-fg">{formatMetric(a, m)}</td><td className="num p-2 text-fg">{formatMetric(b, m)}</td><td className={`num p-2 ${tone}`}>{d == null ? "—" : d === 0 ? "±0" : `${d > 0 ? "+" : "−"}${formatMetric(Math.abs(d), m)}`}</td></tr>; })}
              <tr><td className="p-2 text-fg-muted">Feasibility</td><td className="p-2">{VERDICT_STYLE[active.plan.feasibility.verdict].label}</td><td className="p-2">{VERDICT_STYLE[other.plan.feasibility.verdict].label}</td><td className="p-2 text-fg-muted">—</td></tr>
              <tr><td className="p-2 text-fg-muted">Targets reached</td><td className="num p-2">{(active.plan.metrics.targets_reached ?? []).length}</td><td className="num p-2">{(other.plan.metrics.targets_reached ?? []).length}</td><td className="num p-2 text-fg-muted">{signed((active.plan.metrics.targets_reached ?? []).length - (other.plan.metrics.targets_reached ?? []).length, 0)}</td></tr>
            </tbody></table><p className="mt-2 text-[10.5px] text-fg-faint">Differences are between two service results and carry no uncertainty of their own.</p></div>
          ) : <p className="mt-2 text-xs text-fg-muted">Choose another route from this session to set its service metrics beside this one.</p>}
        </section>
      )}
    </div>
  );
}
