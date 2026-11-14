// Store behaviour for the Earth-Mars release: the mission (task, destination,
// per-body selections) is separate from the view (body shown, map mode), a
// manual body switch persists until the user follows the objective again, and
// nothing but applying a reviewed objective ever writes the task or reference.
import { beforeEach, describe, expect, it } from "vitest";
import { effectiveMapMode, referenceIdFor, useAppStore, type InterpretationApplication } from "./useAppStore";
import { taskApplicationFromInterpretation } from "@/hooks/useInterpretObjective";
import type { TaskInterpretation } from "@/types";

const initial = useAppStore.getState();

const analogDefaults = [
  { feature_id: "slope_regional_median_deg", label: "Similar slopes", weight: 25, reason: "" },
  { feature_id: "roughness_regional_m", label: "Similar regional relief", weight: 25, reason: "" },
  { feature_id: "terrain_morphology", label: "Similar landforms", weight: 20, reason: "" },
  { feature_id: "mineralogy_tags", label: "Similar materials", weight: 20, reason: "" },
  { feature_id: "precipitation_mm_day", label: "Dryness", weight: 10, reason: "" },
];

/** Mocked /mission/interpret task readings for the four example objectives (shapes from the live backend). */
const READINGS: Record<string, TaskInterpretation> = {
  landing: { task: "landing_screening", focus_body: "mars", mission_destination: "mars", reference_site: null, unresolved_sites: [], direction_options: [], analog_suggestions: analogDefaults, rationale: [] },
  earthForElysium: { task: "analog_site_selection", focus_body: "earth", mission_destination: "mars", reference_site: { body: "mars", id: "elysium_planitia", name: "Elysium Planitia (InSight)", matched_text: "Elysium" }, unresolved_sites: [], direction_options: [], analog_suggestions: [{ ...analogDefaults[0], weight: 30 }, { ...analogDefaults[1], weight: 30 }, { ...analogDefaults[2], weight: 25 }, { ...analogDefaults[3], weight: 10 }, { ...analogDefaults[4], weight: 5 }], rationale: [] },
  marsLikeHaughton: { task: "analog_site_selection", focus_body: "mars", mission_destination: "mars", reference_site: { body: "earth", id: "haughton_crater", name: "Haughton impact structure", matched_text: "Haughton" }, unresolved_sites: [], direction_options: [], analog_suggestions: analogDefaults, rationale: [] },
  compare: { task: "ambiguous", focus_body: null, mission_destination: "mars", reference_site: null, unresolved_sites: [], direction_options: [{ task: "analog_site_selection", focus_body: "earth", label: "Find Earth sites like a Mars site", description: "" }, { task: "analog_site_selection", focus_body: "mars", label: "Find Mars sites like an Earth site", description: "" }], analog_suggestions: analogDefaults, rationale: [] },
};

function apply(ti: TaskInterpretation, resolution?: Parameters<typeof taskApplicationFromInterpretation>[2]) {
  const app = taskApplicationFromInterpretation(ti, "hash", resolution) as InterpretationApplication;
  useAppStore.getState().applyInterpretation(app);
  return app;
}

beforeEach(() => useAppStore.setState({ ...initial, selectedEarthId: null, selectedMarsId: null, selectedSiteId: null, viewedBody: "mars", followObjective: true, mapMode: "landing_suitability", task: "landing_screening", appliedFocusBody: null, appliedReference: null, objectiveRevision: 0, analogWeights: null, recommendedAnalogWeights: null, suggestedSelection: null, activeTab: "explore" }, true));

