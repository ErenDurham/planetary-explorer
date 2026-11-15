// Fixed wording the contract asks for, in plain language. Nothing here claims
// novelty, safety, access or validation, and every number is the service's.
import type { DiscoveryCandidate, DiscoveryFeatureDistance, DiscoveryNovelty } from "../adapter/types";

export const PROPOSED_LABEL = "Proposed terrain analog. It still needs field validation.";
export const OFFLINE_NOTE = "This survey was processed earlier and offline, from cached Copernicus GLO-90 and MOLA terrain. Changing the weights re-orders the same footprints on the server. It does not search anywhere new.";
export const SEPARATE_SCORES_NOTE = "This is a two-feature terrain index. It only uses slope and detrended relief. It cannot be compared with the five-feature analog scores. It is not a probability or a confidence level.";

export function formatKm(km: number): string {
  return km >= 100 ? `${Math.round(km).toLocaleString("en-US")} km` : `${km.toFixed(1)} km`;
}

/** The catalog relationship in plain words. The catalog is incomplete, so neither answer is a novelty claim. */
export function noveltyRelation(n: DiscoveryNovelty): { label: string; tone: "info" | "warn" | "neutral"; sentence: string } {
  const nearest = `${n.nearest_known_site_id.replace(/_/g, " ")}, ${formatKm(n.nearest_known_site_distance_km)} away`;
  if (n.outside_catalog_buffer) {
    return { label: "Not near a catalog location", tone: "info", sentence: `This site is not near any location in our reference catalog (${n.catalog_version}). The nearest listed site is ${nearest}. The catalog is incomplete, so this does not prove the site is new.` };
  }
  return { label: "Near a catalog location", tone: "warn", sentence: `This site is near a location in our reference catalog (${n.catalog_version}): ${nearest}. Compare it with that site before treating it as new.` };
}

export function reviewStatusLabel(s: DiscoveryNovelty["review_status"]): string {
  return s === "desktop_reviewed" ? "A desktop review is recorded. This is not field validation." : "No desktop check is recorded. The literature review is tracked separately.";
}

/** "Terrain similarity: 68.5/100. This reflects how closely ..." bound to the response's effective weights. */
export function similarityExplanation(c: Pick<DiscoveryCandidate, "similarity_index">, referenceName: string, effectiveWeights: Record<string, number>): string {
  const w = (id: string) => Math.round((effectiveWeights[id] ?? 0) * 100);
  const idx = c.similarity_index != null ? `${c.similarity_index.toFixed(1)}/100` : "not ranked";
  return `Terrain similarity: ${idx}. It shows how closely the region's measured slope and relief match ${referenceName} with the selected weights (slope ${w("slope_regional_median_deg")}%, relief ${w("roughness_regional_m")}%). It is not a probability of scientific suitability.`;
}

const FEATURE_WORD: Record<string, string> = { slope_regional_median_deg: "slope", roughness_regional_m: "relief" };
function fmt(d: DiscoveryFeatureDistance, v: number): string { return d.unit === "deg" ? `${v.toFixed(2)}°` : `${Math.round(v)} ${d.unit}`; }

/** One sentence on why the terrain reads as similar, one on the larger difference; from the returned factor table only. */
export function similarityReasons(dists: DiscoveryFeatureDistance[] | undefined, referenceName: string): { similar: string | null; differs: string | null } {
  if (!dists?.length) return { similar: null, differs: null };
  const byContribution = [...dists].sort((a, b) => a.contribution - b.contribution);
  const closest = byContribution[0], furthest = byContribution[byContribution.length - 1];
  const word = (d: DiscoveryFeatureDistance) => FEATURE_WORD[d.feature_id] ?? d.feature_id.replace(/_/g, " ");
  const similar = `Regional ${word(closest)} is close: ${fmt(closest, closest.earth_value)} here against ${fmt(closest, closest.mars_value)} at ${referenceName}.`;
  const differs = furthest !== closest ? `The larger difference is ${word(furthest)}: ${fmt(furthest, furthest.earth_value)} against ${fmt(furthest, furthest.mars_value)} at ${referenceName}. This difference costs most of the index.` : null;
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
