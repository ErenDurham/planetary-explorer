// The Expedition Planner shell, mounted inside the Research page for the
// selected region. Owns the stage stepper and the three data hooks; stages
// render below. The region and research context are whatever the Research
// page currently shows, so opening the planner never changes a selection.
import { useEffect } from "react";
import { ArrowLeft, Compass } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { MissionProfile } from "@/types";
import { useExpeditionStore, useWorkspace, type Stage } from "../store/useExpeditionStore";
import { useExpeditionCapabilities } from "../hooks/useExpeditionCapabilities";
import { useBasemaps, useTerrainContext } from "../hooks/useTerrainContext";
import type { ExpeditionBody } from "../adapter/types";
import { PlannerIntro } from "./PlannerIntro";
import { ObjectiveCards } from "./ObjectiveCards";
import { Workspace } from "./Workspace";
import { MissionReport } from "./MissionReport";
import { objectiveSpec } from "../lib/objectives";

export interface RegionInfo { body: ExpeditionBody; id: string; name: string; region: string; description: string; lat: number; lonEast: number }

const STAGES: Array<{ id: Stage; label: string }> = [
  { id: "intro", label: "Region" },
  { id: "objective", label: "Objective" },
  { id: "workspace", label: "Plan" },
  { id: "report", label: "Report" },
];

export function ExpeditionPlanner({ region, mission }: { region: RegionInfo; mission: MissionProfile | null }) {
  const stage = useExpeditionStore(s => s.stage);
  const setStage = useExpeditionStore(s => s.setStage);
  const setContext = useExpeditionStore(s => s.setContext);
  const closePlanner = useExpeditionStore(s => s.closePlanner);
  const chooseObjective = useExpeditionStore(s => s.chooseObjective);
  const context = useExpeditionStore(s => s.context);
  const w = useWorkspace();
  useEffect(() => { setContext({ body: region.body, siteId: region.id }); }, [region.body, region.id, setContext]);

  const service = useExpeditionCapabilities();
  const basemaps = useBasemaps(region.body, region.id);
  const terrain = useTerrainContext(region.body, region.id, service.kind === "available");
  const start = terrain.kind === "ready" ? terrain.terrain.start : { lat: region.lat, lon_east: region.lonEast };
  const basemap = basemaps.basemaps.find(b => b.entry.entry_id === w.basemapEntryId) ?? basemaps.basemaps[0] ?? null;
  const targets = terrain.kind === "ready" ? terrain.terrain.research_targets ?? [] : [];
  const ctx = context && context.siteId === region.id && context.body === region.body ? context : { body: region.body, siteId: region.id };
  const reachable = (s: Stage) => s === "intro" || s === "objective" || (s === "workspace" && !!w.objective) || (s === "report" && w.runs.length > 0);

  return (
    <section aria-label="Expedition Planner" className="space-y-6" data-testid="expedition-planner">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <button type="button" onClick={closePlanner} className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />Back to research prospects</button>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Compass className="h-5 w-5 text-copper-bright" aria-hidden />
            <h1 className="text-2xl font-semibold tracking-tight text-fg">Expedition Planner</h1>
            <Badge tone={region.body === "mars" ? "copper" : "info"}>{region.body === "mars" ? "Mars" : "Earth"}</Badge>
            {service.kind === "available" ? <Badge tone="ok">Service connected</Badge> : service.kind === "loading" ? <Badge tone="neutral">Connecting…</Badge> : <Badge tone="warn" title={service.kind === "unavailable" ? service.reason : "The service answered with an error"}>Service not connected</Badge>}
          </div>
          <p className="mt-1 text-sm text-fg-muted"><span className="font-semibold text-fg">{region.name}</span> · {region.region}{w.objective ? ` · ${objectiveSpec(w.objective)?.label}` : ""}</p>
        </div>
        <nav aria-label="Planning steps" className="flex items-center gap-1 rounded-full border border-line bg-bg-elev p-1">
          {STAGES.map((s, i) => { const on = stage === s.id; const ok = reachable(s.id); return (
            <button key={s.id} type="button" disabled={!ok} aria-current={on ? "step" : undefined} onClick={() => setStage(s.id)} className={`num flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${on ? "bg-copper/20 text-copper-bright" : "text-fg-muted hover:text-fg"}`}><span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${on ? "bg-copper-bright text-bg" : "bg-bg-elev-2"}`}>{i + 1}</span>{s.label}</button>
          ); })}
        </nav>
      </header>

      {stage === "intro" && <PlannerIntro region={region} mission={mission} service={service} terrain={terrain} basemaps={basemaps} onContinue={() => setStage("objective")} />}
      {stage === "objective" && <ObjectiveCards value={w.objective} onChoose={chooseObjective} />}
      {stage === "workspace" && <Workspace context={ctx} start={start} service={service} terrain={terrain} basemaps={basemaps} onOpenReport={() => setStage("report")} />}
      {stage === "report" && <MissionReport context={ctx} region={region} start={start} basemap={basemap} targets={targets} onBack={() => setStage("workspace")} />}
    </section>
  );
}
