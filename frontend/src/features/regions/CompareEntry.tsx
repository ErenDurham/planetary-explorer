import { useQuery } from "@tanstack/react-query";
import { useComparisonCatalog } from "@/hooks/useEarthSites";
import { discoveryEngine } from "@/services/discoveryEngine";
import { useDiscoveryStore } from "@/features/discovery/store/useDiscoveryStore";
import { CompareView } from "@/components/layout/CompareView";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { useRegionTarget } from "./store";
import { RegionWorkspace } from "./RegionWorkspace";
import type { Site } from "@/types";

/** Normal Compare navigation never silently falls back to the first catalog site. */
export function CompareEntry({sites,selectedId}: {sites:Site[]|undefined;selectedId:string|null}) {
  const target=useRegionTarget(s=>s.target);
  const catalogTools=useRegionTarget(s=>s.catalogTools);
  const open=useRegionTarget(s=>s.open);
  const catalog=useComparisonCatalog();
  const storedRun=useDiscoveryStore(s=>s.runId);
  const capabilities=useQuery({queryKey:["region-discovery-capabilities"],queryFn:({signal})=>discoveryEngine.capabilities(signal),enabled:!storedRun,retry:false});
  const runId=storedRun ?? capabilities.data?.runs[0]?.run_id;
  const artifact=useQuery({queryKey:["region-artifact",runId],queryFn:({signal})=>discoveryEngine.export(runId!,signal),enabled:!!runId,retry:false});
  if(target)return <RegionWorkspace key={`${target.kind}:${target.runId}:${target.id}`} target={target} compare/>;
  const found=(artifact.data?.audit_rows ?? []).filter(r=>r.profile && !r.screening_reasons.length);
  return <div className="h-full overflow-y-auto p-4">
    <section className="mb-4 rounded border border-line p-4" aria-label="Choose a region to compare">
      <h1 className="text-xl font-semibold">Compare found and established regions</h1>
      <p className="my-2 text-sm text-fg-muted">Choose a found survey footprint or an established catalog region. No region is substituted automatically.</p>
      <label className="block text-sm">Region to compare<select className="mt-2 block max-w-full rounded border border-line bg-bg-elev p-2" value="" onChange={e=>{const value=e.target.value;if(value.startsWith("found:"))open({kind:"discovered",id:value.slice(6),runId});else open({kind:"catalog",id:value.slice(8),runId});}}>
        <option value="" disabled>Choose a region…</option>
        <optgroup label="Found survey regions">{found.map(r=><option key={r.candidate.id} value={`found:${r.candidate.id}`}>{r.candidate.name} · unvalidated candidate</option>)}</optgroup>
        <optgroup label="Established catalog regions">{catalog.data?.locations.filter(l=>l.body!=="moon").map(l=><option key={l.id} value={`catalog:${l.id}`}>{l.name} · {l.body}</option>)}</optgroup>
      </select></label>
      {(capabilities.isFetching || artifact.isFetching) && <p role="status" className="mt-2 text-sm">Loading found survey regions…</p>}
      {capabilities.error && <ErrorNote error={capabilities.error} context="found regions"/>}
      {artifact.error && <ErrorNote error={artifact.error} context="found region profiles"/>}
      {catalog.error && <ErrorNote error={catalog.error} context="catalog regions"/>}
      {!capabilities.isFetching && !artifact.isFetching && !found.length && !capabilities.error && !artifact.error && <p className="mt-2 text-sm text-fg-muted">No eligible measured survey regions are available.</p>}
    </section>
    {catalogTools && <CompareView sites={sites} selectedId={selectedId}/>}
  </div>;
}
