import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, API_BASE_URL } from "@/services/api";
import { EmptyNote } from "@/components/ui/Section";
import { ErrorNote } from "@/components/ui/ErrorNote";
import type { Site } from "@/types";

export function ExploreView({ globe, site }: {globe: ReactNode; site?: Site}) {
  const [view, setView] = useState<"globe" | "orbital" | "surface">("globe");
  return <div className="flex h-full min-h-0 flex-col">
    <nav aria-label="Explore views" className="flex shrink-0 flex-wrap gap-2 border-b border-line bg-bg-elev p-3">
      {(["globe","orbital","surface"] as const).map(id => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={`rounded-lg border px-3 py-2 text-sm ${view === id ? "border-copper text-copper-bright bg-copper/10" : "border-line text-fg-muted hover:text-fg"}`}>{id === "globe" ? "Globe" : id === "orbital" ? "Orbital view" : "Surface view"}</button>)}
    </nav>
    <div className="min-h-0 flex-1"><div hidden={view !== "globe"} className="h-full">{view === "globe" && globe}</div><div hidden={view === "globe"} className="h-full">{site ? <SiteImages key={site.id} site={site} view={view === "surface" ? "surface" : "orbital"} enabled={view !== "globe"} /> : <div className="p-4"><EmptyNote>Select a candidate to see its imagery.</EmptyNote></div>}</div></div>
  </div>;
}

function SiteImages({site,view,enabled}: {site: Site; view: "orbital" | "surface"; enabled: boolean}) {
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
