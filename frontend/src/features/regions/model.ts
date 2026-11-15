import type { ComparisonLocation } from "@/types";
import type { DiscoveryCandidateDetail, DiscoveryExport } from "@/services/discoveryEngine";
import type { DiscoveryProfile } from "@/features/discovery/adapter";

export interface RegionTarget { kind: "discovered" | "catalog"; id: string; runId?: string }
export interface RegionMeasurement { id: string; label: string; value: number | null; unit: string; method: string }
export interface MeasuredRegion {
  key: string; name: string; body: string; lat: number; lon: number;
  origin: string; baseline: string; measurements: RegionMeasurement[];
  notes: string[]; sources: {title: string; url: string}[];
}
export const regionKey = (target: RegionTarget) => target.kind === "discovered" ? `discovered:${target.runId}:${target.id}` : `catalog:${target.id}`;
export function catalogRegion(location: ComparisonLocation): MeasuredRegion {
  return {key: `catalog:${location.id}`, name: location.name, body: location.body, lat: location.lat, lon: location.lon_east,
    origin: "Catalog region", baseline: "catalog-profile-v1",
    measurements: location.measurements.filter(m => typeof m.value === "number" || m.is_missing).map(m => ({
      id: m.feature_id, label: m.label, value: m.is_missing || typeof m.value !== "number" ? null : m.value,
      unit: m.unit ?? "", method: [m.spatial_resolution, m.geographic_footprint?.description, m.uncertainty].filter(Boolean).join(" · ") })),
    notes: [location.coverage, "Catalog profiles use their own footprint and processing definitions. Do not substitute these values into discovery scoring."],
    sources: Object.values(location.sources).map(s => ({title:s.title, url:s.url ?? ""}))};
}
function profileMeasurements(profile: DiscoveryProfile | null): RegionMeasurement[] {
  return Object.entries(profile?.measurements ?? {}).map(([id,m]) => ({id, label:({slope_regional_median_deg:"Regional median slope",roughness_regional_m:"Detrended regional relief"} as Record<string,string>)[id] ?? id.replace(/_/g," "), value:m.value, unit:m.unit, method:"Derived regional terrain measurement"}));
}
export function discoveredRegion(candidate: DiscoveryCandidateDetail, runId: string): MeasuredRegion {
  return {key:regionKey({kind:"discovered",id:candidate.id,runId}), name:candidate.name, body:"earth", lat:candidate.lat, lon:candidate.lon_east,
    origin:`Discovered candidate · ${candidate.research_status.replace(/_/g," ")}`, baseline:`discovery:${runId}`,
    measurements:profileMeasurements(candidate.profile),
    notes:[`Terrain coverage ${(candidate.terrain_valid_fraction*100).toFixed(1)}%`,
      `Grid: ${JSON.stringify(candidate.profile?.grid ?? {})}`, ...candidate.screening_reasons, ...candidate.limitations,
      "Catalog-relative novelty is not proof of scientific novelty. Geology and operational suitability are not assessed."],
    sources:candidate.source_manifest.map(s => ({title:s.title,url:s.url}))};
}
export function referenceRegion(artifact: DiscoveryExport, runId: string): MeasuredRegion {
  return {key:`reference:${runId}`,name:"Jezero Crater · survey reference",body:"mars",lat:18.4447,lon:77.4508,
    origin:"Processed discovery reference",baseline:`discovery:${runId}`,measurements:profileMeasurements(artifact.reference_profile),
    notes:[`Reference grid: ${JSON.stringify(artifact.reference_profile.grid)}`,"Uses this survey's physical analysis grid, separate from the curated Jezero profile."],
    sources:artifact.provenance.map(s => ({title:s.title,url:s.url}))};
}
function canonical(value: number, unit: string): [number,string] {
  if(unit === "km")return [value*1000,"m"];
  return [value, ["degree","degrees","°"].includes(unit) ? "deg" : unit];
}
/** Descriptive deltas only for the same feature, compatible units and processing baseline. */
export function measurementDelta(a: MeasuredRegion, b: MeasuredRegion, id: string): {value:number;unit:string} | null {
  if(a.baseline !== b.baseline || !["slope_regional_median_deg", "roughness_regional_m"].includes(id))return null;
  const x=a.measurements.find(m=>m.id===id), y=b.measurements.find(m=>m.id===id);
  if(x?.value == null || y?.value == null)return null;
  const [v,u]=canonical(x.value,x.unit), [w,t]=canonical(y.value,y.unit);
  return u===t && Number.isFinite(v) && Number.isFinite(w) ? {value:v-w,unit:u} : null;
}
