import { useState } from "react";
import { useComparisonCatalog } from "@/hooks/useEarthSites";
import { AnalysisHeader } from "@/components/layout/AnalysisHeader";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { StageButton } from "@/components/ui/StageButton";
import { useAppStore } from "@/store/useAppStore";
import { useCandidateResearchTarget } from "@/features/discovery/store/useCandidateResearchTarget";
import { useDiscoveryStore } from "@/features/discovery/store/useDiscoveryStore";
import { useDiscoveryRank } from "@/features/discovery/hooks/useDiscoveryRank";
import { WeightControls } from "@/features/discovery/components/WeightControls";
import { formatValueWithUnit } from "@/lib/format";
import { useAtlasDiscovery } from "./useAtlasDiscovery";
import { useRegionTarget } from "./store";
import { catalogRegion,type RegionTarget } from "./model";
import { RegionMeasurements } from "./RegionMeasurements";
const card="rounded-lg border border-line-strong bg-bg-elev p-4";

/** Original analysis structure, using measured inputs appropriate to the selected region. */
export function RegionAnalysis({target}:{target:RegionTarget}){
 const catalog=useComparisonCatalog();
 const discovery=useAtlasDiscovery();
 const store=useDiscoveryStore();
 const open=useRegionTarget(s=>s.open);
 const setTab=useAppStore(s=>s.setActiveTab);
 const research=useCandidateResearchTarget(s=>s.open);
 const [alternative,setAlternative]=useState("");
 const found=target.kind==="discovered";
 const row=discovery.regions.find(r=>r.candidateId===target.id);
 const known=catalog.data?.locations.find(l=>l.id===target.id);
 const selected=found ? row?.region : known ? catalogRegion(known) : undefined;
 const rank=useDiscoveryRank(discovery.runId ?? null,store.weights,store.topK,found);
 const current=rank.data?.candidates.find(c=>c.id===target.id);
 const alternatives=discovery.regions.filter(r=>r.candidateId!==target.id);
 const other=alternatives.find(r=>r.candidateId===alternative) ?? alternatives[0];
 const pending=found ? discovery.artifact.isFetching || discovery.capabilities.isFetching : catalog.isFetching;
 const error=found ? discovery.artifact.error ?? discovery.capabilities.error : catalog.error;
 const criteria=discovery.capabilities.data?.criteria ?? [];
 return <div data-pane="analysis" className="scroll-thin h-full overflow-y-auto p-4">
  <AnalysisHeader description={found?"Terrain match, alternatives and weight sensitivity.":"Measured inputs, coverage and evidence gaps."}>
   <label className="text-sm text-fg-muted">Region<select className="ml-2 max-w-full rounded-lg border border-line bg-bg-elev p-2 text-sm" value={found?row?.location.id ?? "":`catalog:${target.id}`} onChange={e=>{const choice=discovery.regions.find(r=>r.location.id===e.target.value);if(choice)open({kind:"discovered",id:choice.candidateId,runId:discovery.runId});else open({kind:"catalog",id:e.target.value.slice(8),runId:discovery.runId});}}>
    {!selected && <option value="">Loading region…</option>}
    <optgroup label="Found survey regions">{discovery.regions.map(r=><option key={r.location.id} value={r.location.id}>{r.region.name}</option>)}</optgroup>
    <optgroup label="Established catalog regions">{catalog.data?.locations.filter(l=>l.body!=="moon").map(l=><option key={l.id} value={`catalog:${l.id}`}>{l.name}</option>)}</optgroup>
   </select></label>
  </AnalysisHeader>
  {error && <ErrorNote error={error} context="region analysis"/>}
  {!selected ? <p role="status">{error?"Selected region unavailable; no other region has been substituted.":pending?"Loading selected region…":"No measured profile is available for this region."}</p> : <div className="space-y-4">
   <section className={card} aria-label="Decision summary"><p className="text-xs text-copper-bright">{selected.origin}</p><div className="mt-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">{selected.name}</h2><p className="text-sm text-fg-muted">{found?"Compared with the survey-processed Jezero reference.":"No applicable mission-fit evaluation is available for this region and current mission."}</p></div>{current && <p className="num text-3xl text-copper-bright">{current.similarity_index?.toFixed(1)} / 100</p>}</div>{found && <p className="mt-3 text-xs text-fg-muted">Two-feature terrain index, not landing suitability or a probability. {current?`Displayed rank ${current.display_rank}; raw rank ${current.raw_rank} before spacing.`:"This footprint is not in the current diversified shortlist; measured inputs remain available."}</p>}{rank.error && <ErrorNote error={rank.error} context="discovery ranking"/>}</section>
   <section className={card}><h2 className="text-base font-semibold">What helps and what costs points?</h2>{current ? <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Factor","Here","Jezero","Influence","Normalized distance","Contribution to distance"].map(x=><th key={x} className="p-2">{x}</th>)}</tr></thead><tbody>{(current.feature_distances ?? []).map(f=><tr key={f.feature_id} className="border-t border-line"><th className="p-2">{criteria.find(c=>c.feature_id===f.feature_id)?.label ?? f.feature_id}</th><td className="p-2">{formatValueWithUnit(f.earth_value,f.unit)}</td><td className="p-2">{formatValueWithUnit(f.mars_value,f.unit)}</td><td className="p-2">{(f.normalized_weight*100).toFixed(0)}%</td><td className="p-2">{f.distance.toFixed(3)}</td><td className="p-2">{f.contribution.toFixed(3)}</td></tr>)}</tbody></table><p className="mt-2 text-xs text-fg-muted">Larger distance contributions reduce similarity. These are not mission-fit point deductions.</p></div> : <p className="mt-2 text-sm text-fg-muted">No applicable factor score is available. Measured values are shown below.</p>}
    <div className="mt-3"><RegionMeasurements region={selected} other={found ? discovery.reference ?? undefined : undefined}/></div>
   </section>
   {found && other && <section className={card}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Why this region rather than another?</h2><label className="text-sm">Comparison region<select className="ml-2 max-w-full rounded border border-line bg-bg p-2" value={other.candidateId} onChange={e=>setAlternative(e.target.value)}>{alternatives.map(r=><option key={r.candidateId} value={r.candidateId}>{r.region.name}</option>)}</select></label></div><p className="my-2 text-xs text-fg-muted">Same survey and processing grid. Signed differences are measurements, not a suitability ranking.</p><RegionMeasurements region={selected} other={other.region}/></section>}
   {found && <section className={card}><h2 className="mb-3 text-base font-semibold">How sensitive is this choice?</h2><p className="mb-3 text-sm text-fg-muted">Adjust terrain weights to rerank this survey. This changes the live discovery settings in Explore too.</p><WeightControls shares={store.weights} defaults={store.defaultWeights} criteria={criteria} onChange={store.setWeight} onReset={store.resetWeights} topK={store.topK} onTopK={store.setTopK} disabled={!criteria.length}/>{rank.isFetching && <p role="status">Updating the terrain ranking…</p>}</section>}
   <section className={card}><h2 className="text-base font-semibold">What evidence would improve this decision?</h2><p className="mt-2 text-sm text-fg-muted">Review geology, prior analog studies and site-scale hazards. Regional terrain similarity does not establish operational suitability or scientific novelty.</p>{found && <StageButton className="mt-3" onClick={()=>{if(discovery.runId){research(discovery.runId,target.id);setTab("research");}}}>Research this candidate</StageButton>}</section>
   <section className={card}><h2 className="text-base font-semibold">Constraints, risks and limitations</h2><p className="mt-2 text-sm text-fg-muted">Site-scale hazards and mission constraints have not been evaluated by this terrain comparison.</p><details className="mt-3"><summary>Coverage, processing and limitations</summary><ul className="mt-3 space-y-2 break-words text-xs text-fg-muted">{selected.notes.map((note,i)=><li key={i}>{note}</li>)}</ul></details><details className="mt-3"><summary>Measurement sources</summary><ul className="mt-2 space-y-2 text-sm">{selected.sources.map((source,i)=><li key={i}><a href={source.url} target="_blank" rel="noreferrer" className="text-info underline">{source.title}</a></li>)}</ul></details></section>
  </div>}
 </div>;
}
