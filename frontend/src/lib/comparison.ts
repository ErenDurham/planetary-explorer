import type { ComparisonLocation, EnvironmentalMeasurement } from "@/types";

export type ComparisonMode = "all" | "earth-mars" | "earth-moon" | "mars-moon";
export type BodyId = ComparisonLocation["body"];
export const COMPARISON_MODES: { id: ComparisonMode; label: string; bodies: BodyId[] }[] = [
  { id: "all", label: "All three", bodies: ["earth", "mars", "moon"] },
  { id: "earth-mars", label: "Earth ↔ Mars", bodies: ["earth", "mars"] },
  { id: "earth-moon", label: "Earth ↔ Moon", bodies: ["earth", "moon"] },
  { id: "mars-moon", label: "Mars ↔ Moon", bodies: ["mars", "moon"] },
];
export function measurement(location: ComparisonLocation, feature: string): EnvironmentalMeasurement | undefined {
  return location.measurements.find(m => m.feature_id === feature && !m.is_missing && m.value !== null);
}
/** Only harmonised terrain metrics may produce a local numeric difference. */
export function terrainDifference(a: ComparisonLocation, b: ComparisonLocation, feature: string): number | null {
  if (!["slope_regional_median_deg", "roughness_regional_m"].includes(feature)) return null;
  const x = measurement(a, feature), y = measurement(b, feature);
  if (!x || !y || x.unit !== y.unit || typeof x.value !== "number" || typeof y.value !== "number") return null;
  return Math.abs(x.value - y.value);
}
