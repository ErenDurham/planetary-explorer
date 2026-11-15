import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { useAppStore } from "@/store/useAppStore";
import { toShares } from "@/lib/allocation";
import { PROFILE_CRITERIA } from "@/lib/missionProfiles";
import { Section } from "@/components/ui/Section";
import type { ComparisonCatalog, MissionRequirements } from "@/types";
import type { AssessmentType } from "@/lib/missionProfiles";
import type { Body } from "@/lib/analogFeatures";

/** The rule-based task-priority proposal for a non-landing mission type,
 * shared by this panel and the Mission Design chat box: recognised material /
 * landform targets (research) and slope / relief emphasis (rover tests). */
export function suggestTaskPriorities(draft: string, kind: AssessmentType, body: Body, weights: Record<AssessmentType, Record<string, number>>, requirements: Record<Body, MissionRequirements>, catalog: ComparisonCatalog | undefined): { weights: Record<string, number>; requirements: Partial<MissionRequirements> } {
  const text=draft.toLowerCase(),next={...weights[kind]},patch:Partial<MissionRequirements>={};
  if(kind==="research"){
   for(const [field,fid] of [["material_targets","mineralogy_tags"],["landform_targets","terrain_morphology"]] as const){
    const options=[...new Set(catalog?.locations.filter(l=>l.body===body).flatMap(l=>{const v=l.measurements.find(m=>m.feature_id===fid&&!m.is_missing)?.value;return Array.isArray(v)?v:[];})??[])];
    const found=options.filter(tag=>new RegExp(`\\b${tag.replaceAll("_","[ _-]")}\\b`,"i").test(text));
    if(found.length)patch[field]=found;
   }
   const materials=(patch.material_targets??requirements[body].material_targets??[]).length;
   const landforms=(patch.landform_targets??requirements[body].landform_targets??[]).length;
   if(materials&&!landforms){next.materials=100;next.landforms=0;}
   if(landforms&&!materials){next.landforms=100;next.materials=0;}
  }
  if(kind==="rover_field_test"){
   if(/\bslope|gradient|tilt\b/.test(text)&&!/relief|uneven|rough/.test(text)){next.slope=70;next.relief=30;}
   if(/relief|uneven|rough/.test(text)&&!/slope|gradient|tilt/.test(text)){next.relief=70;next.slope=30;}
  }
  return {weights:Object.keys(next).length?toShares(next):{},requirements:patch};
}

export function TaskMissionObjective(){
 const objective=useAppStore(s=>s.missionObjective),applied=useAppStore(s=>s.appliedObjective),kind=useAppStore(s=>s.missionType),body=useAppStore(s=>s.selectionBody);
 const weights=useAppStore(s=>s.missionProfileWeights),requirements=useAppStore(s=>s.missionRequirements);
 const dirty=useAppStore(s=>s.setMissionDraftDirty),apply=useAppStore(s=>s.applyTaskObjective);
 const [draft,setDraft]=useState(objective),[proposal,setProposal]=useState<{text:string;weights:Record<string,number>;requirements:Partial<MissionRequirements>}|null>(null);
 const catalog=useQuery({queryKey:["comparison-catalog"],queryFn:api.comparisonCatalog,staleTime:Infinity});
 if(kind==="landing")return null;
 const suggest=()=>{
  const out=suggestTaskPriorities(draft,kind,body,weights,requirements,catalog.data);
  setProposal({text:draft.trim(),weights:out.weights,requirements:out.requirements});
 };
 return <Section title="Mission objective" subtitle="Describe your goal, then review the proposed task priorities.">
  <label htmlFor="task-objective" className="sr-only">Your mission objective</label><textarea id="task-objective" rows={3} maxLength={500} value={draft} onChange={e=>{setDraft(e.target.value);useAppStore.setState({missionObjective:e.target.value});dirty(e.target.value.trim()!==applied.trim());}} className="w-full rounded border border-line-strong bg-bg p-3 text-sm text-fg"/>
  <button type="button" disabled={!draft.trim()} onClick={suggest} className="mt-3 rounded border border-copper bg-copper/10 px-3 py-2 text-sm font-semibold text-copper-bright">Suggest priorities</button>
  {draft.trim()!==applied.trim()&&<p className="mt-3 text-xs text-warn">Objective changes are not applied yet.</p>}
  {proposal&&<div className="mt-4 rounded border border-line p-3"><h3 className="text-sm font-semibold">Proposed mission priorities</h3><p className="mt-2 text-xs text-fg-muted">Rule-based suggestion. Recognizes supported target names and terrain emphasis; it does not infer scientific value or engineering limits.</p>{PROFILE_CRITERIA[kind].map(c=><p key={c.id} className="mt-2 text-xs">{c.label}: {proposal.weights[c.id]}%</p>)}{Object.entries(proposal.requirements).map(([k,v])=><p key={k} className="mt-2 text-xs text-fg-muted">{k.replaceAll("_"," ")}: {Array.isArray(v)?v.join(", "):v}</p>)}<button type="button" disabled={proposal.text!==draft.trim()} onClick={()=>{apply(proposal.text,proposal.weights,proposal.requirements);setProposal(null);}} className="mt-3 rounded border border-copper bg-copper/10 p-2 text-sm text-copper-bright disabled:opacity-40">Apply mission priorities</button></div>}
 </Section>;
}