describe("objective application", () => {
  it("'Find a safe landing site on Mars with reliable solar energy' -> Mars focus, landing screening, landing mode", () => {
    apply(READINGS.landing);
    const s = useAppStore.getState();
    expect(s.task).toBe("landing_screening");
    expect(s.selectionBody).toBe("mars");
    expect(s.viewedBody).toBe("mars");
    expect(s.missionDestination).toBe("mars");
    expect(s.mapMode).toBe("landing_suitability");
    expect(s.appliedReference).toBeNull();
    expect(s.objectiveRevision).toBe(1);
    expect(s.recommendedAnalogWeights).toEqual({ slope_regional_median_deg: 25, roughness_regional_m: 25, terrain_morphology: 20, mineralogy_tags: 20, precipitation_mm_day: 10 });
  });
  it("'Find an Earth field site to test a rover for Elysium Planitia' -> Earth focus, analog task, destination stays Mars, Elysium selected as the Mars reference", () => {
    apply(READINGS.earthForElysium);
    const s = useAppStore.getState();
    expect(s.task).toBe("analog_site_selection");
    expect(s.viewedBody).toBe("earth");
    expect(s.selectionBody).toBe("earth");
    expect(s.missionDestination).toBe("mars"); // the destination must NOT become Earth
    expect(s.appliedReference).toEqual({ body: "mars", id: "elysium_planitia", name: "Elysium Planitia (InSight)" });
    expect(s.selectedMarsId).toBe("elysium_planitia");
    expect(s.selectedSiteId).toBe("elysium_planitia"); // alias
    expect(s.selectedEarthId).toBeNull();
    expect(referenceIdFor(s)).toBe("elysium_planitia");
    expect(effectiveMapMode(s)).toBe("analog_match");
    expect(s.analogWeights).toEqual({ slope_regional_median_deg: 30, roughness_regional_m: 30, terrain_morphology: 25, mineralogy_tags: 10, precipitation_mm_day: 5 });
  });
  it("'Find Mars sites resembling Haughton' -> Mars focus, analog task, Haughton selected as the Earth reference", () => {
    apply(READINGS.marsLikeHaughton);
    const s = useAppStore.getState();
    expect(s.task).toBe("analog_site_selection");
    expect(s.viewedBody).toBe("mars");
    expect(s.mapMode).toBe("analog_match");
    expect(s.selectedEarthId).toBe("haughton_crater");
    expect(s.selectedMarsId).toBeNull();
    expect(referenceIdFor(s)).toBe("haughton_crater");
  });
  it("'Compare Earth and Mars geology' cannot be applied until a direction is chosen, then follows the chosen direction", () => {
    expect(taskApplicationFromInterpretation(READINGS.compare, "h")).toBeNull();
    apply(READINGS.compare, { direction: READINGS.compare.direction_options![1] });
    const s = useAppStore.getState();
    expect(s.task).toBe("analog_site_selection");
    expect(s.viewedBody).toBe("mars");
    expect(s.appliedReference).toBeNull();
  });
  it("an unresolved mention is never guessed; a user pick becomes the reference", () => {
    const ti: TaskInterpretation = { ...READINGS.earthForElysium, reference_site: null, unresolved_sites: [{ matched_text: "the crater", options: [{ body: "mars", id: "gale_crater", name: "Gale Crater (Bradbury Landing)", matched_text: "gale" }] }] };
    const noPick = taskApplicationFromInterpretation(ti, "h");
    expect(noPick?.reference).toBeNull();
    apply(ti, { reference: ti.unresolved_sites![0].options[0] });
    expect(useAppStore.getState().selectedMarsId).toBe("gale_crater");
  });
});

describe("view versus mission", () => {
  it("a manual body switch persists until the user follows the objective again", () => {
    apply(READINGS.earthForElysium);
    useAppStore.getState().setViewedBody("mars", { manual: true });
    let s = useAppStore.getState();
    expect(s.viewedBody).toBe("mars");
    expect(s.followObjective).toBe(false);
    expect(s.selectionBody).toBe("earth"); // the mission did not change
    // clicking candidates, hovering, typing never re-apply the objective
    s.selectLocation("mars", "gale_crater");
    s = useAppStore.getState();
    expect(s.viewedBody).toBe("mars");
    expect(s.followObjective).toBe(false);
    expect(s.objectiveRevision).toBe(1);
    s.followObjectiveNow();
    s = useAppStore.getState();
    expect(s.viewedBody).toBe("earth");
    expect(s.followObjective).toBe(true);
  });
  it("applying another objective restores following", () => {
    apply(READINGS.earthForElysium);
    useAppStore.getState().setViewedBody("mars", { manual: true });
    apply(READINGS.landing);
    expect(useAppStore.getState().followObjective).toBe(true);
    expect(useAppStore.getState().viewedBody).toBe("mars");
  });
  it("landing mode is only effective on Mars", () => {
    useAppStore.getState().setMapMode("landing_suitability");
    useAppStore.getState().setViewedBody("earth", { manual: true });
    expect(effectiveMapMode(useAppStore.getState())).toBe("analog_match");
    useAppStore.getState().setViewedBody("mars", { manual: true });
    expect(effectiveMapMode(useAppStore.getState())).toBe("landing_suitability");
  });
});

