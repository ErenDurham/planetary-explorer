import type { ComparisonLocation } from "@/types";
import type { DiscoveryProfile, DiscoverySource } from "@/features/discovery/adapter";
import type { MeasuredRegion } from "./model";

/** Present measured discovery data through the existing atlas location contract. */
export function atlasLocation(region:MeasuredRegion, profile:DiscoveryProfile|null, provenance:DiscoverySource[]):ComparisonLocation {
  return {id:region.key,body:region.body as "earth"|"mars",name:region.name,region:region.origin,
    description:region.notes.join(" "),lat:region.lat,lon_east:region.lon,
    coverage:profile ? `Terrain coverage ${(profile.terrain_valid_fraction*100).toFixed(1)}% · discovery physical grid` : "Measured profile unavailable",
    measurements:region.measurements.map(m=>({feature_id:m.id,label:m.label,category:"ground",value:m.value,unit:m.unit,
      measurement_type:"derived",quality_flag:"regional_scale_only",is_missing:m.value==null,
      spatial_resolution:typeof profile?.grid.cell_m==="number" ? `${profile.grid.cell_m/1000} km analysis cells` : "See recorded grid specification",
      notes:"Regional terrain measurement; geology and operational suitability are not assessed."})),
    sources:Object.fromEntries(provenance.map(s=>[s.source_id,{...s}])),source_ids:provenance.map(s=>s.source_id)};
}
