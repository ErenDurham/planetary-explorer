import { beforeEach, describe, expect, it } from "vitest";
import { useDiscoveryStore } from "./useDiscoveryStore";
import { candidates } from "../test/fixtures";
import { useAppStore } from "@/store/useAppStore";

describe("discovery store", () => {
  beforeEach(() => useDiscoveryStore.setState({ runId: null, runs: {}, weights: { slope_regional_median_deg: 50, roughness_regional_m: 50 }, defaultWeights: { slope_regional_median_deg: 50, roughness_regional_m: 50 }, topK: 5 }));
  it("scopes ranking and selection to the run, and never touches the curated selection", () => {
    const s = useDiscoveryStore.getState();
    useAppStore.setState({ selectedEarthId: "atacama_yungay" });
    s.setRun("r1"); s.requestRank(); s.selectCandidate("c1");
    expect(useDiscoveryStore.getState().runs.r1).toEqual({ ranked: true, selectedCandidateId: "c1", autoSelected: true, shortlist: [] });
    s.setRun("r2");
    expect(useDiscoveryStore.getState().runs.r2).toEqual({ ranked: false, selectedCandidateId: null, autoSelected: false, shortlist: [] });
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

it("retains a separate three-region shortlist for each survey", () => {
  const store = useDiscoveryStore.getState();
  store.setRun("first");
  for (const c of candidates) store.toggleShortlist(c);
  store.toggleShortlist({ ...candidates[0], id: "fourth" });
  expect(useDiscoveryStore.getState().runs.first.shortlist).toHaveLength(3);
  store.setRun("second");
  expect(useDiscoveryStore.getState().runs.second.shortlist).toEqual([]);
  store.setRun("first");
  store.toggleShortlist(candidates[0]);
  expect(useDiscoveryStore.getState().runs.first.shortlist.map(c => c.id)).toEqual(candidates.slice(1).map(c => c.id));
});