describe("linked pair", () => {
  it("clicking a candidate on the visible body never rewrites the opposite reference", () => {
    apply(READINGS.earthForElysium); // viewing Earth, reference = Elysium on Mars
    useAppStore.getState().selectLocation("earth", "death_valley");
    let s = useAppStore.getState();
    expect(s.selectedEarthId).toBe("death_valley");
    expect(s.selectedMarsId).toBe("elysium_planitia");
    expect(referenceIdFor(s)).toBe("elysium_planitia");
    expect(s.appliedReference?.id).toBe("elysium_planitia");
    // a lower-ranked hand pick stays selected
    s.selectLocation("earth", "mauna_kea_summit");
    s = useAppStore.getState();
    expect(s.selectedEarthId).toBe("mauna_kea_summit");
    expect(s.selectedMarsId).toBe("elysium_planitia");
  });
  it("switching globes uses the already selected opposite location as the reference", () => {
    useAppStore.getState().selectLocation("mars", "jezero_crater");
    useAppStore.getState().selectLocation("earth", "haughton_crater");
    useAppStore.getState().setViewedBody("earth", { manual: true });
    expect(referenceIdFor(useAppStore.getState())).toBe("jezero_crater");
    useAppStore.getState().setViewedBody("mars", { manual: true });
    expect(referenceIdFor(useAppStore.getState())).toBe("haughton_crater");
  });
  it("selections survive tab changes and the Mars alias stays in sync", () => {
    const s = useAppStore.getState();
    s.selectLocation("earth", "mdrs_utah");
    s.selectSite("oxia_planum");
    for (const tab of ["analyze", "compare", "research", "explore"] as const) {
      useAppStore.getState().setActiveTab(tab);
      expect(useAppStore.getState().selectedEarthId).toBe("mdrs_utah");
      expect(useAppStore.getState().selectedMarsId).toBe("oxia_planum");
      expect(useAppStore.getState().selectedSiteId).toBe("oxia_planum");
    }
  });
  it("a suggestion is only a hint: selecting on that body clears it and never replaces a user selection", () => {
    useAppStore.getState().setSuggestedSelection({ body: "earth", id: "haughton_crater", name: "Haughton", forReferenceId: "elysium_planitia" });
    expect(useAppStore.getState().selectedEarthId).toBeNull();
    useAppStore.getState().selectLocation("earth", "death_valley");
    expect(useAppStore.getState().suggestedSelection).toBeNull();
    expect(useAppStore.getState().selectedEarthId).toBe("death_valley");
  });
  it("showOnGlobe opens Explore on that body with the location selected and the focus token bumped", () => {
    const before = useAppStore.getState().selectionRevision;
    useAppStore.getState().setActiveTab("compare");
    useAppStore.getState().showOnGlobe("earth", "holuhraun_iceland");
    const s = useAppStore.getState();
    expect(s.activeTab).toBe("explore");
    expect(s.viewedBody).toBe("earth");
    expect(s.selectedEarthId).toBe("holuhraun_iceland");
    expect(s.selectionRevision).toBe(before + 1);
    expect(s.autoRotate).toBe(false);
  });
});

describe("analog preferences", () => {
  it("shares sum to 100, a slider move rescales the others, and reset restores the applied recommendation", () => {
    apply(READINGS.earthForElysium);
    const s = useAppStore.getState();
    s.setAnalogWeight("mineralogy_tags", 50);
    const w = useAppStore.getState().analogWeights!;
    expect(w.mineralogy_tags).toBe(50);
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBe(100);
    useAppStore.getState().setAnalogWeight("precipitation_mm_day", 0);
    expect(useAppStore.getState().analogWeights!.precipitation_mm_day).toBe(0);
    useAppStore.getState().resetAnalogWeights();
    expect(useAppStore.getState().analogWeights).toEqual(useAppStore.getState().recommendedAnalogWeights);
    // landing weights were never touched by any of this
    expect(useAppStore.getState().weights).toEqual(initial.weights);
  });
  it("ignores unknown features (insolation is informational, never a slider)", () => {
    useAppStore.getState().setAnalogWeight("insolation_toa_annual_mean_wm2", 50);
    expect(useAppStore.getState().analogWeights).toBeNull();
  });
});
