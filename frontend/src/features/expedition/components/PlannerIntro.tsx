// Step 1: what the user is about to plan, for which region, with what data.
// Research opportunities come from the site's cached research digest (the same
// query the Research page runs); terrain availability lists the regional
// statistics the profile already carries, the georeferenced basemaps, and what
// the expedition service says it can route on. Nothing is estimated here.
import { ArrowRight, Layers, Mountain, Satellite, Server } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useSiteProfile } from "@/hooks/useSites";
import { useExplanation } from "@/hooks/useExplanation";
import { useAppStore } from "@/store/useAppStore";
import { formatValueWithUnit } from "@/lib/format";
import type { MissionProfile } from "@/types";
import { useEffect } from "react";
import type { RegionInfo } from "./ExpeditionPlanner";
import type { ServiceState } from "../hooks/useExpeditionCapabilities";
import type { BasemapState, TerrainState } from "../hooks/useTerrainContext";

const TERRAIN_FEATURES = ["elevation_median_m", "slope_regional_median_deg", "slope_regional_p90_deg", "roughness_regional_m"];

export function PlannerIntro({ region, mission, service, terrain, basemaps, onContinue }: {
  region: RegionInfo; mission: MissionProfile | null; service: ServiceState; terrain: TerrainState; basemaps: BasemapState; onContinue: () => void;
}) {
  const objective = useAppStore(s => (s.appliedObjective || s.missionObjective || "").trim());
  const profile = useSiteProfile(region.body === "mars" ? region.id : null);
  const digest = useExplanation(region.body === "mars" ? region.id : null, mission, objective);
  useEffect(() => { if (region.body === "mars" && !digest.data && !digest.isFetching && digest.fetchStatus === "idle" && !digest.error) void digest.refetch(); }, [region.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const measurements = (profile.data?.profile.measurements ?? []).filter(m => TERRAIN_FEATURES.includes(m.feature_id) && typeof m.value === "number");
  const studies = digest.data?.research_studies ?? [];
  const mola = profile.data?.profile.sources ? Object.values(profile.data.profile.sources as Record<string, { spatial_resolution?: string | null; title?: string }>).find(s => /MOLA|Copernicus/i.test(s.title ?? "")) : undefined;

  return (
    <div className="rise-in grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <div>
          <p className="eyebrow">The planning challenge</p>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-fg">
            A rover expedition across {region.name} has to reach the places worth studying. It must avoid terrain the rover cannot handle, and it must stay within the energy it carries. You will choose an objective, place stops on a georeferenced orbital map and set the rover's limits. The shared expedition service then calculates the route, its slopes, its energy cost and whether the plan is feasible. Every value you see comes from the service and its terrain data. The map only shows where you asked to go.
          </p>
        </div>
        <section aria-labelledby="intro-research">
          <h3 id="intro-research" className="eyebrow mb-2 flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" aria-hidden />Relevant research opportunities</h3>
          {region.body !== "mars" ? <p className="text-xs text-fg-muted">Research digests are only made for Mars sites.</p>
            : digest.isFetching && !digest.data ? <p className="text-xs text-fg-muted" role="status">Loading the research digest for {region.name}…</p>
            : studies.length === 0 ? <p className="text-xs text-fg-muted">{digest.data?.evidence_gap ?? "The evidence found does not suggest a study for this site. You can still plan objectives from the terrain alone."}</p>
            : <ul className="grid gap-2 sm:grid-cols-2">{studies.slice(0, 4).map((s, i) => <li key={i} className="rounded-lg border border-line bg-bg-elev p-3"><p className="text-xs font-semibold text-fg">{s.title}</p><p className="mt-1 line-clamp-3 text-[11px] leading-snug text-fg-muted">{s.research_question}</p><Badge tone={s.kind === "proposed_study" ? "info" : "ok"} className="mt-2">{s.kind === "proposed_study" ? "Proposed · not performed" : "Documented campaign"}</Badge></li>)}</ul>}
        </section>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" onClick={onContinue} className="inline-flex items-center gap-2 rounded-lg border border-copper bg-copper px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-copper-bright hover:text-bg">Choose a mission objective <ArrowRight className="h-4 w-4" aria-hidden /></button>
          <p className="text-xs text-fg-muted">Your selected region and research context carry over.</p>
        </div>
      </div>

      <aside className="space-y-3" aria-label="Terrain data availability">
        <h3 className="eyebrow flex items-center gap-1.5"><Mountain className="h-3.5 w-3.5" aria-hidden />Terrain-data availability</h3>
        <dl className="divide-y divide-line rounded-xl border border-line bg-bg-elev text-xs">
          <Row icon={<Satellite className="h-3.5 w-3.5" aria-hidden />} label="Georeferenced basemaps">
            {basemaps.status === "loading" ? "Checking imagery…" : basemaps.status === "ready" ? <>{basemaps.basemaps.length} verified orbital mosaic{basemaps.basemaps.length === 1 ? "" : "s"} with tile-grid extents · {basemaps.basemaps.map(b => `${((b.entry.bounds.north - b.entry.bounds.south) * (region.body === "mars" ? 59.27 : 111.19)).toFixed(0)} km`).join(", ")} across</> : basemaps.status === "error" ? <span className="text-danger">The image list could not be read.</span> : <span className="text-warn">None available. The planner cannot place waypoints for this region.</span>}
          </Row>
          <Row icon={<Mountain className="h-3.5 w-3.5" aria-hidden />} label="Regional terrain statistics">
            {profile.isPending ? "Loading profile…" : measurements.length ? <ul className="space-y-0.5">{measurements.map(m => <li key={m.feature_id} className="flex justify-between gap-2"><span className="text-fg-muted">{m.label}</span><span className="num text-fg">{formatValueWithUnit(m.value as number, m.unit)}</span></li>)}</ul> : "No terrain statistics in the profile."}
            {mola?.spatial_resolution && <p className="mt-1 text-[10.5px] text-fg-faint">{mola.spatial_resolution}. These values describe the region. They do not describe the metre-scale terrain a rover drives on.</p>}
          </Row>
          <Row icon={<Server className="h-3.5 w-3.5" aria-hidden />} label="Routing terrain (expedition service)">
            {service.kind === "loading" ? "Connecting…" : service.kind === "unavailable" ? <span className="text-warn">Not connected. {service.reason} You can place waypoints, but route values will not be available.</span> : service.kind === "error" ? <span className="text-danger">The service answered with an error. <button type="button" className="underline" onClick={service.retry}>Retry</button></span>
              : terrain.kind === "ready" ? <>{terrain.terrain.dem.available ? <span className="text-ok">Elevation data available{terrain.terrain.dem.dataset ? `: ${terrain.terrain.dem.dataset.name}${terrain.terrain.dem.dataset.resolution_m ? ` (~${Math.round(terrain.terrain.dem.dataset.resolution_m)} m cells)` : ""}` : ""}</span> : <span className="text-warn">The service reports no elevation data for this region.</span>}{terrain.terrain.dem.note && <p className="mt-1 text-[10.5px] text-fg-faint">{terrain.terrain.dem.note}</p>}<p className="mt-1 text-fg-muted">{(terrain.terrain.research_targets ?? []).length} research target{(terrain.terrain.research_targets ?? []).length === 1 ? "" : "s"} with coordinates · engine {service.capabilities.engine_version}</p></>
              : terrain.kind === "loading" ? "Reading the region's terrain context…" : terrain.kind === "error" ? <span className="text-danger">Terrain context failed to load.</span> : <span className="text-warn">{terrain.reason}</span>}
          </Row>
        </dl>
      </aside>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return <div className="px-3 py-2.5"><dt className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-fg-faint">{icon}{label}</dt><dd className="mt-1 leading-relaxed text-fg">{children}</dd></div>;
}
