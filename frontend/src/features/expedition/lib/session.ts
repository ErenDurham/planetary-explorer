// Session history of computed plans, so a user can revise inputs and compare
// routes. A "delta" here is the difference between two numbers the service
// returned; it is display arithmetic, not a new scientific result.
import type { PlanMetrics, PlanResponse } from "../adapter/types";

export interface PlanRun {
  /** 1-based run number within the session, for labels such as "Route 3". */
  run: number;
  plan: PlanResponse;
  /** Snapshot of the inputs that produced it, for the comparison table. */
  inputs: { waypoints: number; targets: number; optimization: string; roverProfile: string | null };
}

export type MetricKey = Exclude<keyof PlanMetrics, "targets_reached" | "targets_unreached">;

export const METRIC_SPECS: ReadonlyArray<{ key: MetricKey; label: string; unit: string; digits: number; /** Which direction reads as better, for the delta tone; null = neither. */ lowerIsBetter: boolean | null }> = [
  { key: "total_distance_m", label: "Total distance", unit: "m", digits: 0, lowerIsBetter: null },
  { key: "traverse_time_hours", label: "Traverse time", unit: "h", digits: 1, lowerIsBetter: null },
  { key: "driving_sols", label: "Driving sols", unit: "sols", digits: 0, lowerIsBetter: null },
  { key: "energy_wh", label: "Energy consumption", unit: "Wh", digits: 0, lowerIsBetter: true },
  { key: "elevation_gain_m", label: "Elevation gain", unit: "m", digits: 0, lowerIsBetter: null },
  { key: "elevation_loss_m", label: "Elevation loss", unit: "m", digits: 0, lowerIsBetter: null },
  { key: "slope_mean_deg", label: "Mean slope", unit: "°", digits: 1, lowerIsBetter: true },
  { key: "slope_p95_deg", label: "95th percentile slope", unit: "°", digits: 1, lowerIsBetter: true },
  { key: "slope_max_deg", label: "Maximum slope", unit: "°", digits: 1, lowerIsBetter: true },
];

/** Format a service metric; null is "No data", never 0. Kilometres above 10 km. */
export function formatMetric(value: number | null | undefined, spec: { unit: string; digits: number }): string {
  if (value == null || !Number.isFinite(value)) return "No data";
  if (spec.unit === "m" && Math.abs(value) >= 10_000) return `${(value / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} km`;
  const n = value.toLocaleString("en-US", { maximumFractionDigits: spec.digits, minimumFractionDigits: spec.unit === "°" || spec.unit === "h" ? spec.digits : 0 });
  return spec.unit === "°" ? `${n}°` : spec.unit === "sols" && value === 1 ? `${n} sol` : `${n} ${spec.unit}`;
}

export function metricDelta(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a - b;
}

export function signed(value: number, digits: number): string {
  const n = Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: digits });
  return value > 0 ? `+${n}` : value < 0 ? `−${n}` : "±0";
}
