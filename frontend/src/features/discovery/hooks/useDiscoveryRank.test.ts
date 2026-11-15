// The stale guard: a response echoing an id that is no longer the latest, or a
// different run, is discarded rather than shown.
import { describe, expect, it } from "vitest";
import { createStaleGuard } from "@/lib/staleGuard";
import { fetchDiscoveryRank, rankQueryKey } from "./useDiscoveryRank";
import { StaleDiscoveryResponse } from "../adapter";
import { connectedService, rankResponse } from "../test/fixtures";

describe("fetchDiscoveryRank", () => {
  const shares = { slope_regional_median_deg: 50, roughness_regional_m: 50 };
  it("accepts the latest response and stamps the request with the issued id", async () => {
    const svc = connectedService();
    const guard = createStaleGuard("t");
    const res = await fetchDiscoveryRank(guard, svc, "pilot_2026_11_14", shares, 5);
    expect(res.client_request_id).toBe(guard.latest);
    expect(svc.calls[0].weights).toEqual(shares);
    expect(svc.calls[0].reference_id).toBe("jezero_crater");
  });
  it("discards a response whose echoed id was superseded", async () => {
    const guard = createStaleGuard("t");
    let release: (() => void) | null = null;
    const slow = connectedService({ rank: (req) => new Promise(resolve => { release = () => resolve(rankResponse(req)); }) });
    const first = fetchDiscoveryRank(guard, slow, "pilot_2026_11_14", shares, 5);
    guard.issue(); // a newer request was issued meanwhile
    release!();
    await expect(first).rejects.toBeInstanceOf(StaleDiscoveryResponse);
  });
  it("discards a response for a different run", async () => {
    const guard = createStaleGuard("t");
    const wrongRun = connectedService({ rank: async (req) => ({ ...rankResponse(req), run_id: "other" }) });
    await expect(fetchDiscoveryRank(guard, wrongRun, "pilot_2026_11_14", shares, 5)).rejects.toBeInstanceOf(StaleDiscoveryResponse);
  });
  it("keys the cache by engine, run, reference, weights and top_k", () => {
    const a = rankQueryKey("r1", shares, 5), b = rankQueryKey("r1", { slope_regional_median_deg: 60, roughness_regional_m: 40 }, 5), c = rankQueryKey("r1", shares, 10);
    expect(a).not.toEqual(b); expect(a).not.toEqual(c);
    expect(a).toContain("discovery-v2"); expect(a).toContain("jezero_crater");
  });
});
