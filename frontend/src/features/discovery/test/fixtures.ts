// Test-only fakes for the discovery service. Never imported by production code.
import { DiscoveryUnavailable, DiscoveryRequestRejected, type DiscoveryCapabilities, type DiscoveryCandidate, type DiscoveryCandidateDetail, type DiscoveryExport, type DiscoveryRankRequest, type DiscoveryRankResponse, type DiscoveryService } from "../adapter";

export const reference = { body: "mars" as const, id: "jezero_crater" as const, name: "Jezero Crater", lat: 18.4447, lon_east: 77.4508 };
export const criteria = [
  { feature_id: "slope_regional_median_deg", label: "Regional median slope", unit: "deg", scale: 1.5, group: "terrain", group_label: "Terrain and landform", rationale: "Typical regional gradient." },
  { feature_id: "roughness_regional_m", label: "Detrended regional relief", unit: "m", scale: 100, group: "terrain", group_label: "Terrain and landform", rationale: "Relief after removing the regional plane." },
  { feature_id: "precipitation_mm_day", label: "Mean precipitation", unit: "mm/day", scale: 1, group: "water", group_label: "Water and aridity", rationale: "Liquid water reaching the surface." },
];
export const regions = [
  { id: "morocco_east", name: "Eastern Morocco", locale: "Morocco", bounds: { west: -3, south: 31, east: -2, north: 32 }, hypothesis: "Inland semi-arid regional terrain.", sampled: 9 },
  { id: "tademait", name: "Tademait Plateau", locale: "Algeria", bounds: { west: 2, south: 28, east: 3, north: 29 }, hypothesis: "Hyperarid stony desert pavement.", sampled: 7 },
];
export const run = { run_id: "pilot_2026_11_14", label: "Eastern Morocco pilot", created_at: "2026-11-14T22:00:00Z", bounds: { west: -3, south: 31, east: -2, north: 32 }, total_sampled: 16, eligible_count: 3, region_count: 2, regions, criteria, default_weights: { slope_regional_median_deg: 40, roughness_regional_m: 40, precipitation_mm_day: 20 } };
export const source = { source_id: "glo90", title: "Copernicus GLO-90 DEM", institution: "ESA / Airbus", url: "https://copernicus-dem-90m.s3.amazonaws.com/readme.html", license: "Copernicus DEM licence", retrieved_at: "2026-11-14", observation_period: "2011-2015 (TanDEM-X)", sha256: null, etag: null };

export const capabilities: DiscoveryCapabilities = { engine_version: "discovery-v2", state: "ready", reference, runs: [run], criteria, default_weights: { slope_regional_median_deg: 40, roughness_regional_m: 40, precipitation_mm_day: 20 }, limitations: ["Proposed regional terrain analog candidates; field validation required."] };
export const unavailableCapabilities: DiscoveryCapabilities = { ...capabilities, state: "unavailable", runs: [] };

function square(lat: number, lon: number, half = 0.27) {
  return { type: "Polygon", coordinates: [[[lon - half, lat - half], [lon + half, lat - half], [lon + half, lat + half], [lon - half, lat + half], [lon - half, lat - half]]] };
}
export function candidate(id: string, lat: number, lon: number, rank: number, sim: number, extra: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  return { research_status: "unresearched", id, name: `Footprint ${id}`, lat, lon_east: lon, footprint_geojson: square(lat, lon), raw_rank: rank, display_rank: rank, distance: 100 / sim - 1, similarity_index: sim,
    feature_distances: [{ feature_id: "slope_regional_median_deg", earth_value: 1.3, mars_value: 1.077, unit: "deg", scale: 1.5, normalized_weight: 0.5, distance: 0.149, contribution: 0.074 }, { feature_id: "roughness_regional_m", earth_value: 150.2, mars_value: 194.4, unit: "m", scale: 100, normalized_weight: 0.5, distance: 0.442, contribution: 0.221 }],
    dimension_scores: [
      { group: "terrain", label: "Terrain and landform", feature_ids: ["slope_regional_median_deg", "roughness_regional_m"], weight_share: 0.8, distance: 0.37, similarity_index: 73 },
      { group: "water", label: "Water and aridity", feature_ids: ["precipitation_mm_day"], weight_share: 0.2, distance: 0.09, similarity_index: 91.7 },
    ],
    terrain_valid_fraction: 0.99, novelty: { catalog_version: "known-analogs-v1", nearest_known_site_id: "atacama_yungay", nearest_known_site_distance_km: 8120, buffer_rule: "100 km centre buffer", outside_catalog_buffer: true, review_status: "not_reviewed" },
    context: { climate: null, land_cover: null, geology_status: "not_assessed", measurements: [
      { feature_id: "insolation_toa_annual_mean_wm2", label: "Annual-mean insolation (top of atmosphere)", group: "illumination", earth_value: 368.9, mars_value: 170.4, unit: "W/m2", comparable: true, note: "Earth receives about 2.2 times Jezero's flux." },
      { feature_id: "surface_temperature_mean_c", label: "Mean air temperature", group: "thermal", earth_value: 23.9, mars_value: null, unit: "degC", comparable: false, note: "No measured Mars surface temperature in this release." },
    ] }, sources: [source], limitations: ["4 km cells do not resolve rover hazards."], ...extra };
}
export const candidates = [candidate("c_31_25_m2_75", 31.25, -2.75, 1, 77.1), candidate("c_31_75_m2_25", 31.75, -2.25, 2, 61.4), candidate("c_31_25_m2_25", 31.25, -2.25, 3, 44.0)];

