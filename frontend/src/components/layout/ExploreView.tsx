// Explore: the globe for the VIEWED body (Earth or Mars) with Codex's
// Globe / Orbital / Surface switch, a labelled Earth/Mars segmented control,
// a "Follow objective" affordance once the user has overridden the objective's
// body, the two labelled map modes (landing suitability on Mars; analog match
// on either body) and, in analog mode, the match context line with its
// changeable reference and the compact analog-preference control.
//
// The body switch and map mode write to the store; nothing here re-applies
// the objective. Imagery is per selected location on the visible body, and the
// imagery endpoint answers for Earth candidate ids as well as Mars sites.
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, API_BASE_URL } from "@/services/api";
import { EmptyNote } from "@/components/ui/Section";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { AnalogPreferences, type RankChange } from "@/components/mission/AnalogPreferences";
import { effectiveMapMode, useAppStore, type Body } from "@/store/useAppStore";
import { ANALOG_FEATURES, BODY_NAME, otherBody, toAnalogShares } from "@/lib/analogFeatures";
import type { Site } from "@/types";

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
  globe: ReactNode;
  /** The selected location on the visible body, for the imagery views. */
  site?: ImagerySubject;
  analog?: ExploreAnalogContext;
}

const BODIES: Body[] = ["earth", "mars"];

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

