// Discovery weights are USER INPUTS over exactly two terrain features; the
// service normalises and scores. Kept as integer shares summing to 100 so one
// slider move rebalances the other (lib/allocation). Never mixed with the
// five-feature curated analog preferences.
import { setShare, toShares, type Shares } from "@/lib/allocation";
import { DISCOVERY_WEIGHT_IDS, type DiscoveryWeights } from "../adapter/types";

export const SLOPE_ID = "slope_regional_median_deg" as const;
export const RELIEF_ID = "roughness_regional_m" as const;

export function sharesFromDefaults(defaults: Record<string, number> | undefined): Shares {
  const base: Shares = { [SLOPE_ID]: defaults?.[SLOPE_ID] ?? 50, [RELIEF_ID]: defaults?.[RELIEF_ID] ?? 50 };
  return toShares(base);
}

export function setDiscoveryShare(shares: Shares, id: string, value: number): Shares {
  if (!(DISCOVERY_WEIGHT_IDS as readonly string[]).includes(id)) return shares;
  return setShare(shares, id, Math.max(0, Math.min(100, Math.round(value))));
}

/** The request body's weights, from the shares. */
export function toRequestWeights(shares: Shares): DiscoveryWeights {
  return { slope_regional_median_deg: shares[SLOPE_ID] ?? 0, roughness_regional_m: shares[RELIEF_ID] ?? 0 };
}

export function weightsKey(shares: Shares): string {
  return `${SLOPE_ID}:${shares[SLOPE_ID] ?? 0}|${RELIEF_ID}:${shares[RELIEF_ID] ?? 0}`;
}

export const TOP_K_MIN = 1;
export const TOP_K_MAX = 20;
export const TOP_K_DEFAULT = 5;
export function clampTopK(n: number): number { return Math.max(TOP_K_MIN, Math.min(TOP_K_MAX, Math.round(Number.isFinite(n) ? n : TOP_K_DEFAULT))); }
