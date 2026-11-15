import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { useAppStore } from "@/store/useAppStore";
import type { MissionAssessmentRequest } from "@/types";

export function useMissionAssessment() {
 const body=useAppStore(s=>s.selectionBody),kind=useAppStore(s=>s.missionType);
 const weights=useAppStore(s=>s.missionProfileWeights),requirements=useAppStore(s=>s.missionRequirements);
 const enabled=kind!=="landing";
 const signature=JSON.stringify(enabled?{body,mission_type:kind,weights:weights[kind],requirements:requirements[body]}:null);
 const [settled,setSettled]=useState(signature);
 useEffect(()=>{const timer=setTimeout(()=>setSettled(signature),180);return()=>clearTimeout(timer);},[signature]);
 const ready=settled===signature;
 const query=useQuery({queryKey:["mission-assessment",settled],enabled:enabled && settled!=="null" && ready,
  queryFn:async({signal})=>{const request=JSON.parse(settled) as MissionAssessmentRequest;const id=`mission-${crypto.randomUUID()}`;const result=await api.assessMission({...request,client_request_id:id},signal);if(result.client_request_id!==id)throw new Error("Mission response did not match its request");return result;},staleTime:Infinity,retry:false});
 return {data:enabled&&ready?query.data:undefined,isPending:enabled&&(!ready||query.isPending),error:enabled&&ready?query.error:null,refetch:query.refetch};
}