export function ExploreView({ globe, site, analog }: ExploreViewProps) {
  const [view, setView] = useState<"globe" | "orbital" | "surface">("globe");
  const viewedBody = useAppStore((s) => s.viewedBody);
  const setViewedBody = useAppStore((s) => s.setViewedBody);
  const followObjective = useAppStore((s) => s.followObjective);
  const followObjectiveNow = useAppStore((s) => s.followObjectiveNow);
  const appliedFocusBody = useAppStore((s) => s.appliedFocusBody);
  const mapMode = useAppStore((s) => s.mapMode);
  const setMapMode = useAppStore((s) => s.setMapMode);
  const selectedMarsId = useAppStore((s) => s.selectedMarsId);
  const analogWeights = useAppStore((s) => s.analogWeights);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const selectedEarthId = useAppStore((s) => s.selectedEarthId);
  const effective = effectiveMapMode({ viewedBody, mapMode });
  const [prefsOpen, setPrefsOpen] = useState(false);

  const switchBody = (b: Body) => setViewedBody(b, { manual: true });
  const marsSiteName = analog?.referenceOptions.find((o) => o.id === selectedMarsId)?.name;

  return <div className="flex h-full min-h-0 flex-col">
    <nav aria-label="Explore views" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-bg-elev p-3">
      <div role="radiogroup" aria-label="Body shown on the globe" className="inline-flex rounded-lg border border-line-strong p-0.5" data-testid="body-switch">
        {BODIES.map((b, i) => {
          const on = viewedBody === b;
          return (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              data-body={b}
              onClick={() => switchBody(b)}
              onKeyDown={(e) => {
                if (e.altKey || e.ctrlKey || e.metaKey) return;
                if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", " ", "Enter"].includes(e.key)) return;
                e.preventDefault();
                if (e.key === " " || e.key === "Enter") { switchBody(b); return; }
                const next = e.key === "Home" ? 0 : e.key === "End" ? BODIES.length - 1 : (i + (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : -1) + BODIES.length) % BODIES.length;
                switchBody(BODIES[next]);
                (e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next])?.focus();
              }}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-copper-bright ${on ? "bg-copper/15 text-copper-bright" : "text-fg-muted hover:text-fg"}`}
            >
              {BODY_NAME[b]}
            </button>
          );
        })}
      </div>
      {!followObjective && appliedFocusBody && (
        <button type="button" onClick={followObjectiveNow} className="rounded-lg border border-info/50 bg-info/10 px-3 py-1.5 text-xs text-info" title={`Return to the objective's body (${BODY_NAME[appliedFocusBody]})`}>
          Follow objective{appliedFocusBody !== viewedBody ? ` → ${BODY_NAME[appliedFocusBody]}` : ""}
        </button>
      )}
      {viewedBody === "mars" && (
        <div role="radiogroup" aria-label="Map mode" className="inline-flex rounded-lg border border-line p-0.5 text-xs" data-testid="map-mode">
          {(["landing_suitability", "analog_match"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mapMode === m} onClick={() => setMapMode(m)} className={`rounded-md px-2.5 py-1.5 ${mapMode === m ? "bg-bg-elev-2 text-fg" : "text-fg-muted hover:text-fg"}`}>
              {m === "landing_suitability" ? "Landing suitability" : "Analog match"}
            </button>
          ))}
        </div>
      )}
      {viewedBody === "earth" && <span className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-fg-muted" title="Earth locations carry no landing score; the only Earth mode is analog match.">Mode: Analog match</span>}
      <span className="mx-1 hidden h-5 w-px bg-line sm:inline-block" aria-hidden />
      {(["globe","orbital","surface"] as const).map(id => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={`rounded-lg border px-3 py-2 text-sm ${view === id ? "border-copper text-copper-bright bg-copper/10" : "border-line text-fg-muted hover:text-fg"}`}>{id === "globe" ? "Globe" : id === "orbital" ? "Orbital view" : "Surface view"}</button>)}
    </nav>

    {effective === "analog_match" ? (
      <div className="shrink-0 border-b border-line bg-bg-elev/70 px-3 py-2 text-xs" data-testid="analog-context">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-fg" aria-live="polite" data-testid="match-context-line">{matchContextLine(viewedBody, analog?.referenceName ?? null, analogWeights)}</p>
          {analog && (
            <label className="inline-flex items-center gap-1.5 text-fg-muted">
              Reference on {BODY_NAME[otherBody(viewedBody)]}
              <select value={analog.referenceId ?? ""} onChange={(e) => e.target.value && analog.onReferenceChange(e.target.value)} aria-label={`Reference location on ${BODY_NAME[otherBody(viewedBody)]}`} className="rounded border border-line-strong bg-bg px-2 py-1 text-xs text-fg">
                <option value="" disabled>{analog.referenceOptions.length ? "Choose a reference" : "Loading…"}</option>
                {analog.referenceOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
          )}
          <button type="button" onClick={() => setPrefsOpen((o) => !o)} aria-expanded={prefsOpen} aria-controls="analog-preferences" className="rounded border border-line px-2.5 py-1 text-xs text-fg-muted hover:text-fg">{prefsOpen ? "Hide" : "Adjust"} match preferences</button>
          <button type="button" onClick={() => setActiveTab("compare")} disabled={!selectedEarthId || !selectedMarsId} title={!selectedEarthId || !selectedMarsId ? "Select one Earth and one Mars location first" : "Open the Compare tab with this Earth/Mars pair"} className="rounded border border-copper/50 bg-copper/10 px-2.5 py-1 text-xs font-semibold text-copper-bright disabled:opacity-40">Compare selected pair</button>
        </div>
        {prefsOpen && (
          <div id="analog-preferences" className="mt-2 max-w-md rounded-lg border border-line bg-bg-elev">
            <AnalogPreferences compact unavailable={analog?.unavailable} rankChanges={analog?.rankChanges} previousShares={analog?.previousShares} />
          </div>
        )}
      </div>
    ) : (
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-bg-elev/70 px-3 py-2 text-xs" data-testid="landing-context">
        <p className="text-fg-muted">Mars landing screening · relative suitability index under the current priorities.</p>
        <button
          type="button"
          disabled={!selectedMarsId}
          onClick={() => { setViewedBody("earth", { manual: true }); }}
          title={selectedMarsId ? `Rank the Earth field sites against ${marsSiteName ?? "the selected Mars site"}` : "Select a Mars site first"}
          className="rounded border border-info/50 bg-info/10 px-2.5 py-1 text-xs font-semibold text-info disabled:opacity-40"
        >
          Find Earth analogs{marsSiteName ? ` for ${marsSiteName}` : ""}
        </button>
        <button type="button" onClick={() => setActiveTab("compare")} disabled={!selectedEarthId || !selectedMarsId} title={!selectedEarthId || !selectedMarsId ? "Select one Earth and one Mars location first" : "Open the Compare tab with this Earth/Mars pair"} className="rounded border border-copper/50 bg-copper/10 px-2.5 py-1 text-xs font-semibold text-copper-bright disabled:opacity-40">Compare selected pair</button>
      </div>
    )}

    <div className="min-h-0 flex-1"><div hidden={view !== "globe"} className="h-full">{view === "globe" && globe}</div><div hidden={view === "globe"} className="h-full">{site ? <SiteImages key={site.id} site={site} view={view === "surface" ? "surface" : "orbital"} enabled={view !== "globe"} /> : <div className="p-4"><EmptyNote>Select a candidate to see its imagery.</EmptyNote></div>}</div></div>
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
  if(q.isPending) return <div role="status" className="p-4 text-sm text-fg-muted">Loading site imagery…</div>;
  if(q.error) return <div className="p-4"><ErrorNote error={q.error} /><button className="mt-3 rounded border border-line p-3 text-sm" onClick={()=>void q.refetch()}>Retry imagery</button></div>;
  if(!entry) return <div className="p-4"><h2 className="mb-3 text-base font-semibold">{site.name}</h2><EmptyNote>No verified {view} imagery is available for this site.</EmptyNote>{q.data?.notes?.map(n=><p key={n} className="mt-3 text-sm text-fg-muted">{n}</p>)}</div>;
  const bounds=entry.bounds;
  const contains=bounds && site.lon_east>=bounds.west && site.lon_east<=bounds.east && site.lat>=bounds.south && site.lat<=bounds.north;
  return <section aria-label={`${view} imagery for ${site.name}`} className="scroll-thin h-full overflow-y-auto p-4">
    <h2 className="text-base font-semibold">{site.name}</h2>
    <label className="mt-3 block text-xs text-fg-muted" htmlFor="site-image">{view === "orbital" ? "Orbital image" : "Surface image"}</label>
    <select id="site-image" value={entry.entry_id} onChange={e=>{setChoices(c=>({...c,[view]:e.target.value}));setZoom(1);setFailed(null);}} className="mt-1 w-full rounded-lg border border-line-strong bg-bg-elev p-3 text-sm">{entries.map(e=><option key={e.entry_id} value={e.entry_id}>{e.title}</option>)}</select>
    <div className="my-3 flex flex-wrap items-center gap-2 text-xs">
      <button type="button" aria-label="Zoom image out" disabled={zoom<=1} onClick={()=>setZoom(z=>Math.max(1,z-.5))} className="rounded border border-line px-3 py-2 disabled:opacity-40">−</button>
      <span className="num">{Math.round(zoom*100)}%</span>
      <button type="button" aria-label="Zoom image in" disabled={zoom>=3} onClick={()=>setZoom(z=>Math.min(3,z+.5))} className="rounded border border-line px-3 py-2 disabled:opacity-40">+</button>
      <button type="button" onClick={()=>setZoom(1)} className="rounded border border-line px-3 py-2">Fit image</button>
      <span className="text-fg-muted">Focus the image area and use arrow keys to scroll when zoomed.</span>
    </div>
    {failed !== entry.entry_id && loaded !== entry.entry_id && <p role="status" className="mb-2 text-xs text-fg-muted">Loading image…</p>}
    {failed === entry.entry_id ? <div role="alert" className="rounded-lg border border-line p-4 text-sm">Image could not be loaded.<button type="button" className="ml-3 text-info underline" onClick={()=>{setAttempt(n=>n+1);setFailed(null);}}>Retry image</button></div> : <div tabIndex={0} aria-label="Image area; arrow keys scroll" className="max-h-[52vh] overflow-auto rounded-lg border border-line bg-black">
      <div className="relative mx-auto" style={{width: entry.width_px && entry.height_px ? `min(${zoom*100}%, ${entry.width_px/entry.height_px*52*zoom}vh)` : `${zoom*100}%`}}>
        <img key={`${entry.entry_id}:${attempt}`} src={`${API_BASE_URL}/api/v1/imagery/${encodeURIComponent(entry.entry_id)}/asset?retry=${attempt}`} alt={`${entry.title}. ${entry.relevance}`} className="block h-auto w-full" onLoad={()=>setLoaded(entry.entry_id)} onError={()=>setFailed(entry.entry_id)} />
        {contains && bounds && <span title="Candidate coordinate (not a landing ellipse)" aria-label="Candidate coordinate" className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-copper shadow" style={{left:`${(site.lon_east-bounds.west)/(bounds.east-bounds.west)*100}%`,top:`${(bounds.north-site.lat)/(bounds.north-bounds.south)*100}%`}} />}
      </div>
    </div>}
    <p className="mt-3 text-sm text-fg">{entry.relevance}</p>
    <p className="mt-2 text-xs text-fg-muted">{entry.relationship.replace(/_/g," ")} · {entry.spatial_resolution_m_per_px ? `${entry.spatial_resolution_m_per_px} m/pixel` : "Resolution not verified"} · {entry.acquisition_date ? `Acquired ${entry.acquisition_date}` : "No single verified acquisition date"}</p>
    {contains && <p className="mt-1 text-xs text-fg-muted">The dot marks the candidate coordinate. It does not show the analysis footprint or a landing ellipse.</p>}
    <p className="mt-2 text-xs text-fg-muted">{entry.credit}</p>
    <a className="mt-2 inline-block text-sm text-info underline" href={entry.source_page_url} target="_blank" rel="noreferrer">Open original source ↗</a>
    <details className="mt-4 rounded-lg border border-line p-3 text-xs text-fg-muted"><summary className="cursor-pointer">Image coverage, processing and credits</summary><div className="mt-3 space-y-2">{[entry.coverage_evidence,entry.appearance_note,entry.resolution_note,entry.acquisition_note,entry.license].filter(Boolean).map((text,i)=><p key={i}>{text}</p>)}<p>Source: {entry.institution}. Verified {entry.verified_on}.</p></div></details>
  </section>;
}
