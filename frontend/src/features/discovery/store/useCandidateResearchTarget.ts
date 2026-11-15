import { create } from "zustand";
export const useCandidateResearchTarget = create<{target:{runId:string;candidateId:string}|null;open:(runId:string,candidateId:string)=>void}>(set => ({target:null,open:(runId,candidateId)=>set({target:{runId,candidateId}})}));
