import type { MissionRequirements } from "@/types";
export type MissionType = "landing" | "research" | "rover_field_test" | "base_planning";
export type AssessmentType = Exclude<MissionType,"landing">;
export const MISSION_TYPES: {id:MissionType;label:string}[] = [
  {id:"landing",label:"Mars landing screening"},{id:"research",label:"Research-site selection"},
  {id:"rover_field_test",label:"Rover field testing"},{id:"base_planning",label:"Base planning · evidence review"},
];
export const PROFILE_CRITERIA: Record<AssessmentType,{id:string;label:string;description:string}[]> = {
 research:[{id:"materials",label:"Target materials",description:"How many of your chosen materials appear in the site labels."},{id:"landforms",label:"Target landforms",description:"How many of your chosen landforms appear in the site labels."}],
 rover_field_test:[{id:"slope",label:"Target regional slope",description:"How close the site is to your target median slope, on a ~3.7 km baseline."},{id:"relief",label:"Target regional relief",description:"How close the site is to your target detrended relief, on the same baseline."}],base_planning:[],
};
export const DEFAULT_PROFILE_WEIGHTS:Record<AssessmentType,Record<string,number>>={research:{materials:60,landforms:40},rover_field_test:{slope:50,relief:50},base_planning:{}};
export function defaultRequirements():MissionRequirements {return {material_targets:[],landform_targets:[],slope_target_deg:1,slope_tolerance_deg:5,relief_target_m:100,relief_tolerance_m:300};}
export function missionViewMode(body:"earth"|"mars",type:MissionType):"mission_browse"|"landing_suitability" {return body === "mars" && type === "landing" ? "landing_suitability" : "mission_browse";}
