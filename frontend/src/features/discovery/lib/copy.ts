// Fixed wording the contract asks for, in plain language. Nothing here claims
// novelty, safety, access or validation, and every number is the service's.
import type { DiscoveryCandidate, DiscoveryContextMeasurement, DiscoveryCriterion, DiscoveryDimensionScore, DiscoveryFeatureDistance, DiscoveryNovelty } from "../adapter/types";

export const PROPOSED_LABEL = "Proposed terrain analog candidate; field validation required.";
export const OFFLINE_NOTE = "This survey was processed earlier, offline, from cached Copernicus GLO-90 and MOLA terrain. Changing the weights re-orders that same set of footprints on the server; it does not search anywhere new.";
export const SEPARATE_SCORES_NOTE = "An index over the measured features this survey scores. It is not comparable with the curated five-feature analog scores, and it is not a probability or a confidence.";

/** The scored basis named from the run's own criteria, for the methods section. */
export function basisNote(criteria: readonly DiscoveryCriterion[]): string {
  if (criteria.length === 0) return SEPARATE_SCORES_NOTE;
  return `A ${criteria.length}-feature index over ${criteria.map(c => (c.label || c.feature_id).toLowerCase()).join(", ")}. ${SEPARATE_SCORES_NOTE}`;
}

export function formatKm(km: number): string {
  return km >= 100 ? `${Math.round(km).toLocaleString("en-US")} km` : `${km.toFixed(1)} km`;
}

/** The catalog relationship in plain words. The catalog is incomplete, so neither answer is a novelty claim. */
export function noveltyRelation(n: DiscoveryNovelty): { label: string; tone: "info" | "warn" | "neutral"; sentence: string } {
  const nearest = `${n.nearest_known_site_id.replace(/_/g, " ")}, ${formatKm(n.nearest_known_site_distance_km)} away`;
  if (n.outside_catalog_buffer) {
    return { label: "Not near a catalog location", tone: "info", sentence: `Not near a location in our current reference catalog (${n.catalog_version}); the nearest listed site is ${nearest}. The catalog is incomplete, so this is not a claim of novelty.` };
  }
  return { label: "Near a catalog location", tone: "warn", sentence: `Near a location already in our reference catalog (${n.catalog_version}): ${nearest}. Compare it with that documented site before treating it as new.` };
}

export function reviewStatusLabel(s: DiscoveryNovelty["review_status"]): string {
  return s === "desktop_reviewed" ? "Desktop review recorded (not field validation)" : "Desktop check not recorded; candidate literature review is tracked separately";
}

/** "Similarity: 68.5/100 ..." bound to the response's own dimensions and effective weights. */
export function similarityExplanation(c: Pick<DiscoveryCandidate, "similarity_index" | "dimension_scores">, referenceName: string, effectiveWeights: Record<string, number>, criteria?: readonly DiscoveryCriterion[]): string {
  const idx = c.similarity_index != null ? `${c.similarity_index.toFixed(1)}/100` : "not ranked";
  const emphasis = weightEmphasis(effectiveWeights, criteria ?? [], c.dimension_scores ?? []);
  const under = emphasis ? ` under a weighting of ${emphasis}` : "";
  return `Similarity: ${idx}. This is how closely the region's measured features match ${referenceName}${under}. It is not a probability of scientific suitability.`;
}

