import { describe, expect, it } from "vitest";
import { clampTopK, setDiscoveryShare, sharesFromDefaults, toRequestWeights } from "./weights";
import { wantsDiscovery } from "./objective";
import { noveltyRelation } from "./copy";

describe("discovery weights", () => {
  it("keeps the two shares summing to 100 and ignores unknown ids", () => {
    const s = sharesFromDefaults({ slope_regional_median_deg: 50, roughness_regional_m: 50 });
    const moved = setDiscoveryShare(s, "slope_regional_median_deg", 80);
    expect(moved).toEqual({ slope_regional_median_deg: 80, roughness_regional_m: 20 });
    expect(setDiscoveryShare(moved, "mineralogy_tags", 10)).toBe(moved);
    expect(toRequestWeights(moved)).toEqual({ slope_regional_median_deg: 80, roughness_regional_m: 20 });
  });
  it("clamps top_k to the contract's 1..20", () => {
    expect(clampTopK(0)).toBe(1); expect(clampTopK(99)).toBe(20); expect(clampTopK(NaN)).toBe(5);
  });
  it("recognises an objective asking for new regions beyond the established analogs", () => {
    expect(wantsDiscovery("Identify and characterize new candidate Earth regions beyond established analog sites")).toBe(true);
    expect(wantsDiscovery("Find a safe landing site with reliable solar energy.")).toBe(false);
  });
  it("never words a catalog relationship as scientific novelty", () => {
    const n = noveltyRelation({ catalog_version: "v1", nearest_known_site_id: "x", nearest_known_site_distance_km: 300, buffer_rule: "100 km centre buffer", outside_catalog_buffer: true, review_status: "not_reviewed" });
    expect(n.sentence).toMatch(/not scientific novelty/);
    expect(n.sentence).not.toMatch(/unknown to science|validated|safe|accessible/i);
  });
});
