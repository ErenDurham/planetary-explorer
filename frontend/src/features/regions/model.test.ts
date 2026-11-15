import { expect, it } from "vitest";
import { catalogRegion, discoveredRegion, measurementDelta, regionKey, type MeasuredRegion } from "./model";
import { detail, candidates } from "@/features/discovery/test/fixtures";
import type { ComparisonLocation } from "@/types";
const region=(unit="m",value:number|null=150,baseline="discovery:run"):MeasuredRegion=>({key:"x",name:"x",body:"earth",lat:0,lon:0,origin:"test",baseline,measurements:[{id:"roughness_regional_m",label:"Relief",value,unit,method:"derived"}],notes:[],sources:[]});
it("converts compatible units before computing signed differences without rounding",()=>{
 expect(measurementDelta(region("m",150.1234),region("km",.1),"roughness_regional_m")).toEqual({value:50.123400000000004,unit:"m"});
});
it("does not compare incompatible units, missing data or different processing pipelines",()=>{
 expect(measurementDelta(region(),region("deg"),"roughness_regional_m")).toBeNull();
 expect(measurementDelta(region(),region("m",null),"roughness_regional_m")).toBeNull();
 expect(measurementDelta(region(),region("m",2,"catalog-profile-v1"),"roughness_regional_m")).toBeNull();
 expect(measurementDelta(region(),region(),"elevation_median_m")).toBeNull();
});
it("keeps discovered identifiers run-scoped and preserves measurements, coverage and limitations",()=>{
 const raw=detail(candidates[0].id), before=JSON.stringify(raw);
 const result=discoveredRegion(raw,"run-a");
 expect(result.key).not.toBe(discoveredRegion(raw,"run-b").key);
 expect(result.key).not.toBe(regionKey({kind:"catalog",id:raw.id}));
 expect(result.measurements[0].value).toBe(Object.values(raw.profile!.measurements)[0].value);
 expect(result.notes.join(" ")).toContain("Terrain coverage");
 expect(JSON.stringify(raw)).toBe(before);
});
it("preserves catalog missing values without fabricating zero",()=>{
 const result=catalogRegion({id:"earth",name:"Earth",body:"earth",lat:0,lon_east:0,coverage:"Incomplete",sources:{},measurements:[{feature_id:"roughness_regional_m",label:"Relief",value:99,is_missing:true,unit:"m"}]} as ComparisonLocation);
 expect(result.measurements[0].value).toBeNull();
});
