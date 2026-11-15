// Step 3 + 4: the planning workspace. Map in the centre, configuration on the
// left, metrics on the right (stacked on narrow screens). Calculate sends the
// current inputs to the service; the result is recorded as a run, revealed on
// the map and reflected in the metrics panel.
import { useCallback, useMemo, useState } from "react";
import { ChevronDown, FileText, Image as ImageIcon, Layers } from "lucide-react";
import { TerrainMap } from "./TerrainMap";
import { WaypointList } from "./WaypointList";
import { ConfigPanel } from "./ConfigPanel";
import { MetricsPanel } from "./MetricsPanel";
import { RouteWarnings } from "./RouteWarnings";
import { usePlanRoute } from "../hooks/usePlanRoute";
import { useExpeditionStore, useWorkspace, type RegionContext } from "../store/useExpeditionStore";
import { objectiveSpec } from "../lib/objectives";
import type { GeoPoint, PlanRequest, PlanResponse } from "../adapter/types";
import type { ServiceState } from "../hooks/useExpeditionCapabilities";
import type { BasemapState, TerrainState } from "../hooks/useTerrainContext";

export function Workspace({ context, start, service, terrain, basemaps, onOpenReport }: {
  context: RegionContext; start: GeoPoint; service: ServiceState; terrain: TerrainState; basemaps: BasemapState; onOpenReport: () => void;
}) {
  const w = useWorkspace();
  const store = useExpeditionStore();
  const [highlight, setHighlight] = useState<string | null>(null);
  const [stopsOpen, setStopsOpen] = useState(true);
  const basemap = basemaps.basemaps.find(b => b.entry.entry_id === w.basemapEntryId) ?? basemaps.basemaps[0] ?? null;
  const targets = terrain.kind === "ready" ? terrain.terrain.research_targets ?? [] : [];
  const regionNote = service.kind === "available" ? service.capabilities.regions.find(r => r.body === context.body && r.site_id === context.siteId) : undefined;
  const terrainAvailable = terrain.kind === "ready" ? terrain.terrain.dem.available : regionNote ? regionNote.terrain_available : true;
  const active = w.runs.find(r => r.run === w.activeRun) ?? null;

  const onPlan = useCallback((plan: PlanResponse, request: PlanRequest) => {
    store.recordRun(plan, { waypoints: (request.waypoints ?? []).length, targets: (request.target_ids ?? []).length, optimization: request.optimization, roverProfile: request.rover?.profile_id ?? null });
  }, [store]);
  const planner = usePlanRoute(onPlan);

  const blockers = useMemo(() => {
    const b: string[] = [];
    if (service.kind !== "available") b.push("the expedition service to be connected");
    if (!w.objective) b.push("a mission objective");
    if (!basemap) b.push("a georeferenced basemap for this region");
    if (w.waypoints.length === 0 && w.targetIds.length === 0) b.push("at least one waypoint or research target");
    if (service.kind === "available" && !w.rover) b.push("a rover profile");
    if (service.kind === "available" && !terrainAvailable) b.push(`routing terrain for this region (the service reports: ${terrain.kind === "ready" ? terrain.terrain.dem.note ?? "none installed" : regionNote?.note ?? "none installed"})`);
    return b;
  }, [service.kind, w.objective, basemap, w.waypoints.length, w.targetIds.length, w.rover, terrainAvailable, terrain, regionNote]);
  const canCalculate = blockers.length === 0 && planner.state.kind !== "running";

  const calculate = () => {
    if (!canCalculate || !w.objective || !w.rover) return;
    void planner.run({ body: context.body, site_id: context.siteId, objective: w.objective, start, waypoints: w.waypoints.map(({ lat, lon_east }) => ({ lat, lon_east })), target_ids: w.targetIds, user_targets: [], rover: { ...w.rover, profile_id: w.roverProfileId }, optimization: w.optimization });
  };

  const spec = objectiveSpec(w.objective);
  const stale = active && (active.inputs.waypoints !== w.waypoints.length || active.inputs.targets !== w.targetIds.length || active.inputs.optimization !== w.optimization);

  return (
    <div className="rise-in grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
      <aside className="scroll-thin order-2 rounded-xl border border-line-strong bg-bg-elev px-4 pt-3 xl:sticky xl:top-0 xl:order-1 xl:max-h-[calc(100dvh-120px)] xl:self-start xl:overflow-y-auto" aria-label="Mission configuration">
        <ConfigPanel workspace={w} service={service} terrain={terrain} onChange={store.update} onChooseObjective={id => store.update({ objective: id })} onToggleTarget={store.toggleTarget} onCalculate={calculate} onCancel={planner.cancel} running={planner.state.kind === "running"} canCalculate={canCalculate} blockers={blockers} />
      </aside>

      <section className="order-1 xl:order-2 min-w-0 space-y-3" aria-label="Expedition map">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="eyebrow">{spec?.label ?? "Mission objective not chosen"}</p>
            <p className="truncate text-sm text-fg-muted">{basemap ? basemap.entry.title : "No basemap"}{active ? ` · showing route ${active.run}` : ""}{stale ? " · inputs changed since" : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            {basemaps.basemaps.length > 1 && (
              <label className="flex items-center gap-1.5 text-xs text-fg-muted"><ImageIcon className="h-3.5 w-3.5" aria-hidden /><span className="sr-only">Basemap</span>
                <select value={basemap?.entry.entry_id ?? ""} onChange={e => store.update({ basemapEntryId: e.target.value })} aria-label="Basemap" className="rounded-lg border border-line-strong bg-bg px-2 py-1.5 text-xs text-fg">
                  {basemaps.basemaps.map(b => <option key={b.entry.entry_id} value={b.entry.entry_id}>{((b.entry.bounds.north - b.entry.bounds.south) * (context.body === "mars" ? 59.27 : 111.19)).toFixed(0)} km · {b.entry.instrument ?? b.entry.title}</option>)}
                </select>
              </label>
            )}
            {active && <button type="button" onClick={onOpenReport} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-xs text-fg hover:border-copper hover:text-copper-bright"><FileText className="h-3.5 w-3.5" aria-hidden />Mission report</button>}
          </div>
        </div>
        <TerrainMap
          basemap={basemap} body={context.body} start={start}
          waypoints={w.waypoints} selectedWaypointId={w.selectedWaypointId}
          targets={targets} selectedTargetIds={w.targetIds}
          route={active?.plan.route ?? null} snappedStops={active?.plan.stops ?? null} revealToken={active?.run ?? 0}
          tool={w.tool} onToolChange={tool => store.update({ tool })}
          planning={planner.state.kind === "running"}
          onAddWaypoint={store.addWaypoint} onMoveWaypoint={store.moveWaypoint} onSelectWaypoint={store.selectWaypoint} onRemoveWaypoint={store.removeWaypoint} onToggleTarget={store.toggleTarget}
          highlightedSegmentId={highlight}
          className="h-[52vh] min-h-[360px] xl:h-[560px]"
        />
        {basemaps.status === "loading" && <p className="text-xs text-fg-muted" role="status">Loading verified imagery for the basemap…</p>}
        {active && (
          <div role="status" data-testid="data-status" className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${active.plan.data_status === "unavailable" ? "border-danger/40 bg-danger/10 text-danger" : "border-warn/40 bg-warn/10 text-warn"}`}>
            <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span><span className="font-semibold">Terrain data {active.plan.data_status}.</span> <span className="text-fg">{active.plan.terrain.dem.note ?? (active.plan.data_status === "unavailable" ? "No routing terrain is installed for this region; no route was computed." : "Regional data only.")}{active.plan.terrain.dem.cell_height_m ? ` Grid cells are about ${(active.plan.terrain.dem.cell_height_m / 1000).toFixed(1)} km; stops snap to cell centres.` : ""}</span></span>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-line bg-bg-elev">
            <button type="button" onClick={() => setStopsOpen(o => !o)} aria-expanded={stopsOpen} className="flex w-full items-center justify-between px-3 py-2 text-left"><span className="eyebrow">Expedition stops · {w.waypoints.length}</span><ChevronDown className={`h-3.5 w-3.5 text-fg-muted transition-transform ${stopsOpen ? "rotate-180" : ""}`} aria-hidden /></button>
            {stopsOpen && <div className="px-3 pb-3"><WaypointList waypoints={w.waypoints} selectedId={w.selectedWaypointId} bounds={basemap?.entry.bounds ?? null} start={start} onSelect={store.selectWaypoint} onMove={store.moveWaypoint} onRemove={store.removeWaypoint} onReorder={store.reorderWaypoint} stops={active?.plan.stops ?? null} /></div>}
          </div>
          <div className="rounded-xl border border-line bg-bg-elev px-3 py-2">
            <p className="eyebrow mb-2">Route warnings · {active?.plan.warnings.length ?? 0}</p>
            {active ? (active.plan.warnings.length ? <RouteWarnings warnings={active.plan.warnings} onHighlight={setHighlight} /> : <p className="text-xs text-fg-muted">The service raised no warnings for this route.</p>) : <p className="text-xs text-fg-faint">Warnings and difficult terrain reported by the service appear here after a calculation.</p>}
          </div>
        </div>
      </section>

      <aside className="order-3 space-y-3" aria-label="Mission metrics">
        <MetricsPanel plan={active?.plan ?? null} planState={planner.state} targets={targets} runLabel={active ? `Route ${active.run} of ${w.runs.length} this session` : null} serviceConnected={service.kind === "available"} />
        {w.runs.length > 1 && (
          <div className="rounded-xl border border-line bg-bg-elev px-4 py-3 text-xs">
            <p className="eyebrow mb-2">Routes this session</p>
            <ol className="space-y-1">{w.runs.map(r => <li key={r.run}><button type="button" onClick={() => store.update({ activeRun: r.run })} aria-pressed={r.run === w.activeRun} className={`flex w-full items-center justify-between rounded border px-2 py-1.5 text-left ${r.run === w.activeRun ? "border-copper bg-copper/10 text-fg" : "border-line text-fg-muted hover:border-line-strong"}`}><span>Route {r.run} · {r.inputs.waypoints} stops</span><span className="num">{r.plan.metrics.total_distance_m != null ? `${(r.plan.metrics.total_distance_m / 1000).toFixed(1)} km` : "—"}</span></button></li>)}</ol>
            <button type="button" onClick={onOpenReport} className="mt-2 w-full rounded border border-info/50 bg-info/10 px-2 py-1.5 text-info">Compare routes in the report →</button>
          </div>
        )}
      </aside>
    </div>
  );
}
