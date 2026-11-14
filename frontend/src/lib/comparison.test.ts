import { describe, expect, it } from "vitest";
import { canMatchScale, emphasisSummary, findPairCandidate, footprintBox, footprintHalfWidthDeg, linkedZoom, measurement, metresPerPixel, pairColumns, pointPosition, relationshipLabel, scaleBar, splitTags, terrainDifference } from "./comparison";
import catalog from "@/test/fixtures/comparison_catalog.json";
import rankAtacama from "@/test/fixtures/analog_rank_atacama.json";
import type { AnalogRankResponse, ComparisonLocation, ImageryEntry } from "@/types";
const locations = catalog.locations as unknown as ComparisonLocation[];
const earth = locations.find(s => s.id === "haughton_crater")!;
const mars = locations.find(s => s.id === "elysium_planitia")!;
const moon = locations.find(s => s.id === "apollo_11")!;
const bounds = { west: 10, east: 11, south: 20, north: 20.5, source: "test grid" };
const orbital = { entry_id: "a", view: "orbital", bounds } as unknown as ImageryEntry;
const orbitalNoBounds = { entry_id: "b", view: "orbital", bounds: null } as unknown as ImageryEntry;
const surface = { entry_id: "c", view: "surface", bounds: null } as unknown as ImageryEntry;

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

describe("pair columns", () => {
  it("puts the objective's selection body first and the reference second, with roles labelled", () => {
    expect(pairColumns("earth").map(c => [c.body, c.role, c.label])).toEqual([["earth", "selected", "Selected on Earth"], ["mars", "reference", "Reference on Mars"]]);
    expect(pairColumns("mars").map(c => c.label)).toEqual(["Selected on Mars", "Reference on Earth"]);
  });
  it("swapping reverses display order only; roles stay with their bodies", () => {
    const [first, second] = pairColumns("earth", true);
    expect(first).toEqual({ body: "mars", role: "reference", label: "Reference on Mars" });
    expect(second).toEqual({ body: "earth", role: "selected", label: "Selected on Earth" });
  });
  it("looks the pair's candidate up by id in the ranked pool, never the top match", () => {
    const rank = rankAtacama as unknown as AnalogRankResponse;
    const c = findPairCandidate(rank, "elysium_planitia")!;
    expect(c.location.id).toBe("elysium_planitia");
    expect(c.rank).not.toBe(1);
    expect(findPairCandidate(rank, "nope")).toBeUndefined();
    expect(findPairCandidate(undefined, "elysium_planitia")).toBeUndefined();
  });
});

describe("georeferencing", () => {
  it("computes metres per pixel from the N-S extent with the body's own degree length", () => {
    expect(metresPerPixel(bounds, 340, "earth")).toBeCloseTo((0.5 * 111.19 * 1000) / 340, 6);
    expect(metresPerPixel(bounds, 340, "mars")).toBeCloseTo((0.5 * 59.27 * 1000) / 340, 6);
    expect(metresPerPixel(null, 340, "earth")).toBeNull();
    expect(metresPerPixel(bounds, 0, "earth")).toBeNull();
  });
  it("picks a round scale bar no longer than the limit", () => {
    const bar = scaleBar(163.5, 140)!;
    expect(bar.km).toBe(20);
    expect(bar.px).toBeLessThanOrEqual(140);
    expect(bar.label).toBe("20 km");
    expect(scaleBar(2, 140)!.label).toBe("200 m");
    expect(scaleBar(null)).toBeNull();
  });
  it("places the point and clips the footprint to the image bounds", () => {
    expect(pointPosition(bounds, 20.25, 10.5)).toEqual({ xPct: 50, yPct: 50 });
    expect(pointPosition(bounds, 30, 10.5)).toBeNull();
    const inside = footprintBox(bounds, 20.25, 10.5, 0.1)!;
    expect(inside.clipped).toBe(false);
    expect(inside.widthPct).toBeCloseTo(20); expect(inside.heightPct).toBeCloseTo(40);
    const clipped = footprintBox(bounds, 20.25, 10.5, 0.5)!;
    expect(clipped.clipped).toBe(true);
    expect(clipped.leftPct).toBe(0); expect(clipped.widthPct).toBe(100); expect(clipped.heightPct).toBe(100);
    expect(footprintBox(bounds, 40, 10.5, 0.25)).toBeNull();
    expect(footprintBox(null, 20.25, 10.5, 0.25)).toBeNull();
  });
  it("links scale only for two georeferenced orbital entries", () => {
    expect(canMatchScale(orbital, orbital)).toBe(true);
    expect(canMatchScale(orbital, orbitalNoBounds)).toBe(false);
    expect(canMatchScale(orbital, surface)).toBe(false);
    expect(canMatchScale(surface, surface)).toBe(false);
    expect(canMatchScale(orbital, null)).toBe(false);
  });
  it("derives the follower's zoom from metres per pixel, not the raw zoom number", () => {
    // pane A 100 m/px at fit, pane B 50 m/px at fit: B must zoom half as much to show the same ground per screen pixel
    expect(linkedZoom(2, 100, 50)).toEqual({ zoom: 1, exact: true });
    expect(linkedZoom(2, 50, 100)).toEqual({ zoom: 4, exact: true });
    expect(linkedZoom(1, 100, 50)).toEqual({ zoom: 1, exact: false });
    expect(linkedZoom(2, null, 50)).toBeNull();
  });
});

describe("pair text helpers", () => {
  it("splits tags into shared and unique sets", () => {
    expect(splitTags(["a", "b"], ["b", "c"])).toEqual({ shared: ["b"], onlyA: ["a"], onlyB: ["c"] });
  });
  it("summarises analog emphasis in descending order and reads footprint half-widths off the catalogue", () => {
    expect(emphasisSummary({ slope_regional_median_deg: 25, roughness_regional_m: 25, terrain_morphology: 20, mineralogy_tags: 20, precipitation_mm_day: 10 })).toBe("slopes 25% · relief 25% · landforms 20% · materials 20% · dryness 10%");
    expect(footprintHalfWidthDeg(earth, 9)).toBe(0.25);
    expect(footprintHalfWidthDeg(null, 0.5)).toBe(0.5);
  });
  it("labels coverage with the distance from the site", () => {
    expect(relationshipLabel({ relationship: "exact_location", distance_from_site_km: 0 })).toBe("Exact location · scene centred on the site");
    expect(relationshipLabel({ relationship: "nearby_scene", distance_from_site_km: 12.4 })).toBe("Nearby scene · scene centre ~12 km from the site");
    expect(relationshipLabel({ relationship: "candidate_region", distance_from_site_km: null })).toBe("Candidate region");
  });
});
