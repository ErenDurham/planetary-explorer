import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { discoveryEngine } from "@/services/discoveryEngine";
import { useDiscoveryStore } from "@/features/discovery/store/useDiscoveryStore";
import { useRegionTarget } from "./store";
import { discoveredRegion,referenceRegion } from "./model";
import { atlasLocation } from "./atlasAdapter";

export function useAtlasDiscovery(){
  const target=useRegionTarget(s=>s.target);
  const storedRun=useDiscoveryStore(s=>s.runId);
  const capabilities=useQuery({queryKey:["region-discovery-capabilities"],queryFn:({signal})=>discoveryEngine.capabilities(signal),staleTime:Infinity,retry:false});
  // Both Explore workspaces share one weight store, so both must seed it: a survey
  // declares the features it scores, and until they are seeded the sliders have nothing to move.
  const seedDefaults=useDiscoveryStore(s=>s.seedDefaults);
  const declaredDefaults=capabilities.data?.default_weights;
  useEffect(()=>{if(declaredDefaults)seedDefaults(declaredDefaults);},[declaredDefaults,seedDefaults]);
  const runId=target?.runId ?? storedRun ?? capabilities.data?.runs[0]?.run_id;
  const artifact=useQuery({queryKey:["region-artifact",runId],queryFn:({signal})=>discoveryEngine.export(runId!,signal),enabled:!!runId,retry:false});
  const rows=(artifact.data?.audit_rows ?? []).filter(r=>r.profile && !r.screening_reasons.length);
  const regions=rows.map(row=>{
    const notebooks=artifact.data?.validation.candidate_research;
    const saved=notebooks && typeof notebooks==="object" ? (notebooks as Record<string,{status?:unknown}>)[row.candidate.id]?.status : undefined;
    const status=saved==="in_progress" || saved==="literature_reviewed" || saved==="unresearched" ? saved : row.candidate.research_status;
    const region=discoveredRegion({...row.candidate,research_status:status,profile:row.profile,screening_reasons:row.screening_reasons,source_manifest:row.candidate.sources,proposed_field_validation:[]},runId!);
    return {candidateId:row.candidate.id,region,location:atlasLocation(region,row.profile,row.candidate.sources)};
  });
  const reference=artifact.data && runId ? referenceRegion(artifact.data,runId) : null;
  const referenceLocation=reference && artifact.data ? {...atlasLocation(reference,artifact.data.reference_profile,artifact.data.provenance),id:"jezero_crater",name:"Jezero Crater"} : null;
  return {target,runId,artifact,capabilities,regions,reference,referenceLocation};
}