export function rankResponse(req: DiscoveryRankRequest, list: DiscoveryCandidate[] = candidates): DiscoveryRankResponse {
  const w = req.weights ?? { slope_regional_median_deg: 50, roughness_regional_m: 50 };
  // a FAKE: order flips when relief dominates, so a weight change is observable; numbers are fixture numbers, not science
  const ordered = w.roughness_regional_m > w.slope_regional_median_deg ? [...list].reverse().map((c, i) => ({ ...c, display_rank: i + 1, raw_rank: i + 1 })) : list;
  return { engine_version: "discovery-v1", run_id: req.run_id, reference, survey: { bounds: run.bounds, generated_count: 16, terrain_valid_count: 14, eligible_count: 3, exclusion_counts: { insufficient_terrain_coverage: 2, within_catalog_buffer: 1, land_cover_preference: 10 }, sampling_centres: Array.from({ length: 16 }, (_, i) => ({ id: `s${i}`, lat: 31.125 + 0.25 * Math.floor(i / 4), lon_east: -2.875 + 0.25 * (i % 4), status: i < 3 ? "eligible" : "excluded" })), grid_specification: { cell_m: 4000, crs: "local equal-area" }, footprint_specification: { width_m: 60000, height_m: 60000 }, dataset_versions: { glo90: "2021_1", mola: "MEGT90N000EB" }, spec_version: "discovery-spec-1", diversification: { min_separation_km: 40 } }, basis_features: ["slope_regional_median_deg", "roughness_regional_m"], effective_weights: { slope_regional_median_deg: w.slope_regional_median_deg / 100, roughness_regional_m: w.roughness_regional_m / 100 }, eligible_pool_count: 3, returned_count: ordered.slice(0, req.top_k).length, candidates: ordered.slice(0, req.top_k), client_request_id: req.client_request_id ?? null, limitations: ["Similarity is a two-feature heuristic index."] };
}
export function detail(id: string): DiscoveryCandidateDetail {
  const c = candidates.find(x => x.id === id) ?? candidates[0];
  return { ...c, raw_rank: null, display_rank: null, distance: null, similarity_index: null, feature_distances: [], profile: { measurements: { slope_regional_median_deg: { value: 1.3, unit: "deg", measurement_type: "derived" }, roughness_regional_m: { value: 150.2, unit: "m", measurement_type: "derived" } }, grid: { cell_m: 4000 }, terrain_valid_fraction: 0.99, gradient_valid_fraction: 0.97 }, screening_reasons: ["terrain coverage 99% >= 95%"], source_manifest: [source], proposed_field_validation: ["Acquire higher-resolution DEM over the footprint before any traverse rehearsal."] };
}
export const exportPayload: DiscoveryExport = { manifest: { run_id: run.run_id }, specification: {}, survey: rankResponse({ run_id: run.run_id, reference_id: "jezero_crater", top_k: 5 }).survey, reference_profile: { measurements: {}, grid: {}, terrain_valid_fraction: 1, gradient_valid_fraction: 1 }, audit_rows: candidates.map(c => ({ candidate: { ...c, display_rank: null, raw_rank: null, distance: null, similarity_index: null }, profile: null, screening_reasons: [] })), exclusions: { insufficient_terrain_coverage: 2 }, provenance: [source], validation: {} };

export function connectedService(overrides: Partial<DiscoveryService> = {}): DiscoveryService & { calls: DiscoveryRankRequest[] } {
  const calls: DiscoveryRankRequest[] = [];
  return { calls, capabilities: async () => capabilities, rank: async (req) => { calls.push(req); return rankResponse(req); }, detail: async (_r, id) => detail(id), export: async () => exportPayload, ...overrides };
}
export const unavailableService: DiscoveryService = { capabilities: async () => unavailableCapabilities, rank: async () => { throw new DiscoveryUnavailable("no artifacts"); }, detail: async () => { throw new DiscoveryUnavailable("no artifacts"); }, export: async () => { throw new DiscoveryUnavailable("no artifacts"); } };
export const deadService: DiscoveryService = { capabilities: async () => { throw new DiscoveryUnavailable("The discovery service could not be reached."); }, rank: async () => { throw new DiscoveryUnavailable("unreachable"); }, detail: async () => { throw new DiscoveryUnavailable("unreachable"); }, export: async () => { throw new DiscoveryUnavailable("unreachable"); } };
export const rejecting = new DiscoveryRequestRejected("validation_error", "request failed schema validation: weights must have a positive total");
