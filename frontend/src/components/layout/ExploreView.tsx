import { imageryAssetUrl } from "@/components/imagery/assetUrl";
// Explore keeps imagery controls above the workspace and a single destination
// planet button inside it. Planet navigation preserves mission focus and selections.
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/services/api";
import { EmptyNote } from "@/components/ui/Section";
import { ErrorNote } from "@/components/ui/ErrorNote";
import type { RankChange } from "@/components/mission/AnalogPreferences";
import { effectiveMapMode, useAppStore, type Body } from "@/store/useAppStore";
import { ANALOG_FEATURES, BODY_NAME, otherBody, toAnalogShares } from "@/lib/analogFeatures";
import { PLANET_CONFIGS } from "@/components/globe/PlanetConfig";
import type { Site } from "@/types";
import { wantsDiscovery } from "@/features/discovery/lib/objective";
import { ExploreModeSwitch } from "@/features/discovery/components/ExploreModeSwitch";

/** What the imagery pane needs of a location, on either body. */
export type ImagerySubject = Pick<Site, "id" | "name" | "lat" | "lon_east">;

/** Everything the analog-mode toolbar shows about the current ranking. Built by App from the store and the rank response. */
export interface ExploreAnalogContext {
  referenceId: string | null;
  referenceName: string | null;
  /** Locations on the other body the reference can be changed to. */
  referenceOptions: Array<{ id: string; name: string }>;
  onReferenceChange: (id: string) => void;
  rankedCount: number | null;
  /** Features the ranking dropped pool-wide, by feature id -> reason. */
  unavailable: Record<string, string>;
  rankChanges: RankChange[] | null;
  previousShares: Record<string, number> | null;
  isPending?: boolean;
}

export interface ExploreViewProps {
  initialMissionId?: string;
  globe: ReactNode;
  /** The selected location on the visible body, for the imagery views. */
  site?: ImagerySubject;
  analog?: ExploreAnalogContext;
}

/** Short deterministic phrase naming the emphasised features, from the shares. */
export function emphasisPhrase(shares: Record<string, number> | null | undefined): string {
  const s = toAnalogShares(shares);
  const groups: Array<{ name: string; ids: string[] }> = [
    { name: "terrain", ids: ["slope_regional_median_deg", "roughness_regional_m"] },
    { name: "landforms", ids: ["terrain_morphology"] },
    { name: "materials", ids: ["mineralogy_tags"] },
    { name: "dryness", ids: ["precipitation_mm_day"] },
  ];
  const scored = groups.map((g) => ({ name: g.name, share: g.ids.reduce((a, id) => a + (s[id] ?? 0), 0) })).filter((g) => g.share > 0).sort((a, b) => b.share - a.share);
  // name every group carrying at least a fifth of the emphasis (always the leader), at most three
  const top = scored.filter((g, i) => i === 0 || g.share >= 20).slice(0, 3).map((g) => g.name);
  if (top.length === 0) return ANALOG_FEATURES[0].label.toLowerCase();
  return top.length === 1 ? top[0] : `${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}`;
}

export function matchContextLine(viewedBody: Body, referenceName: string | null, shares: Record<string, number> | null | undefined): string {
  return referenceName ? `${BODY_NAME[viewedBody]} matches to ${referenceName} · ${emphasisPhrase(shares)}` : `${BODY_NAME[viewedBody]} candidates · no reference on ${BODY_NAME[otherBody(viewedBody)]} selected yet`;
}

