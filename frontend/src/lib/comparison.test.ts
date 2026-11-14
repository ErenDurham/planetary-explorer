import { describe, expect, it } from "vitest";
import { measurement, terrainDifference } from "./comparison";
import catalog from "@/test/fixtures/comparison_catalog.json";
import type { ComparisonLocation } from "@/types";
const locations = catalog.locations as unknown as ComparisonLocation[];
const earth = locations.find(s => s.id === "haughton_crater")!;
const mars = locations.find(s => s.id === "elysium_planitia")!;
const moon = locations.find(s => s.id === "apollo_11")!;
describe("comparable terrain", () => {
  it("uses harmonised terrain only, not elevation or incompatible definitions", () => {
    const x = measurement(earth, "slope_regional_median_deg")!.value as number;
    const y = measurement(mars, "slope_regional_median_deg")!.value as number;
    expect(terrainDifference(earth, mars, "slope_regional_median_deg")).toBeCloseTo(Math.abs(x-y));
    expect(terrainDifference(earth, mars, "elevation_median_m")).toBeNull();
    expect(terrainDifference(earth, moon, "roughness_regional_m")).toBeNull();
  });
  it("preserves legitimate zero values and never converts missing values to zero", () => {
    expect(measurement(mars, "precipitation_mm_day")?.value).toBe(0);
    expect(measurement(mars, "surface_temperature_mean_c")).toBeUndefined();
    expect(measurement(moon, "slope_regional_median_deg")).toBeUndefined();
  });
});
