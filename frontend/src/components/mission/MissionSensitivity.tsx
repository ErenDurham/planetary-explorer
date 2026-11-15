import { useEffect, useRef, useState } from "react";
import { api } from "@/services/api";
import { useAppStore } from "@/store/useAppStore";
import { setShare } from "@/lib/allocation";
import { PROFILE_CRITERIA } from "@/lib/missionProfiles";
import type { MissionAssessmentResponse } from "@/types";

export function MissionSensitivity({data,siteId}:{data:MissionAssessmentResponse;siteId:string}) {
 const all=useAppStore(s=>s.missionProfileWeights),weights=all[data.mission_type];
 const signature=JSON.stringify([data.body,data.mission_type,data.requirements,weights,siteId]);
 const controller=useRef<AbortController|null>(null);
 const [pending,setPending]=useState(false),[error,setError]=useState("");
 const [rows,setRows]=useState<{label:string;delta:number;rank:number|null;score:number|null}[]>([]);
 useEffect(()=>{controller.current?.abort();setRows([]);setError("");setPending(false);return()=>controller.current?.abort();},[signature]);
 const run=async()=>{
  controller.current?.abort();const abort=new AbortController();controller.current=abort;setPending(true);setError("");
  try{
   const jobs=PROFILE_CRITERIA[data.mission_type].flatMap(c=>[-10,10].map(delta=>({c,delta,value:Math.max(0,Math.min(100,(weights[c.id]??0)+delta))}))).filter(j=>j.value!==weights[j.c.id]);
   const result=await Promise.all(jobs.map(async j=>{
    const id=`sensitivity-${crypto.randomUUID()}`;
    const response=await api.assessMission({body:data.body,mission_type:data.mission_type,requirements:data.requirements,weights:setShare(weights,j.c.id,j.value),client_request_id:id},abort.signal);
    if(response.client_request_id!==id)throw new Error("The sensitivity response did not match the request");
    const focus=response.results.find(r=>r.site_id===siteId);
    return {label:j.c.label,delta:j.value-(weights[j.c.id]??0),rank:focus?.rank??null,score:focus?.score??null};
   }));
   if(!abort.signal.aborted)setRows(result);
  }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:String(e));}
  finally{if(!abort.signal.aborted)setPending(false);}
 };
 return <section className="mt-5 border-t border-line pt-4" aria-label="Mission priority sensitivity"><h2 className="text-sm font-semibold">Priority sensitivity</h2><p className="mt-2 text-xs leading-relaxed text-fg-muted">This test moves each priority up and down by 10 percentage points and rescales the others. Your saved priorities do not change.</p><button type="button" disabled={pending} onClick={run} className="mt-3 rounded border border-line-strong px-3 py-2 text-sm text-fg disabled:opacity-40">{pending?"Testing priorities…":"Test priority sensitivity"}</button>{error&&<p role="alert" className="mt-3 text-xs text-warn">{error}</p>}{rows.length>0&&<><div className="mt-3 overflow-auto"><table className="w-full text-left text-xs"><thead><tr className="text-fg-muted"><th className="p-2">Priority adjustment</th><th className="p-2">Rank</th><th className="p-2">Index</th></tr></thead><tbody>{rows.map(r=><tr key={`${r.label}:${r.delta}`} className="border-t border-line"><td className="p-2">{r.label} {r.delta>0?"+":""}{r.delta} pp</td><td className="p-2">{r.rank??"Not ranked"}</td><td className="p-2">{r.score?.toFixed(1)??"Not scored"}</td></tr>)}</tbody></table></div><p className="mt-3 text-xs text-fg-muted">These are sample cases only. They do not show that the rank is stable for every possible setting.</p></>}</section>;
}
