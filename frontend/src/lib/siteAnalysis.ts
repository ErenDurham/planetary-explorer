import type { SuitabilityResult } from "@/types";
export const preciseScore = (r: SuitabilityResult) => r.factor_scores.reduce((sum,f)=>sum+(f.weighted_contribution ?? 0),0);
export function alternativeFor(results: SuitabilityResult[], selectedId: string) {
  return results.find(r=>r.site_id!==selectedId && r.status==="ok");
}
export function factorDeltas(selected: SuitabilityResult, other: SuitabilityResult) {
  return selected.factor_scores.filter(f=>f.weighted_contribution!=null).map(f=>({criterionId:f.criterion_id,label:f.label,delta:(f.weighted_contribution ?? 0)-(other.factor_scores.find(o=>o.criterion_id===f.criterion_id)?.weighted_contribution ?? 0)}));
}
