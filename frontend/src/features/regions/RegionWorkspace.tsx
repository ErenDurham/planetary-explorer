import { StageButton } from "@/components/ui/StageButton";
import { useDiscoveryStore } from "@/features/discovery/store/useDiscoveryStore";
import { formatLatLon } from "@/lib/format";
import { downloadJson } from "@/features/discovery/lib/download";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useComparisonCatalog } from "@/hooks/useEarthSites";
import { discoveryEngine } from "@/services/discoveryEngine";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { useAppStore } from "@/store/useAppStore";
import { useCandidateResearchTarget } from "@/features/discovery/store/useCandidateResearchTarget";
import { useRegionTarget } from "./store";
import { catalogRegion, discoveredRegion, referenceRegion, regionKey, type MeasuredRegion, type RegionTarget } from "./model";
import { RegionMeasurements } from "./RegionMeasurements";

export function RegionWorkspace({target,compare}: {target:RegionTarget;compare:boolean}) {
  const catalog=useComparisonCatalog();
  const setTab=useAppStore(s=>s.setActiveTab);
  const open=useRegionTarget(s=>s.open);
  const clear=useRegionTarget(s=>s.clear);
  const research=useCandidateResearchTarget(s=>s.open);
  const [otherKey,setOtherKey]=useState("");
  const storedRunId=useDiscoveryStore(s=>s.runId);
  const installed=useQuery({queryKey:["region-discovery-capabilities"],queryFn:({signal})=>discoveryEngine.capabilities(signal),enabled:!target.runId && !storedRunId,retry:false});
  const runId=target.runId ?? storedRunId ?? installed.data?.runs[0]?.run_id;
  const detail=useQuery({queryKey:["region-detail",runId,target.id],queryFn:({signal})=>discoveryEngine.detail(runId!,target.id,signal),enabled:target.kind==="discovered" && !!runId,retry:false});
  const artifact=useQuery({queryKey:["region-artifact",runId],queryFn:({signal})=>discoveryEngine.export(runId!,signal),enabled:!!runId,retry:false});
  const curated=(catalog.data?.locations ?? []).filter(l=>l.body!=="moon").map(catalogRegion);
  const discovered=(artifact.data?.audit_rows ?? []).filter(row=>row.profile && row.screening_reasons.length===0).map(row=>discoveredRegion({...row.candidate,profile:row.profile,screening_reasons:row.screening_reasons,source_manifest:row.candidate.sources,proposed_field_validation:[]},runId!));
  // Some artifacts store positive screening notes; keep the selected footprint available independently.
  const selected=target.kind==="catalog" ? curated.find(r=>r.key===regionKey(target)) : detail.data ? discoveredRegion(detail.data,runId!) : undefined;
  const reference=artifact.data ? referenceRegion(artifact.data,runId!) : undefined;
  const options=[...(reference?[reference]:[]),...discovered,...curated].filter(r=>r.key!==selected?.key);
  const other=options.find(r=>r.key===otherKey) ?? (reference?.key!==selected?.key ? reference : undefined) ?? options[0];
  const error=target.kind==="discovered" ? detail.error : catalog.error;
  const backToExplore=()=>{
    const app=useAppStore.getState();
    if(target.kind==="discovered" && target.runId){
      useDiscoveryStore.getState().setRun(target.runId);
      useDiscoveryStore.getState().selectCandidate(target.id);
      app.setExploreMode("find_analogs");
    } else if(selected && (selected.body==="earth" || selected.body==="mars")) {
      app.setExploreMode("browse");app.showOnGlobe(selected.body,target.id);
    }
    setTab("explore");
  };
  const describe=(r:MeasuredRegion)=><section className="rounded border border-line p-3"><h2 className="font-semibold">{r.name}</h2><p className="text-sm text-fg-muted">{r.origin} · {r.body} · {formatLatLon(r.lat,r.lon)}</p><details className="mt-2"><summary>Coverage, methods and sources</summary><ul className="mt-2 space-y-2 break-words text-xs">{r.notes.map((n,i)=><li key={i}>{n}</li>)}{r.sources.map((s,i)=><li key={`s${i}`}><a href={s.url} target="_blank" rel="noreferrer" className="text-info underline">{s.title}</a></li>)}</ul></details></section>;
  return <div className="h-full overflow-y-auto p-4" data-pane="analysis"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">{compare?"Compare regions":"Region analysis"}</h1><p className="text-sm text-fg-muted">A shared measurement workspace for discovered and catalog regions.</p></div><div className="flex flex-wrap gap-3"><StageButton onClick={()=>setTab(compare?"analyze":"compare")}>{compare?"Analyze selected region":"Compare this region"}</StageButton><button className="text-info underline" onClick={backToExplore}>Back to Explore</button><button className="text-info underline" onClick={clear}>Use established mission tools</button></div></div>
    <label className="block text-sm">Selected region<select className="my-2 block max-w-full rounded border border-line bg-bg-elev p-2" value={regionKey(target)} onChange={e=>{const key=e.target.value;const row=curated.find(r=>r.key===key);if(row)open({kind:"catalog",id:row.key.slice(8),runId});else {const row=artifact.data?.audit_rows.find(r=>regionKey({kind:"discovered",id:r.candidate.id,runId})===key);if(row)open({kind:"discovered",id:row.candidate.id,runId});}}}>{selected && <option value={selected.key}>{selected.name}</option>}{[...discovered,...curated].filter(r=>r.key!==selected?.key).map(r=><option key={r.key} value={r.key}>{r.origin} · {r.name}</option>)}</select></label>
    {error ? <ErrorNote error={error} context="region profile"/> : !selected ? (detail.isFetching || catalog.isFetching ? <p role="status">Loading measured region…</p> : <p role="alert">This region has no available measured profile. Choose another region or return to Explore.</p>) : <div className="space-y-4">{describe(selected)}{target.kind==="discovered" && <button className="text-info underline" onClick={()=>{research(runId!,target.id);setTab("research");}}>Research this candidate</button>}
      {compare && <><label className="block text-sm">Comparison region<select className="mt-2 block max-w-full rounded border border-line bg-bg-elev p-2" value={other?.key ?? ""} onChange={e=>setOtherKey(e.target.value)}>{options.map(r=><option key={r.key} value={r.key}>{r.origin} · {r.name}</option>)}</select></label>{artifact.isPending && runId && <p role="status">Loading survey comparison profiles…</p>}{installed.error && <ErrorNote error={installed.error} context="discovery availability"/>}{artifact.error && <ErrorNote error={artifact.error} context="survey comparison"/>}{other && describe(other)}{other && selected.baseline!==other.baseline && <p className="text-sm text-warn">Different footprints and processing methods: values are shown for context only. No numerical difference or combined score is calculated.</p>}</>}
      <button className="text-info underline" onClick={()=>downloadJson("region-measurements.json",{schema_version:"region-measurements-v1",selected,comparison:compare?other:null,limitations:["Descriptive measurements only; no combined similarity score.","Differences require a shared processing baseline and compatible units."]})}>Download measured comparison</button>
      <RegionMeasurements region={selected} other={compare?other:undefined}/><p className="text-sm text-fg-muted">This workspace does not infer geology, mission suitability or field validation. Discovery and curated similarity scores are not combined.</p>
    </div>}
  </div>;
}
