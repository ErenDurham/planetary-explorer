import { beforeEach, describe, expect, it } from "vitest";
import { useDiscoveryStore } from "./useDiscoveryStore";
import { useAppStore } from "@/store/useAppStore";

describe("discovery store", () => {
  beforeEach(() => useDiscoveryStore.setState({ runId: null, runs: {}, weights: { slope_regional_median_deg: 50, roughness_regional_m: 50 }, defaultWeights: { slope_regional_median_deg: 50, roughness_regional_m: 50 }, topK: 5 }));
  it("scopes ranking and selection to the run, and never touches the curated selection", () => {
    const s = useDiscoveryStore.getState();
    useAppStore.setState({ selectedEarthId: "atacama_yungay" });
    s.setRun("r1"); s.requestRank(); s.selectCandidate("c1");
    expect(useDiscoveryStore.getState().runs.r1).toMatchObject({ ranked: true, selectedCandidateId: "c1" });
    s.setRun("r2");
    expect(useDiscoveryStore.getState().runs.r2).toMatchObject({ ranked: false, selectedCandidateId: null });
    expect(useAppStore.getState().selectedEarthId).toBe("atacama_yungay");
  });
  it("seeds defaults from capabilities without overwriting an edited weight", () => {
    const s = useDiscoveryStore.getState();
    s.seedDefaults({ slope_regional_median_deg: 60, roughness_regional_m: 40 });
    expect(useDiscoveryStore.getState().weights).toEqual({ slope_regional_median_deg: 60, roughness_regional_m: 40 });
    s.setWeight("slope_regional_median_deg", 70);
    s.seedDefaults({ slope_regional_median_deg: 50, roughness_regional_m: 50 });
    expect(useDiscoveryStore.getState().weights).toEqual({ slope_regional_median_deg: 70, roughness_regional_m: 30 });
    s.resetWeights();
    expect(useDiscoveryStore.getState().weights).toEqual({ slope_regional_median_deg: 50, roughness_regional_m: 50 });
  });
});

it("keeps a three-candidate shortlist per survey without changing curated selections", async () => {
  useDiscoveryStore.setState({ runId: null, runs: {} });
  const { candidates, candidate } = await import("../test/fixtures");
  const store = useDiscoveryStore.getState();
  store.setRun("r1");
  candidates.forEach(store.toggleShortlist);
  store.toggleShortlist(candidate("fourth", 32, -3, 4, 40));
  expect(useDiscoveryStore.getState().runs.r1.shortlist).toHaveLength(3);
  store.setRun("r2");
  expect(useDiscoveryStore.getState().runs.r2.shortlist).toEqual([]);
  store.setRun("r1");
  store.toggleShortlist(candidates[0]);
  expect(useDiscoveryStore.getState().runs.r1.shortlist.map(c => c.id)).not.toContain(candidates[0].id);
});