export function ExploreView({ globe, site, analog, initialMissionId }: ExploreViewProps) {
  const [view, setView] = useState<"globe" | "orbital" | "surface">("globe");
  const viewedBody = useAppStore((s) => s.viewedBody);
  const missionBody = useAppStore(s => s.selectionBody);
  const stage = useAppStore(s => s.exploreStage);
  const navigateExplore = useAppStore(s => s.navigateExplore);
  const mapMode = useAppStore(s => s.mapMode);
  const selectedMarsId = useAppStore(s => s.selectedMarsId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const selectedEarthId = useAppStore((s) => s.selectedEarthId);
  const effective = effectiveMapMode({ viewedBody, mapMode });
  const objectiveText = useAppStore((s) => (s.appliedObjective || s.missionObjective || "").trim());
  const openFindAnalogs = useAppStore((s) => s.openFindAnalogs);
  const discoveryCue = viewedBody === "earth" && effective === "analog_match";

  const destination = otherBody(viewedBody);
  const destinationLabel = destination === missionBody ? "Mission suitability" : "Analog match";
  const switchBody = (b: Body) => { setView("globe"); navigateExplore(b === missionBody ? "mission" : "analogs", initialMissionId); };

  return <div data-pane="explore" className="flex h-full min-h-0 flex-col">
    <nav aria-label="Explore views" className="shrink-0 border-b border-line bg-bg-elev px-3 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <ExploreModeSwitch className="shrink-0" />
      {stage !== "analogs" && <p className="min-w-[12rem] flex-1 text-xs leading-relaxed text-fg-muted" data-testid="explore-intro">{`Explore ${BODY_NAME[missionBody]} sites for your mission. Select a site to inspect it, then switch planets to find analogs on ${BODY_NAME[otherBody(missionBody)]}.`}</p>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Site imagery">{(["globe","orbital","surface"] as const).map(id => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={`rounded border px-2.5 py-1.5 text-xs ${view === id ? "border-copper text-copper-bright bg-copper/10" : "border-transparent text-fg-muted hover:text-fg"}`}>{id === "globe" ? "Globe" : id === "orbital" ? "Orbital view" : "Surface view"}</button>)}</div>
        {stage === "analogs" && <button type="button" onClick={() => setActiveTab("compare")} disabled={!selectedEarthId || !selectedMarsId} className="ml-auto rounded border border-copper/50 bg-copper/10 px-3 py-1.5 text-xs font-semibold text-copper-bright disabled:opacity-40">Compare selected pair →</button>}
      </div>
    </nav>
    {effective === "analog_match" ? <div className="shrink-0 border-b border-line px-3 py-2 text-xs" data-testid="analog-context">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-fg" aria-live="polite" data-testid="match-context-line">{analog?.referenceName ? `${BODY_NAME[viewedBody]} matches to ${analog.referenceName}` : "Choose the mission site you want to find analogs for."}</p>
        <details className="relative"><summary className="cursor-pointer text-fg-muted underline underline-offset-4">Change reference</summary><label className="mt-2 block text-fg-muted">{BODY_NAME[otherBody(viewedBody)]} site<select value={analog?.referenceId ?? ""} onChange={e => e.target.value && analog?.onReferenceChange(e.target.value)} aria-label={`Reference location on ${BODY_NAME[otherBody(viewedBody)]}`} className="ml-2 max-w-full rounded border border-line-strong bg-bg px-2 py-1 text-xs text-fg"><option value="" disabled>Choose a site</option>{analog?.referenceOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label></details>
      </div>
      {discoveryCue && <p className="mt-2 flex flex-wrap items-center gap-x-2 text-fg-muted" data-testid="discovery-cue"><span>These are the <strong className="font-medium text-fg">established analogs</strong> (curated sites).</span><button type="button" onClick={openFindAnalogs} className="text-info underline underline-offset-4">Find candidate Earth analogs beyond them →</button>{wantsDiscovery(objectiveText) && <span className="text-fg-faint">Your objective asks for new regions.</span>}</p>}
    </div> : null}

    <div className="relative min-h-0 flex-1"><div className="absolute right-3 top-3 z-10 rounded-lg border border-line/60 bg-bg/95 p-1.5" role="group" aria-label="Switch planet">
      <button type="button" aria-label={`View ${BODY_NAME[destination]}`} aria-describedby="planet-destination" title={`Switch to ${BODY_NAME[destination]} · ${destinationLabel}`} onClick={() => switchBody(destination)} className="flex min-w-[104px] flex-col items-center rounded-md px-2 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-elev-2 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-copper-bright">
        <span aria-hidden className="h-10 w-10 rounded-full border border-line-strong shadow-inner sm:h-12 sm:w-12" style={{backgroundImage: `radial-gradient(circle at 30% 25%, transparent 35%, rgba(0,0,0,.5) 95%), url(${PLANET_CONFIGS[destination].textureUrl})`, backgroundSize: "cover"}}/>
        <span className="mt-1 font-medium text-fg">{BODY_NAME[destination]} <span aria-hidden className="text-fg-muted">↗</span></span>
        <span id="planet-destination" className="mt-0.5 text-[10px] text-fg-muted">{destinationLabel}</span>
      </button>
    </div><div hidden={view !== "globe"} className="h-full">{view === "globe" && globe}</div><div hidden={view === "globe"} className="h-full">{site ? <SiteImages key={site.id} site={site} view={view === "surface" ? "surface" : "orbital"} enabled={view !== "globe"} /> : <div className="p-4"><EmptyNote>Select a candidate to see its imagery.</EmptyNote></div>}</div></div>
  </div>;
}

function SiteImages({site,view,enabled}: {site: ImagerySubject; view: "orbital" | "surface"; enabled: boolean}) {
  const q = useQuery({queryKey:["imagery",site.id],queryFn:()=>api.imagery(site.id),staleTime:Infinity,retry:1,enabled});
  const [choices,setChoices] = useState<Record<string,string>>({});
  const [zoom,setZoom] = useState(1);
  const [loaded,setLoaded] = useState<string | null>(null);
  const [failed,setFailed] = useState<string | null>(null);
  const [attempt,setAttempt] = useState(0);
  const entries = q.data?.entries.filter(e=>e.view === view) ?? [];
  const entry = entries.find(e=>e.entry_id === choices[view]) ?? entries[0];
  const index = entry ? entries.indexOf(entry) : -1;
  const go = (step: number) => { const next = entries[(index + step + entries.length) % entries.length]; if (!next) return; setChoices(c=>({...c,[view]:next.entry_id})); setZoom(1); setFailed(null); };
  if(q.isPending) return <div role="status" className="p-4 text-sm text-fg-muted">Loading site imagery…</div>;
  if(q.error) return <div className="p-4"><ErrorNote error={q.error} /><button className="mt-3 rounded border border-line p-3 text-sm" onClick={()=>void q.refetch()}>Retry imagery</button></div>;
  if(!entry) return <div className="p-4"><h2 className="mb-3 text-base font-semibold">{site.name}</h2><EmptyNote>No verified {view} imagery is available for this site.</EmptyNote>{q.data?.notes?.map(n=><p key={n} className="mt-3 text-sm text-fg-muted">{n}</p>)}</div>;
  const bounds=entry.bounds;
  const contains=bounds && site.lon_east>=bounds.west && site.lon_east<=bounds.east && site.lat>=bounds.south && site.lat<=bounds.north;
  return <section aria-label={`${view} imagery for ${site.name}`} className="scroll-thin h-full overflow-y-auto p-4">
    <h2 className="text-base font-semibold">{site.name}</h2>
    <p className="mt-3 text-sm text-fg" data-testid="site-image-title">{entry.title}{entries.length > 1 && <span className="num ml-2 text-xs text-fg-muted">{index + 1} of {entries.length}</span>}</p>
    <div className="my-3 flex flex-wrap items-center gap-2 text-xs">
      <button type="button" aria-label="Zoom image out" disabled={zoom<=1} onClick={()=>setZoom(z=>Math.max(1,z-.5))} className="rounded border border-line px-3 py-2 disabled:opacity-40">−</button>
      <span className="num">{Math.round(zoom*100)}%</span>
      <button type="button" aria-label="Zoom image in" disabled={zoom>=3} onClick={()=>setZoom(z=>Math.min(3,z+.5))} className="rounded border border-line px-3 py-2 disabled:opacity-40">+</button>
      <button type="button" onClick={()=>setZoom(1)} className="rounded border border-line px-3 py-2">Fit image</button>
    </div>
    {failed !== entry.entry_id && loaded !== entry.entry_id && <p role="status" className="mb-2 text-xs text-fg-muted">Loading image…</p>}
    <div className="relative">
    {failed === entry.entry_id ? <div role="alert" className="rounded-lg border border-line p-4 text-sm">Image could not be loaded.<button type="button" className="ml-3 text-info underline" onClick={()=>{setAttempt(n=>n+1);setFailed(null);}}>Retry image</button></div> : <div tabIndex={0} aria-label="Image area; arrow keys scroll" className="max-h-[52vh] overflow-auto rounded-lg border border-line bg-black">
      <div className="relative mx-auto" style={{width: entry.width_px && entry.height_px ? `min(${zoom*100}%, ${entry.width_px/entry.height_px*52*zoom}vh)` : `${zoom*100}%`}}>
        <img key={`${entry.entry_id}:${attempt}`} src={imageryAssetUrl(entry.entry_id,attempt)} alt={`${entry.title}. ${entry.relevance}`} className="block h-auto w-full" onLoad={()=>setLoaded(entry.entry_id)} onError={()=>setFailed(entry.entry_id)} />
        {contains && bounds && <span title="Candidate coordinate (not a landing ellipse)" aria-label="Candidate coordinate" className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-copper shadow" style={{left:`${(site.lon_east-bounds.west)/(bounds.east-bounds.west)*100}%`,top:`${(bounds.north-site.lat)/(bounds.north-bounds.south)*100}%`}} />}
      </div>
    </div>}
    {entries.length > 1 && <>
      <button type="button" onClick={()=>go(-1)} aria-label={`Previous ${view} image`} className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-line-strong bg-bg/85 p-2 text-fg shadow-lg backdrop-blur-sm hover:border-copper hover:text-copper-bright"><ChevronLeft className="h-5 w-5" aria-hidden /></button>
      <button type="button" onClick={()=>go(1)} aria-label={`Next ${view} image`} className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-line-strong bg-bg/85 p-2 text-fg shadow-lg backdrop-blur-sm hover:border-copper hover:text-copper-bright"><ChevronRight className="h-5 w-5" aria-hidden /></button>
    </>}
    </div>
    <p className="mt-3 text-sm text-fg">{entry.relevance}</p>
    <p className="mt-2 text-xs text-fg-muted">{entry.relationship.replace(/_/g," ")} · {entry.spatial_resolution_m_per_px ? `${entry.spatial_resolution_m_per_px} m/pixel` : "Resolution not verified"} · {entry.acquisition_date ? `Acquired ${entry.acquisition_date}` : "No single verified acquisition date"}</p>
    {contains && <p className="mt-1 text-xs text-fg-muted">The dot marks the candidate coordinate. It does not show the analysis footprint or a landing ellipse.</p>}
    <p className="mt-2 text-xs text-fg-muted">{entry.credit}</p>
    <a className="mt-2 inline-block text-sm text-info underline" href={entry.source_page_url} target="_blank" rel="noreferrer">Open original source ↗</a>
    <details className="mt-4 rounded-lg border border-line p-3 text-xs text-fg-muted"><summary className="cursor-pointer">Image coverage, processing and credits</summary><div className="mt-3 space-y-2">{[entry.coverage_evidence,entry.appearance_note,entry.resolution_note,entry.acquisition_note,entry.license].filter(Boolean).map((text,i)=><p key={i}>{text}</p>)}<p>Source: {entry.institution}. Verified {entry.verified_on}.</p></div></details>
  </section>;
}
