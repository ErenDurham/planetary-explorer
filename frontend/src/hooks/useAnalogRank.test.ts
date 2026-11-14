import { describe, expect, it, vi } from "vitest";
import { createStaleGuard } from "@/lib/staleGuard";
import { StaleRankResponse, fetchRanked, rankQueryKey, toWeightList } from "./useAnalogRank";
import type { AnalogRankResponse } from "@/types";

const response = (id: string | null): AnalogRankResponse => ({
  reference: { body: "mars", id: "elysium_planitia", name: "Elysium Planitia (InSight)", lat: 4.5, lon_east: 135.6 },
  candidate_body: "earth",
  basis_features: [],
  excluded_features: [],
  effective_weights: {},
  candidates: [],
  pool_size: 0,
  ranked_count: 0,
  tie_rule: "",
  analog_spec_version: "analog-v1.0",
  profile_version: "v1",
  planetary_differences: [],
  warnings: [],
  client_request_id: id,
});

describe("useAnalogRank stale guard", () => {
  it("accepts the latest response and echoes direction, reference and the full weight set", async () => {
    const guard = createStaleGuard("t");
    const rank = vi.fn(async (body: { client_request_id?: string | null }) => response(body.client_request_id ?? null));
    const res = await fetchRanked(guard, "earth", "elysium_planitia", { slope_regional_median_deg: 50, roughness_regional_m: 50 }, rank);
    expect(res.client_request_id).toBe(guard.latest);
    const sent = rank.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).toMatchObject({ reference_body: "mars", reference_id: "elysium_planitia", candidate_body: "earth" });
    expect(sent.weights).toEqual([
      { feature_id: "slope_regional_median_deg", weight: 50 },
      { feature_id: "roughness_regional_m", weight: 50 },
      { feature_id: "terrain_morphology", weight: 0 },
      { feature_id: "mineralogy_tags", weight: 0 },
      { feature_id: "precipitation_mm_day", weight: 0 },
    ]);
  });
  it("rejects a response that arrives after a newer request was issued", async () => {
    const guard = createStaleGuard("t");
    let releaseFirst: (() => void) | null = null;
    const rank = vi.fn((body: { client_request_id?: string | null }) =>
      rank.mock.calls.length === 1
        ? new Promise<AnalogRankResponse>((resolve) => { releaseFirst = () => resolve(response(body.client_request_id ?? null)); })
        : Promise.resolve(response(body.client_request_id ?? null)),
    );
    const first = fetchRanked(guard, "earth", "elysium_planitia", null, rank);
    const second = await fetchRanked(guard, "earth", "gale_crater", null, rank);
    expect(second.client_request_id).toBe(guard.latest);
    releaseFirst!();
    await expect(first).rejects.toBeInstanceOf(StaleRankResponse);
  });
  it("rejects a response carrying a foreign or missing id", async () => {
    const guard = createStaleGuard("t");
    await expect(fetchRanked(guard, "mars", "haughton_crater", null, async () => response("someone-else"))).rejects.toBeInstanceOf(StaleRankResponse);
    await expect(fetchRanked(guard, "mars", "haughton_crater", null, async () => response(null))).rejects.toBeInstanceOf(StaleRankResponse);
  });
  it("keys the query on direction, reference and the complete weight set", () => {
    const a = rankQueryKey("earth", "elysium_planitia", null);
    const b = rankQueryKey("mars", "haughton_crater", null);
    const c = rankQueryKey("earth", "elysium_planitia", { slope_regional_median_deg: 100 });
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
    expect(a[1]).toBe("analog-v1.0");
    expect(toWeightList(null).reduce((s, w) => s + w.weight, 0)).toBe(100);
  });
});
