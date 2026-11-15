// Fixed wording the contract asks for. Nothing here claims novelty, safety,
// access or validation.
import type { DiscoveryNovelty } from "../adapter/types";

export const PROPOSED_LABEL = "Proposed terrain analog candidate; field validation required.";
export const OFFLINE_NOTE = "Surveys are processed offline from cached Copernicus GLO-90 and MOLA terrain and published as immutable artifacts. Ranking here re-orders that fixed pool on the server; nothing is scanned live and no new regions are generated on request.";
export const SEPARATE_SCORES_NOTE = "A two-feature terrain index (slope and detrended relief only). It is not comparable with the curated five-feature analog scores and is not a probability or confidence.";

export function noveltyRelation(n: DiscoveryNovelty): { label: string; tone: "info" | "warn" | "neutral"; sentence: string } {
  if (n.outside_catalog_buffer) {
    return { label: "Outside catalog buffer", tone: "info", sentence: `Outside the buffer of the versioned known-analog catalog ${n.catalog_version}; nearest listed site ${n.nearest_known_site_id} at ${formatKm(n.nearest_known_site_distance_km)}. Buffer rule: ${n.buffer_rule}. This is a catalog relationship, not scientific novelty.` };
  }
  return { label: "Within catalog buffer", tone: "warn", sentence: `Within the buffer of ${n.nearest_known_site_id} (${formatKm(n.nearest_known_site_distance_km)} away) in catalog ${n.catalog_version}. Buffer rule: ${n.buffer_rule}.` };
}

export function reviewStatusLabel(s: DiscoveryNovelty["review_status"]): string {
  return s === "desktop_reviewed" ? "Desktop review recorded (not field validation)" : "Desktop check not recorded; candidate literature review is tracked separately";
}

export function formatKm(km: number): string {
  return km >= 100 ? `${Math.round(km).toLocaleString("en-US")} km` : `${km.toFixed(1)} km`;
}
