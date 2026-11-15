// Discovery weights are USER INPUTS over whichever features the chosen survey
// scores; the service normalises and scores. Kept as integer shares summing to
// 100 so one slider move rebalances the others (lib/allocation). The feature
// set is NOT hardcoded here: a survey declares its own basis, and a share for a
// feature the survey does not score would be rejected by the service, so the
// criteria it returns are the only source of truth. Never mixed with the
// five-feature curated analog preferences.
import { setShare, toShares, type Shares } from "@/lib/allocation";
import type { DiscoveryCriterion } from "../adapter/types";

/** Shares from the run's defaults, in the run's own feature order. */
export function sharesFromDefaults(defaults: Record<string, number> | undefined): Shares {
  const entries = Object.entries(defaults ?? {});
  if (entries.length === 0) return {};
  return toShares(Object.fromEntries(entries.map(([id, value]) => [id, Number.isFinite(value) ? value : 0])));
}

/** Move one share, rebalancing the rest. A feature outside the current basis is ignored. */
export function setDiscoveryShare(shares: Shares, id: string, value: number): Shares {
  if (!Object.prototype.hasOwnProperty.call(shares, id)) return shares;
  return setShare(shares, id, Math.max(0, Math.min(100, Math.round(value))));
}

/** The request body's weights, from the shares. */
export function toRequestWeights(shares: Shares): Record<string, number> {
  return Object.fromEntries(Object.keys(shares).sort().map((id) => [id, shares[id] ?? 0]));
}

/** Stable identity of a weighting, for query keys. Order-independent. */
export function weightsKey(shares: Shares): string {
  return Object.keys(shares).sort().map((id) => `${id}:${shares[id] ?? 0}`).join("|");
}

/** Shares restricted to a survey's basis, so switching surveys cannot carry a stale feature over. */
export function alignToCriteria(shares: Shares, criteria: readonly DiscoveryCriterion[], defaults?: Record<string, number>): Shares {
  if (criteria.length === 0) return shares;
  const ids = criteria.map((c) => c.feature_id);
  const sameBasis = ids.length === Object.keys(shares).length && ids.every((id) => id in shares);
  if (sameBasis) return shares;
  const fallback = defaults ?? Object.fromEntries(ids.map((id) => [id, 100 / ids.length]));
  return sharesFromDefaults(Object.fromEntries(ids.map((id) => [id, fallback[id] ?? 0])));
}

export const TOP_K_MIN = 1;
export const TOP_K_MAX = 40;
export const TOP_K_DEFAULT = 6;
export function clampTopK(n: number): number { return Math.max(TOP_K_MIN, Math.min(TOP_K_MAX, Math.round(Number.isFinite(n) ? n : TOP_K_DEFAULT))); }
