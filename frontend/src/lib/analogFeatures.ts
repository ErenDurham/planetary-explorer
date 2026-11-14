// The five analog-match features the UI lets the user weight, in display
// order, with the analog spec's default weights (analog-v1.0). These are the
// ONLY features an analog preference slider ever shows: top-of-atmosphere
// insolation is deliberately informational (weight 0, never a slider) because
// the Earth/Mars insolation gap is a planetary constant, not a site property,
// and elevation / thermal never enter analog matching at all.
//
// Analog preferences are a different control from the landing priorities
// (lib/objective.ts PRIORITY_GUIDE). Nothing here is ever transferred between
// the two.
import { toShares, type Shares } from "@/lib/allocation";

export type Body = "earth" | "mars";

export interface AnalogFeatureSpec {
  id: string;
  /** Short preference label shown on the slider. */
  label: string;
  /** What "similar" means for this feature, in one sentence. */
  description: string;
  /** Analog spec default weight (raw; the spec normalises). */
  defaultWeight: number;
}

export const ANALOG_FEATURES: readonly AnalogFeatureSpec[] = [
  { id: "slope_regional_median_deg", label: "Similar slopes", description: "Regional median slope at the harmonised ~3.7 km scale.", defaultWeight: 25 },
  { id: "roughness_regional_m", label: "Similar regional relief", description: "Detrended relief once the broad terrain tilt is removed.", defaultWeight: 25 },
  { id: "terrain_morphology", label: "Similar landforms", description: "Documented landform tags; a shared tag is a shared description, not identical terrain.", defaultWeight: 20 },
  { id: "mineralogy_tags", label: "Similar materials", description: "Documented composition tags; not a quantitative mineral abundance.", defaultWeight: 20 },
  { id: "precipitation_mm_day", label: "Dryness", description: "Closeness to Mars' effectively zero precipitation (Earth climatology).", defaultWeight: 10 },
] as const;

export const ANALOG_FEATURE_IDS: readonly string[] = ANALOG_FEATURES.map((f) => f.id);

/** Informational only: shown as a note, never as an active slider. */
export const INSOLATION_FEATURE_ID = "insolation_toa_annual_mean_wm2";
export const INSOLATION_NOTE =
  "Top-of-atmosphere insolation is shown for information only and carries no weight: the Earth/Mars insolation gap is a planetary constant, so it would rank every candidate the same way.";

/** Spec defaults as integer shares summing to 100. */
export function defaultAnalogShares(): Shares {
  return toShares(Object.fromEntries(ANALOG_FEATURES.map((f) => [f.id, f.defaultWeight])));
}

/** Normalise any partial / raw analog weight record to shares over the five
 * supported features. Unknown feature ids are dropped; missing ones are 0. An
 * all-zero record falls back to the spec defaults (never an all-zero state). */
export function toAnalogShares(weights: Record<string, number> | null | undefined, unavailable: Iterable<string> = []): Shares {
  if (!weights) return defaultAnalogShares();
  const picked: Shares = {};
  for (const f of ANALOG_FEATURES) picked[f.id] = Math.max(0, Number(weights[f.id]) || 0);
  const positive = Object.values(picked).some((v) => v > 0);
  return positive ? toShares(picked, unavailable) : defaultAnalogShares();
}

export function analogFeatureLabel(id: string, fallback?: string): string {
  return ANALOG_FEATURES.find((f) => f.id === id)?.label ?? fallback ?? id.replace(/_/g, " ");
}

export function otherBody(body: Body): Body {
  return body === "earth" ? "mars" : "earth";
}

export const BODY_NAME: Record<Body, string> = { earth: "Earth", mars: "Mars" };
