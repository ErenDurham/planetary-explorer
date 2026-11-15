import { useState } from "react";
import { CandidateResearchPanel } from "@/features/discovery/components/CandidateResearchPanel";
import { useCandidateResearchTarget } from "@/features/discovery/store/useCandidateResearchTarget";
// Research prospects for the selected Mars site: the citation-backed digest,
// and from it the Expedition Planner (features/expedition), which opens in
// place with the same region, body and research context.
import { AtlasSurface } from "@/components/atlas/AtlasSurface";
import atlasStyles from "@/components/atlas/atlas.module.css";
import { ResearchAtlasCover } from "@/components/atlas/ResearchAtlasCover";
import { ExplanationPanel } from "@/components/intelligence/ExplanationPanel";
import { EmptyNote } from "@/components/ui/Section";
import { ExpeditionPlanner, PlanEntryCard, useExpeditionStore } from "@/features/expedition";
import type { MissionProfile, Site } from "@/types";

export function ResearchView({ sites, selectedId, onSelect, mission }: { sites: Site[] | undefined; selectedId: string | null; onSelect: (id: string) => void; mission: MissionProfile | null }) {
  const target = useCandidateResearchTarget(s => s.target);
  const [researchMode, setResearchMode] = useState<"mars" | "earth">(target ? "earth" : "mars");
  const site = sites?.find(s => s.id === selectedId);
  const plannerOpen = useExpeditionStore(s => s.open);
  const openPlanner = useExpeditionStore(s => s.openPlanner);
  const planning = plannerOpen && !!site && researchMode === "mars";
  const modeControls = <div role="group" aria-label="Research subject" className="flex flex-wrap gap-3"><button type="button" aria-pressed={researchMode === "mars"} className="rounded-lg border border-line-strong px-3 py-2 text-sm text-fg" onClick={() => setResearchMode("mars")}>Mars site research</button><button type="button" aria-pressed={researchMode === "earth"} className="rounded-lg border border-line-strong px-3 py-2 text-sm text-fg" onClick={() => setResearchMode("earth")}>Earth candidate research</button></div>;
  if (researchMode === "earth") return <div className="scroll-thin h-full overflow-y-auto"><div className="mx-auto max-w-7xl space-y-4 p-4"><h1 className="text-xl font-semibold text-fg">Research</h1>{modeControls}<CandidateResearchPanel /></div></div>;
  return <AtlasSurface enabled={!planning}>
    <div className="border-b border-line bg-bg-elev p-4">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="text-xl font-semibold text-fg">Research</h1><p className="mt-1 text-sm text-fg-muted">{planning ? "Plan an expedition for the selected site." : "See what a site could help us learn."}</p></div>
          <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-80"><label htmlFor="research-site" className="text-xs font-medium text-fg-muted">Mars site</label><select id="research-site" value={selectedId ?? ""} onChange={e => onSelect(e.target.value)} className="w-full min-w-0 rounded-lg border border-line-strong bg-bg px-3 py-2.5 text-sm text-fg" disabled={!sites?.length}><option value="" disabled>Select a site…</option>{sites?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        </div>
        <div className="mt-3">{modeControls}</div>
      </div>
    </div>
    {site && !planning && <ResearchAtlasCover key={site.id} site={site} />}
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      {!selectedId || !site ? <EmptyNote>Choose a Mars site above, or select a site in Explore. Its study ideas and evidence will appear here.</EmptyNote>
        : planning ? <ExpeditionPlanner key={site.id} region={{ body: "mars", id: site.id, name: site.name, region: site.region, description: site.description, lat: site.lat, lonEast: site.lon_east }} mission={mission} />
        : <>
          <div id="research-expedition-entry"><PlanEntryCard body="mars" siteId={site.id} siteName={site.name} onOpen={() => openPlanner({ body: "mars", siteId: site.id })} /></div>
          <div id="research-dossier-evidence" className={atlasStyles.researchNotes}><ExplanationPanel key={selectedId} siteId={selectedId} mission={mission} /></div>
        </>}
    </div>
  </AtlasSurface>;
}
