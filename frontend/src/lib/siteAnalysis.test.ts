import { describe, expect, it } from "vitest";
import fixture from "@/test/fixtures/api_examples.json";
import { alternativeFor, factorDeltas, preciseScore } from "./siteAnalysis";
import { missionKey } from "./mission";
import type { EvaluateResponse } from "@/types";
const evaluation=fixture.evaluate as unknown as EvaluateResponse;
describe("site decision analysis",()=>{
  it("selects a real ranked alternative and reconciles factor differences with the score gap",()=>{
    const mine=evaluation.results[0];const other=alternativeFor(evaluation.results,mine.site_id)!;
    expect(other.site_id).not.toBe(mine.site_id);expect(other.status).toBe("ok");
    expect(factorDeltas(mine,other).reduce((s,d)=>s+d.delta,0)).toBeCloseTo(preciseScore(mine)-preciseScore(other),10);
    const saturated=mine.factor_scores.find(f=>f.suitability===1 && other.factor_scores.some(o=>o.criterion_id===f.criterion_id && o.suitability===1));
    if(saturated)expect(factorDeltas(mine,other).find(d=>d.criterionId===saturated.criterion_id)?.delta).toBeCloseTo(0);
  });
  it("does not reuse evaluation keys for different hard constraints, policies or fractional shares",()=>{
    const m=evaluation.mission;const changed=structuredClone(m);
    changed.hard_constraints=[{constraint_id:"new",feature_id:"elevation_median_m",operator:"<=",threshold:0,rationale:"Test",is_assumption:true}];
    expect(missionKey(m)).not.toBe(missionKey(changed));
    changed.criteria[0].weight+=.01;expect(missionKey({...changed,criteria:m.criteria})).not.toBe(missionKey(changed));
  });
});