/** "60% terrain, 20% illumination and 20% water", from the weights the service actually used. */
export function weightEmphasis(effectiveWeights: Record<string, number>, criteria: readonly DiscoveryCriterion[], dimensions: readonly DiscoveryDimensionScore[]): string {
  const groups = new Map<string, number>();
  for (const dimension of dimensions) groups.set(dimension.group, Math.round(dimension.weight_share * 100));
  if (groups.size === 0) {
    for (const criterion of criteria) {
      const share = Math.round((effectiveWeights[criterion.feature_id] ?? 0) * 100);
      const group = criterion.group ?? "terrain";
      groups.set(group, (groups.get(group) ?? 0) + share);
    }
  }
  const parts = [...groups.entries()].filter(([, share]) => share > 0).map(([group, share]) => `${share}% ${group}`);
  if (parts.length === 0) return "";
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The strongest and weakest dimension, so a partial analog is never read as a whole one. */
export function dimensionVerdict(dimensions: readonly DiscoveryDimensionScore[]): string | null {
  if (dimensions.length < 2) return null;
  const sorted = [...dimensions].sort((a, b) => b.similarity_index - a.similarity_index);
  const best = sorted[0], worst = sorted[sorted.length - 1];
  if (Math.round(best.similarity_index) === Math.round(worst.similarity_index)) return null;
  return `Closest on ${best.label.toLowerCase()} (${best.similarity_index.toFixed(0)}/100); furthest on ${worst.label.toLowerCase()} (${worst.similarity_index.toFixed(0)}/100). An analog does not have to match on everything, and this one does not.`;
}

/** Dimensions measured but deliberately kept out of the index, each with the service's reason. */
export function unscoredDifferences(measurements: readonly DiscoveryContextMeasurement[] | undefined): DiscoveryContextMeasurement[] {
  return [...(measurements ?? [])];
}

const FEATURE_WORD: Record<string, string> = {
  slope_regional_median_deg: "slope", roughness_regional_m: "relief",
  slope_regional_p90_deg: "steep-tail slope", elevation_range_m: "elevation range",
  latitude_abs_deg: "distance from the equator", precipitation_mm_day: "precipitation",
};
function fmt(d: DiscoveryFeatureDistance, v: number): string {
  if (d.unit === "deg") return `${v.toFixed(2)}°`;
  if (d.unit === "mm/day") return `${v.toFixed(2)} mm/day`;
  if (d.unit === "W/m2") return `${Math.round(v)} W/m²`;
  return `${Math.round(v)} ${d.unit}`;
}

/** One sentence on why the terrain reads as similar, one on the larger difference; from the returned factor table only. */
export function similarityReasons(dists: DiscoveryFeatureDistance[] | undefined, referenceName: string): { similar: string | null; differs: string | null } {
  if (!dists?.length) return { similar: null, differs: null };
  const byContribution = [...dists].sort((a, b) => a.contribution - b.contribution);
  const closest = byContribution[0], furthest = byContribution[byContribution.length - 1];
  const word = (d: DiscoveryFeatureDistance) => FEATURE_WORD[d.feature_id] ?? d.feature_id.replace(/_/g, " ");
  const similar = `Regional ${word(closest)} is close: ${fmt(closest, closest.earth_value)} here against ${fmt(closest, closest.mars_value)} at ${referenceName}.`;  // closest on the weighted contribution, not the raw difference
  const differs = furthest !== closest ? `The larger difference is ${word(furthest)}: ${fmt(furthest, furthest.earth_value)} against ${fmt(furthest, furthest.mars_value)} at ${referenceName}, which costs most of the index.` : null;
  return { similar, differs };
}

/** Environmental factors the comparison did not include, from the candidate's own context fields. */
export function missingFactors(c: DiscoveryCandidate): string[] {
  const out: string[] = [];
  if (!c.context?.climate) out.push("climate");
  if (!c.context?.land_cover) out.push("land cover");
  out.push("geology and materials");
  return out;
}


export function coordinates(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(3)}°${lat < 0 ? "S" : "N"} · ${Math.abs(lon).toFixed(3)}°${lon < 0 ? "W" : "E"}`;
}

export function candidateTitle(candidate: { name: string; lat: number; lon_east: number }): string {
  return candidate.name.startsWith("Survey footprint ") ? coordinates(candidate.lat, candidate.lon_east) : candidate.name;
}

/** Dimensions measured on Earth that have no Mars counterpart in this release. */
export function incomparableNote(measurements: readonly DiscoveryContextMeasurement[] | undefined, referenceName: string): string | null {
  const absent = (measurements ?? []).filter(m => !m.comparable);
  if (absent.length === 0) return null;
  return `Measured here but not at ${referenceName} in this release: ${absent.map(m => m.label.toLowerCase()).join(", ")}. These are reported as differences and never enter the index.`;
}
