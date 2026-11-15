// Mission Design flow: the tab opens on the chat box alone; Enter or Save
// interprets the text and applies it straight to the sliders, which slide in
// beside the priority pie; Edit Mission reopens the box. When the language
// model did not run, one plain notice says the weights come from keyword
// matching. Also covers the hover popups, the research-backed "Why these
// priorities?" pop-up and the info tips that close on leave.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fixture from "@/test/fixtures/api_examples.json";
import mission from "@/test/fixtures/mission_examples.json";
import { DEFAULT_OBJECTIVE, roverSharesFrom, useAppStore } from "@/store/useAppStore";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { DEFAULT_MISSION_OBJECTIVE } from "@/lib/defaultObjective";
import { InfoTip } from "@/components/ui/InfoTip";
import { setDiscoveryService } from "@/features/discovery/adapter";
import { connectedService, deadService } from "@/features/discovery/test/fixtures";
import { useCandidateResearchTarget } from "@/features/discovery/store/useCandidateResearchTarget";
import { useDiscoveryStore } from "@/features/discovery/store/useDiscoveryStore";
import type { DefaultMissionResponse, EvaluateResponse, EvidenceCitation } from "@/types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const defaults = fixture.default_mission as unknown as DefaultMissionResponse;
const evaluation = fixture.evaluate as unknown as EvaluateResponse;
const rawDefaults = { terrain_safety: 35, elevation_suitability: 25, surface_roughness: 20, thermal_conditions: 10, solar_illumination: 10 };
const current = { terrain_safety: 27, elevation_suitability: 19, surface_roughness: 23, thermal_conditions: 0, solar_illumination: 31 };
const TEXT = "Prioritise landing safety over sunlight; ignore solar";

const cite = (evidence_id: string, fact: string, citeName: string, url: string): EvidenceCitation => ({
  evidence_id, fact, quotes: [`verbatim source text for ${evidence_id}`], cite: citeName, title: `Title of ${citeName}`, venue: "Venue", url, source_kind: "peer_reviewed",
});
const SLOPE = cite("slope_insight", "Slopes <15° at 84 m and 2 m length scales for radar tracking and touchdown stability.", "Golombek et al., 2017", "https://doi.org/10.1007/s11214-016-0321-9");
const ELEV = cite("elev_limit_human", "Human Exploration Zones: preliminary elevation limit no higher than +2 km (MOLA).", "Bussey & Hoffman, 2016", "https://ntrs.nasa.gov/citations/20160002370");
const LAT = cite("lat_limit_human", "Human Exploration Zones: preliminary latitude limits ±50°.", "Bussey & Hoffman, 2016", "https://ntrs.nasa.gov/citations/20160002370");
const LLM_BODY = {
  ...mission.interpret,
  generated_by: "llm",
  model: "test-model",
  mission_profile: "human",
  suggestions: mission.interpret.suggestions.map((s) => ({ ...s, evidence: s.criterion_id === "terrain_safety" ? [SLOPE] : s.criterion_id === "elevation_suitability" ? [ELEV] : [] })),
  constraint_evidence: { max_elevation: [ELEV], latitude_band: [LAT] },
};

let interpretCalls: Array<Record<string, unknown>> = [];

function mockInterpret(body: unknown = LLM_BODY) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input).endsWith("/mission/interpret")) {
      interpretCalls.push(JSON.parse(String(init?.body)));
      return json(body);
    }
    return json({ error: { code: "not_found", message: `unmocked ${String(input)}` } }, 404);
  });
}

const renderTab = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><LeftSidebar defaults={defaults} defaultsError={null} evaluation={evaluation} evaluationError={null} /></QueryClientProvider>);

async function saveMission(text = TEXT) {
  const box = screen.getByLabelText("Your mission objective");
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: "Enter" });
  return screen.findByLabelText("Low slopes share of priorities");
}

beforeEach(() => {
  interpretCalls = [];
  useAppStore.setState(useAppStore.getInitialState(), true);
  useAppStore.setState({
    defaultWeights: rawDefaults,
    weights: { ...current },
    recommendedWeights: { ...current },
    missionObjective: "Find a safe landing site with reliable solar energy.",
    appliedObjective: "Find a safe landing site with reliable solar energy.",
    appliedObjectiveSource: "rule_based",
  });
});
afterEach(() => vi.restoreAllMocks());

describe("Mission Design chat box", () => {
  it("offers three example objectives that fill the box, and applies one on Enter", async () => {
    mockInterpret();
    renderTab();
    const box = screen.getByLabelText("Your mission objective");
    expect(box).toHaveValue("");
    expect(screen.getByRole("button", { name: /Apply objective/ })).toBeDisabled();
    const examples = screen.getByRole("group", { name: "Example objectives" });
    expect(within(examples).getAllByRole("button").map(b => b.textContent)).toEqual([
      expect.stringContaining("New Earth terrain resembling Jezero"), expect.stringContaining("Best established analog for Jezero"), expect.stringContaining("Mars landing screening"),
    ]);
    fireEvent.click(within(examples).getByRole("button", { name: /New Earth terrain resembling Jezero/ }));
    expect(box).toHaveValue(DEFAULT_MISSION_OBJECTIVE);
    expect(screen.getByRole("button", { name: /Apply objective/ })).toBeEnabled();
    // an example is a draft like any other: the user can still rewrite it
    fireEvent.change(box, { target: { value: "My own words" } });
    expect(box).toHaveValue("My own words");
    fireEvent.click(within(examples).getByRole("button", { name: /New Earth terrain resembling Jezero/ }));
    fireEvent.keyDown(box, { key: "Enter" });
    await screen.findByTestId("mission-text");
    expect(interpretCalls[0].objective).toBe(DEFAULT_MISSION_OBJECTIVE);
    expect(screen.getByTestId("mission-text")).toHaveTextContent(/new candidate Earth regions beyond established analog sites/);
    expect(screen.getByTestId("mission-applied")).toHaveTextContent(/Applied objective/);
  });

  it("opens on the chat box alone, then Enter interprets, applies and brings in the sliders and pie", async () => {
    mockInterpret();
    const { container } = renderTab();

    expect(screen.getByRole("heading", { name: "Mission Design" })).toBeInTheDocument();
    expect(screen.getByTestId("mission-lede")).toHaveTextContent(/Describe the mission in a sentence or two/);
    const box = screen.getByLabelText("Your mission objective");
    expect(box).toHaveValue("");
    expect(box).toHaveAttribute("placeholder", expect.stringMatching(/Describe your mission/));
    expect(screen.queryByTestId("mission-next-step")).toBeNull();
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    expect(screen.queryByText("Priority distribution")).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit Mission/ })).toBeNull();

    // Shift+Enter is a new line, not a submit
    fireEvent.change(box, { target: { value: TEXT } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(interpretCalls).toHaveLength(0);

    await saveMission();
    expect(interpretCalls).toHaveLength(1);
    expect(interpretCalls[0]).toMatchObject({ objective: TEXT, current_weights: current, excluded_criteria: ["thermal_conditions"] });

    // the text sits under the heading with Edit Mission below it; the box is gone
    expect(screen.getByTestId("mission-text")).toHaveTextContent(TEXT);
    expect(screen.getByRole("button", { name: /Edit Mission/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("Your mission objective")).toBeNull();
    expect(screen.queryByTestId("mission-lede")).toBeNull();

    // applied straight to the store as shares, with the model's provenance and its research
    const s = useAppStore.getState();
    expect(s.weights).toEqual({ terrain_safety: 43, elevation_suitability: 26, surface_roughness: 31, thermal_conditions: 0, solar_illumination: 0 });
    expect(s.recommendedWeights).toEqual(s.weights);
    expect(s.appliedObjective).toBe(TEXT);
    expect(s.appliedObjectiveSource).toBe("llm");
    expect(s.appliedObjectiveModel).toBe("test-model");
    expect(s.appliedInterpretation?.evidence.terrain_safety).toEqual([SLOPE]);
    expect(s.appliedInterpretation?.missionProfile).toBe("human");
    expect(screen.getByLabelText("Low slopes share of priorities")).toHaveValue("43");
    // no provenance badges and no keyword-matching notice when the model ran
    expect(screen.queryByText(/rule.based/i)).toBeNull();
    expect(screen.queryByTestId("no-model-notice")).toBeNull();

    // pie beside the sliders: a slice per non-zero share; numbers only on hover
    expect(screen.getByText("Priority distribution")).toBeInTheDocument();
    expect(screen.getByTestId("pie-slice-terrain_safety")).toHaveAttribute("aria-label", "Low slopes: 43%");
    expect(screen.queryByTestId("pie-slice-solar_illumination")).toBeNull();
    expect(container.querySelectorAll("svg text")).toHaveLength(0);
    expect(screen.getByRole("list", { name: "Pie legend" })).not.toHaveTextContent("%");
    expect(screen.queryByTestId("recommendation-card")).toBeNull();
    expect(screen.queryByText("Hover a slice for its share.")).toBeNull();
    expect(screen.queryByLabelText("Thermal conditions share of priorities")).toBeNull(); // no-data factors are not shown
  });

  it("says plainly when the backend's language model did not run", async () => {
    mockInterpret(mission.interpret); // generated_by: rule_based
    renderTab();
    await saveMission();
    expect(screen.getByTestId("no-model-notice")).toHaveTextContent("Uh oh! Either our model is not available, or we could not understand your mission. Please try again!");
    expect(screen.queryByText(/Rule-based reading/)).toBeNull();
  });

  it("Save works too, and an unreachable backend falls back to browser keyword matching, labelled as such", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    renderTab();
    fireEvent.change(screen.getByLabelText("Your mission objective"), { target: { value: TEXT } });
    fireEvent.click(screen.getByRole("button", { name: /Apply objective|Apply changes/ }));
    await screen.findByLabelText("Low slopes share of priorities");
    expect(screen.getByTestId("no-model-notice")).toHaveTextContent("Uh oh! Either our model is not available, or we could not understand your mission. Please try again!");
    expect(screen.queryByText(/Offline rule-based suggestion/)).toBeNull();
    const s = useAppStore.getState();
    expect(s.appliedObjectiveSource).toBe("offline_rule_based");
    expect(s.appliedObjectiveHash).toMatch(/^local-/);
    expect(s.weights.thermal_conditions).toBe(0);
  });

  it("Edit Mission reopens the box with the saved text; Escape cancels and Save re-interprets", async () => {
    mockInterpret();
    renderTab();
    await saveMission();

    fireEvent.click(screen.getByRole("button", { name: /Edit Mission/ }));
    const box = screen.getByLabelText("Your mission objective");
    expect(box).toHaveValue(TEXT);
    fireEvent.change(box, { target: { value: `${TEXT} and avoid dust` } });
    expect(screen.getByTestId("objective-stale-notice")).toHaveTextContent("Save to change them");
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByLabelText("Your mission objective")).toBeNull();
    expect(screen.getByTestId("mission-text")).toHaveTextContent(TEXT);
    expect(interpretCalls).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Edit Mission/ }));
    fireEvent.change(screen.getByLabelText("Your mission objective"), { target: { value: "Smooth terrain for a rover" } });
    fireEvent.click(screen.getByRole("button", { name: /Apply objective|Apply changes/ }));
    expect(screen.getByTestId("mission-text")).toHaveTextContent("Smooth terrain for a rover");
    await waitFor(() => expect(interpretCalls).toHaveLength(2));
    expect(interpretCalls[1].objective).toBe("Smooth terrain for a rover");
    // the sliders stay in view while the new text is read
    expect(screen.getByLabelText("Low slopes share of priorities")).toBeInTheDocument();
  });
});

describe("Mission Design popups", () => {
  it("hovering a pie slice or a slider label shows the share in large type with a static description", async () => {
    mockInterpret();
    renderTab();
    await saveMission();

    const slice = screen.getByTestId("pie-slice-terrain_safety");
    fireEvent.mouseMove(slice, { clientX: 10, clientY: 10 });
    const popup = screen.getByTestId("priority-popup-terrain_safety");
    expect(popup).toHaveTextContent("43%");
    expect(popup).toHaveTextContent("How gently the ground tilts across the landing region");
    fireEvent.mouseLeave(slice.closest("div")!);
    expect(screen.queryByTestId("priority-popup-terrain_safety")).toBeNull();

    const label = screen.getByText("Low slopes", { selector: "label" });
    fireEvent.mouseEnter(label);
    expect(screen.getByTestId("priority-popup-terrain_safety")).toHaveTextContent("43%");
    // the sentence is static: it does not change with the share
    fireEvent.change(screen.getByLabelText("Low slopes share of priorities"), { target: { value: "60" } });
    expect(screen.getByTestId("priority-popup-terrain_safety")).toHaveTextContent("60%");
    expect(screen.getByTestId("priority-popup-terrain_safety")).toHaveTextContent("How gently the ground tilts across the landing region");
    fireEvent.mouseLeave(label);
    expect(screen.queryByTestId("priority-popup-terrain_safety")).toBeNull();
  });

  it("the ? icon names itself on hover and opens cited research per slider, with the hard constraints at the bottom", async () => {
    mockInterpret();
    renderTab();
    await saveMission();
    fireEvent.change(screen.getByLabelText("Lower elevation share of priorities"), { target: { value: "30" } });

    const why = screen.getByRole("button", { name: "Why these priorities?" });
    fireEvent.mouseEnter(why);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Why these priorities?");
    fireEvent.click(why);
    const dialog = screen.getByRole("dialog", { name: "Why these priorities?" });

    // no echo of the mission text and no model / mission-type / confidence line
    expect(within(dialog).queryByTestId("why-meta")).toBeNull();
    expect(dialog).not.toHaveTextContent(TEXT);
    expect(dialog).not.toHaveTextContent("test-model");
    expect(within(dialog).queryByTestId("why-no-llm")).toBeNull();

    // per slider: the model's reason, then findings with numbers from the source and a linked citation
    const terrain = within(dialog).getByTestId("why-terrain_safety");
    expect(terrain).toHaveTextContent("\"safety\" is ranked above \"sunlight\" in the objective, so it is raised.");
    const finding = within(terrain).getByTestId("finding-slope_insight");
    expect(finding).toHaveTextContent("Slopes <15° at 84 m and 2 m length scales");
    expect(within(finding).getByRole("link", { name: "Golombek et al., 2017" })).toHaveAttribute("href", "https://doi.org/10.1007/s11214-016-0321-9");
    expect(within(finding).getByText(/Slopes <15°/)).toHaveAttribute("title", "“verbatim source text for slope_insight”");
    const elevation = within(dialog).getByTestId("why-elevation_suitability");
    expect(elevation).toHaveTextContent("30%");
    expect(elevation).toHaveTextContent("suggested 26%");
    // a factor with no supporting research says so
    expect(within(dialog).getByTestId("why-surface_roughness")).toHaveTextContent("No finding in the evidence registry supports this weight.");
    expect(within(dialog).queryByTestId("why-thermal_conditions")).toBeNull(); // no-data factors are not shown
    expect(dialog).toHaveTextContent("Subsurface ice is not a landing-phase criterion in this model.");

    // hard constraints come last, each with its source
    const constraints = within(dialog).getByTestId("why-hard-constraints");
    expect(constraints).toHaveTextContent("Median elevation ≤ +2,000 m (MOLA)");
    expect(constraints).toHaveTextContent("|Latitude| ≤ 50°");
    expect(constraints).not.toHaveTextContent(/assumption/i);
    expect(within(constraints).getAllByRole("link", { name: "Bussey & Hoffman, 2016" })).toHaveLength(2);
    expect(terrain.compareDocumentPosition(constraints) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(constraints.nextElementSibling?.tagName).toBe("P"); // only the one-line source note follows

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("flags in the pop-up when the weights did not come from the language model", async () => {
    mockInterpret(mission.interpret);
    renderTab();
    await saveMission();
    fireEvent.click(screen.getByRole("button", { name: "Why these priorities?" }));
    expect(within(screen.getByRole("dialog")).getByTestId("why-no-llm")).toHaveTextContent("Language model unavailable: weights come from keyword matching.");
  });

  it("every info box closes as soon as the mouse leaves it, without a second click", async () => {
    mockInterpret();
    renderTab();
    await saveMission();
    const summary = screen.getByLabelText("About Low slopes");
    const details = summary.closest("details")!;
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    fireEvent.mouseLeave(details);
    expect(details.open).toBe(false);

    render(<InfoTip label="Plain tip">text</InfoTip>);
    const plain = screen.getByLabelText("Plain tip").closest("details")!;
    fireEvent.click(screen.getByLabelText("Plain tip"));
    expect(plain.open).toBe(true);
    fireEvent.mouseLeave(plain);
    expect(plain.open).toBe(false);

    // the "?" variant also opens on hover
    render(<InfoTip variant="help" label="Help tip">help</InfoTip>);
    const help = screen.getByLabelText("Help tip").closest("details")!;
    fireEvent.mouseEnter(help);
    expect(help.open).toBe(true);
    fireEvent.mouseLeave(help);
    expect(help.open).toBe(false);
  });
});

// ---- Earth-Mars release: the task reading in the Mission Design flow --------
// (ported from the proposal-review tests: a clear reading is applied with the
// weights on Save; an ambiguous one opens the task panel and is never guessed)
const analogDefaults = [
  { feature_id: "slope_regional_median_deg", label: "Similar slopes", weight: 30, reason: "Mobility / terrain wording." },
  { feature_id: "roughness_regional_m", label: "Similar regional relief", weight: 30, reason: "Mobility / terrain wording." },
  { feature_id: "terrain_morphology", label: "Similar landforms", weight: 25, reason: "Mobility / terrain wording." },
  { feature_id: "mineralogy_tags", label: "Similar materials", weight: 10, reason: "Lowered." },
  { feature_id: "precipitation_mm_day", label: "Dryness", weight: 5, reason: "Default analog weight (spec)." },
];

describe("Mission Design task reading", () => {
  beforeEach(() => { useAppStore.setState({ viewedBody: "mars", followObjective: true, selectedMarsId: null, selectedSiteId: null, selectedEarthId: null, missionDestination: "mars", task: "landing_screening", appliedTask: null }); });

  it("applies a clear task reading (task, focus body, destination, reference, analog shares) with the landing weights on Save", async () => {
    mockInterpret({ ...mission.interpret, task_interpretation: { task: "analog_site_selection", focus_body: "earth", mission_destination: "mars", reference_site: { body: "mars", id: "elysium_planitia", name: "Elysium Planitia (InSight)", matched_text: "Elysium" }, unresolved_sites: [], direction_options: [], analog_suggestions: analogDefaults, rationale: ["The text asks for a location on Earth."] } });
    renderTab();
    const box = screen.getByLabelText("Your mission objective");
    fireEvent.change(box, { target: { value: "Find Earth test sites like Elysium Planitia for a Mars lander" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await screen.findByTestId("applied-task");
    const s = useAppStore.getState();
    expect(s.missionType).toBe("rover_field_test"); // Earth uses its explicit task profile rather than the Mars landing model.
    expect(s.task).toBe("analog_site_selection");
    expect(s.viewedBody).toBe("earth");
    expect(s.missionDestination).toBe("mars");
    expect(s.appliedReference).toEqual({ body: "mars", id: "elysium_planitia", name: "Elysium Planitia (InSight)" });
    expect(s.selectedMarsId).toBe("elysium_planitia");
    expect(s.analogWeights).toEqual({ slope_regional_median_deg: 30, roughness_regional_m: 30, terrain_morphology: 25, mineralogy_tags: 10, precipitation_mm_day: 5 });
    expect(s.recommendedAnalogWeights).toEqual(s.analogWeights);
    expect(s.weights.thermal_conditions).toBe(0); // landing weights still applied
    expect(screen.getByTestId("applied-task")).toHaveTextContent("Analog site selection · looking on Earth · mission to Mars · reference Elysium Planitia (InSight) (Mars)");
    expect(screen.queryByTestId("task-resolver")).toBeNull(); // nothing to settle
    // so the Earth priorities (same factors, own values) replace the Mars ones
    await waitFor(() => expect(screen.getByTestId("earth-priorities")).toBeInTheDocument());
    expect(screen.queryByTestId("mars-priorities")).toBeNull();
  });

  it("never asks the user to settle the task: no panel, no questions, even if a reading comes back unresolved", async () => {
    mockInterpret({ ...mission.interpret, task_interpretation: { task: "ambiguous", focus_body: null, mission_destination: "mars", reference_site: null, unresolved_sites: [{ matched_text: "the crater", options: [{ body: "mars", id: "gale_crater", name: "Gale Crater (Bradbury Landing)", matched_text: "gale" }, { body: "earth", id: "haughton_crater", name: "Haughton impact structure", matched_text: "haughton" }] }], direction_options: [{ task: "analog_site_selection", focus_body: "earth", label: "Find Earth sites like a Mars site", description: "Pick a Mars reference." }, { task: "analog_site_selection", focus_body: "mars", label: "Find Mars sites like an Earth site", description: "Pick an Earth reference." }], analog_suggestions: analogDefaults, rationale: [] } });
    renderTab();
    await saveMission("Compare the crater");
    expect(useAppStore.getState().weights.thermal_conditions).toBe(0);   // the priorities are applied as usual
    expect(screen.queryByTestId("task-resolver")).toBeNull();
    expect(screen.queryByTestId("task-review")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Apply task" })).toBeNull();
  });
});

describe("Mission Design focus and mission types", () => {
  it("shows Mission focus only after a save; Earth shows the same sliders as Mars, and its terrain sliders drive the Earth ranking", async () => {
    mockInterpret();
    renderTab();
    expect(screen.queryByRole("region", { name: "Mission focus" })).toBeNull(); // the tab opens on the chat box alone
    await saveMission();
    expect(screen.getByRole("region", { name: "Mission focus" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Mission type" })).toBeNull(); // planet only, no mission-type drop-down
    expect(useAppStore.getState().missionDesigned).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Earth" }));
    expect(useAppStore.getState().missionType).toBe("rover_field_test");
    expect(screen.getByTestId("earth-priorities")).toBeInTheDocument();
    // exactly the Mars sliders: same factors and labels (no-data thermal hidden)
    expect(screen.getAllByRole("slider").map((el) => el.getAttribute("aria-label"))).toEqual([
      "Low slopes share of priorities", "Lower elevation share of priorities", "Less rugged ground share of priorities", "Solar energy share of priorities"]);
    expect(screen.queryByLabelText("Target regional slope share of priorities")).toBeNull();
    // no Earth reading in this response, so Earth starts from the Mars weights
    expect(screen.getByLabelText("Low slopes share of priorities")).toHaveValue("43");
    fireEvent.change(screen.getByLabelText("Less rugged ground share of priorities"), { target: { value: "60" } });
    const st = useAppStore.getState();
    expect(st.earthWeights.surface_roughness).toBe(60);
    expect(st.weights.surface_roughness).toBe(31);   // Mars untouched
    expect(st.missionProfileWeights.rover_field_test).toEqual(roverSharesFrom(st.earthWeights));
    expect(st.missionProfileWeights.rover_field_test.relief).toBeGreaterThan(st.missionProfileWeights.rover_field_test.slope);
  });

  it("marks edited, unsaved mission text as dirty until it is saved or cancelled", async () => {
    mockInterpret();
    renderTab();
    await saveMission();
    fireEvent.click(screen.getByRole("button", { name: /Edit Mission/ }));
    const box = screen.getByLabelText("Your mission objective");
    fireEvent.change(box, { target: { value: `${TEXT}, and near water ice` } });
    expect(useAppStore.getState().missionDraftDirty).toBe(true);
    fireEvent.change(box, { target: { value: TEXT } });
    expect(useAppStore.getState().missionDraftDirty).toBe(false);
    fireEvent.change(box, { target: { value: "Something else" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(useAppStore.getState().missionDraftDirty).toBe(false);
  });
});

describe("Mission Design: one reading, two planets", () => {
  const EARTH_BODY = {
    ...LLM_BODY,
    earth_suggestions: [
      { factor_id: "terrain_safety", label: "Terrain safety (regional slope)", weight: 30, reason: "Match regional tilt for landing stability.", evidence: [SLOPE] },
      { factor_id: "elevation_suitability", label: "Elevation suitability (EDL atmosphere)", weight: 0, reason: "No descent to test on Earth.", evidence: [] },
      { factor_id: "surface_roughness", label: "Surface roughness (detrended relief)", weight: 50, reason: "Delta terrain is uneven.", evidence: [] },
      { factor_id: "thermal_conditions", label: "Thermal conditions", weight: 0, reason: "No data.", evidence: [] },
      { factor_id: "solar_illumination", label: "Solar illumination", weight: 20, reason: "Power systems need sun.", evidence: [] },
    ],
  };

  it("switches Earth -> Mars -> Earth seamlessly, each planet keeping its own LLM priorities, in the same design", async () => {
    mockInterpret(EARTH_BODY);
    renderTab();
    await saveMission();
    expect(screen.getByTestId("mars-priorities")).toBeInTheDocument();
    expect(screen.getByLabelText("Low slopes share of priorities")).toHaveValue("43");

    fireEvent.click(screen.getByRole("button", { name: "Earth" }));
    expect(screen.getByTestId("earth-priorities")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mission priorities" })).toBeInTheDocument(); // same heading and design as Mars
    expect(screen.getByLabelText("Low slopes share of priorities")).toHaveValue("30");
    expect(screen.getByLabelText("Lower elevation share of priorities")).toHaveValue("0");
    expect(screen.getByLabelText("Less rugged ground share of priorities")).toHaveValue("50");
    expect(screen.getByLabelText("Solar energy share of priorities")).toHaveValue("20");
    expect(screen.getByText("Priority distribution")).toBeInTheDocument();
    expect(screen.getByTestId("pie-slice-surface_roughness")).toHaveAttribute("aria-label", "Less rugged ground: 50%");
    fireEvent.change(screen.getByLabelText("Low slopes share of priorities"), { target: { value: "40" } });

    fireEvent.click(screen.getByRole("button", { name: "Mars" }));
    expect(screen.getByTestId("mars-priorities")).toBeInTheDocument();
    expect(useAppStore.getState().missionType).toBe("landing");
    expect(screen.getByLabelText("Low slopes share of priorities")).toHaveValue("43"); // Mars untouched

    fireEvent.click(screen.getByRole("button", { name: "Earth" }));
    expect(screen.getByLabelText("Low slopes share of priorities")).toHaveValue("40"); // the user's Earth edit kept
    fireEvent.click(screen.getByRole("button", { name: "Reset priorities to the applied objective's suggestion" }));
    expect(screen.getByLabelText("Low slopes share of priorities")).toHaveValue("30"); // Reset = the LLM's Earth suggestion
  });

  it("explains the Earth priorities in the same pop-up, with reasons and cited research, and no Mars hard constraints", async () => {
    mockInterpret(EARTH_BODY);
    renderTab();
    await saveMission();
    fireEvent.click(screen.getByRole("button", { name: "Earth" }));
    fireEvent.click(screen.getByRole("button", { name: "Why these priorities?" }));
    const dialog = screen.getByRole("dialog", { name: "Why these priorities?" });
    const terrain = within(dialog).getByTestId("why-terrain_safety");
    expect(terrain).toHaveTextContent("Match regional tilt for landing stability.");   // the Earth reason, not the Mars one
    expect(within(terrain).getByRole("link", { name: "Golombek et al., 2017" })).toBeInTheDocument();
    expect(within(dialog).getByTestId("why-elevation_suitability")).toHaveTextContent("No descent to test on Earth.");
    expect(within(dialog).getByTestId("why-surface_roughness")).toHaveTextContent("No finding in the evidence registry supports this weight.");
    expect(within(dialog).queryByTestId("why-hard-constraints")).toBeNull();
  });

  it("says it is reading the mission while the model reads it", async () => {
    let release!: (r: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>((resolve) => { release = resolve; }));
    renderTab();
    const box = screen.getByLabelText("Your mission objective");
    fireEvent.change(box, { target: { value: TEXT } });
    fireEvent.keyDown(box, { key: "Enter" });
    const text = await screen.findByText("Reading your mission…");
    const loading = screen.getByTestId("mission-loading");
    expect(loading).toHaveClass("text-xl", "justify-center", "items-center");
    // a star circling like a spinner, to the left of the text and sized to it (em-based)
    const star = within(loading).getByTestId("shooting-star");
    expect(star).toHaveClass("star-spinner", "h-[1.35em]", "w-[1.35em]");
    expect(star.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(loading.querySelector(".animate-spin")).toBeNull();
    release(json(EARTH_BODY));
    await screen.findByLabelText("Low slopes share of priorities");
    expect(screen.queryByText("Reading your mission…")).toBeNull();
  });
});

describe("Mission Design decoration", () => {
  it("adds a rocket and twinkling stars that screen readers and clicks ignore, with more stars while only the chat box shows", async () => {
    mockInterpret();
    renderTab();
    const decor = screen.getByTestId("space-decor");
    expect(decor).toHaveAttribute("aria-hidden");
    expect(decor).toHaveClass("pointer-events-none");
    expect(within(decor).getByTestId("decor-rocket")).toHaveClass("rocket-float");
    const before = within(decor).getAllByTestId("decor-star");
    expect(before.length).toBeGreaterThan(8);
    expect(before.every((s) => s.classList.contains("star"))).toBe(true);
    await saveMission();
    // once the sliders are in, stars stay beside the header only
    expect(within(screen.getByTestId("space-decor")).getAllByTestId("decor-star").length).toBeLessThan(before.length);
  });

  it("draws the pie without borders between slices", async () => {
    mockInterpret();
    renderTab();
    await saveMission();
    const slice = screen.getByTestId("pie-slice-terrain_safety");
    expect(slice).not.toHaveAttribute("stroke-width");
    expect(slice.getAttribute("class") ?? "").not.toMatch(/stroke/);
  });
});

describe("Mission Design default objective", () => {
  it("offers the default objective as the first example and applies it from the box", async () => {
    mockInterpret();
    renderTab();
    expect(DEFAULT_OBJECTIVE).toBe(useAppStore.getInitialState().missionObjective);   // one source for both
    const box = screen.getByLabelText("Your mission objective");
    expect(box).toHaveValue("");
    expect(box).toHaveAccessibleDescription(/Enter applies/);
    fireEvent.click(screen.getByRole("button", { name: /New Earth terrain resembling Jezero/ }));
    expect(box).toHaveValue(DEFAULT_OBJECTIVE);
    // Tab is ordinary focus movement, never a fill
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.keyDown(box, { key: "Tab" });
    expect(box).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: /New Earth terrain resembling Jezero/ }));
    fireEvent.keyDown(box, { key: "Enter" });
    await screen.findByLabelText("Low slopes share of priorities");
    expect(useAppStore.getState().appliedObjective).toBe(DEFAULT_OBJECTIVE);
  });

  it("names the slope and roughness factors in plain words", async () => {
    mockInterpret();
    renderTab();
    await saveMission();
    expect(screen.getByLabelText("Low slopes share of priorities")).toBeInTheDocument();
    expect(screen.getByLabelText("Less rugged ground share of priorities")).toBeInTheDocument();
    expect(screen.queryByText(/Gentler terrain|Smoother terrain/)).toBeNull();
  });
});

describe("Mission Design: Earth <-> Mars cross-reference", () => {
  const ARADS = cite("analog_atacama_drill", "NASA's K-REX2 rover tested a life-detection drill reaching two meters (6.5 feet) in the Atacama, one month each year from 2016 to 2019.", "NASA ARADS, 2019", "https://www.nasa.gov/universe/atacama-rover-astrobiology-drilling-studies-arads/");
  const ANALOG = {
    earth_site_id: "atacama_yungay", earth_site_name: "Atacama Desert (Yungay)", mars_site_id: "jezero_crater", mars_site_name: "Jezero Crater",
    research: [ARADS], chosen_by: "llm",
    factors: [
      { criterion_id: "terrain_safety", earth_value: 1.17, mars_value: 1.08, unit: "deg", difference: 0.09, tolerance: 1.5, comparable: true, note: "Comparable: differ by 0.09 deg (comparable within 1.5 deg)." },
      { criterion_id: "surface_roughness", earth_value: 126.5, mars_value: 194.4, unit: "m", difference: 67.9, tolerance: 100, comparable: true, note: "Comparable: differ by 67.90 m (comparable within 100 m)." },
      { criterion_id: "elevation_suitability", earth_value: 1046, mars_value: -2563, unit: "m", difference: null, tolerance: null, comparable: null, note: "Not comparable across planets: Earth elevations are above sea level, Mars elevations above the MOLA areoid." },
      { criterion_id: "solar_illumination", earth_value: 407, mars_value: 171, unit: "W/m2", difference: null, tolerance: null, comparable: null, note: "Not directly comparable: Mars receives 0.431 of Earth's sunlight (NASA Mars Fact Sheet)." },
    ],
    shared_landforms: ["alluvial_fan"], shared_minerals: ["sulfates"],
  };

  it("shows the chain - proven Earth site, its research, the Mars site - and each factor's Earth vs Mars data, on both planets", async () => {
    mockInterpret({ ...LLM_BODY, analog_check: ANALOG });
    renderTab();
    await saveMission();
    fireEvent.click(screen.getByRole("button", { name: "Why these priorities?" }));
    let dialog = screen.getByRole("dialog", { name: "Why these priorities?" });
    const chain = within(dialog).getByTestId("why-analog");
    expect(chain).toHaveTextContent("A Mars site is good when its data compares with an Earth site that research shows suits this mission.");
    expect(chain).toHaveTextContent("Proven Earth site: Atacama Desert (Yungay)");
    expect(within(chain).getByRole("link", { name: "NASA ARADS, 2019" })).toBeInTheDocument();
    expect(chain).toHaveTextContent("Compared with Mars site: Jezero Crater");
    expect(within(dialog).getByTestId("why-compare-terrain_safety")).toHaveTextContent("Earth 1.17° · Mars 1.08° — comparable");
    expect(within(dialog).getByTestId("why-compare-elevation_suitability")).toHaveTextContent("— not compared");
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(screen.getByRole("button", { name: "Earth" }));
    fireEvent.click(screen.getByRole("button", { name: "Why these priorities?" }));
    dialog = screen.getByRole("dialog", { name: "Why these priorities?" });
    expect(within(dialog).getByTestId("why-analog")).toHaveTextContent("An Earth site is good when its data compares with the Mars data.");
    expect(within(dialog).getByTestId("why-compare-surface_roughness")).toHaveTextContent("Earth 126.5 m · Mars 194.4 m — comparable");
  });

  it("ranks Earth sites by their analog similarity to the paired Mars site", async () => {
    mockInterpret({ ...LLM_BODY, analog_check: ANALOG });
    renderTab();
    await saveMission();
    const earth = useAppStore.getState().missionRequirements.earth;
    expect(earth.analog_reference_id).toBe("jezero_crater");
    // the slope/relief targets are untouched: the similarity ranking does not use them
    expect(earth.slope_target_deg).toBe(1);
    expect(earth.relief_target_m).toBe(100);
    fireEvent.click(screen.getByRole("button", { name: "Why these priorities?" }));
    expect(screen.getByTestId("why-shared")).toHaveTextContent("Shared landforms: alluvial fan · Shared minerals: sulfates");
  });

  it("says plainly when the proven Earth site has no recent research", async () => {
    mockInterpret({ ...LLM_BODY, analog_check: { ...ANALOG, earth_site_id: "haughton_crater", earth_site_name: "Haughton impact structure", research: [] } });
    renderTab();
    await saveMission();
    fireEvent.click(screen.getByRole("button", { name: "Why these priorities?" }));
    expect(within(screen.getByRole("dialog")).getByTestId("why-analog")).toHaveTextContent("No research from the last 15 years on this site in the evidence registry.");
  });
});

describe("Mission Design next step", () => {
  beforeEach(() => { useAppStore.setState({ viewedBody: "mars", followObjective: true, selectedMarsId: null, selectedSiteId: null, selectedEarthId: null, missionDestination: "mars", task: "landing_screening", appliedTask: null, activeTab: "mission", exploreMode: "browse" }); });
  afterEach(() => { setDiscoveryService(deadService); });

  it("a supported new-region Jezero objective leads to Explore candidates, which opens Find Earth Analogs", async () => {
    setDiscoveryService(connectedService());
    mockInterpret({ ...mission.interpret, task_interpretation: { task: "analog_site_selection", focus_body: "earth", mission_destination: "mars", reference_site: { body: "mars", id: "jezero_crater", name: "Jezero Crater", matched_text: "Jezero" }, unresolved_sites: [], direction_options: [], analog_suggestions: [], rationale: [] } });
    renderTab();
    const box = screen.getByLabelText("Your mission objective");
    fireEvent.change(box, { target: { value: DEFAULT_MISSION_OBJECTIVE } });
    fireEvent.keyDown(box, { key: "Enter" });
    const next = await screen.findByTestId("mission-next-step");
    await waitFor(() => expect(next).toHaveAttribute("data-route", "discovery"));
    expect(next).toHaveTextContent(/fixed set of surveyed Earth footprints.*Jezero Crater.*not a global search/);
    expect(screen.queryByTestId("mission-unsupported")).toBeNull();
    fireEvent.click(within(next).getByRole("button", { name: /Explore candidates/ }));
    expect(useAppStore.getState()).toMatchObject({ activeTab: "explore", exploreMode: "find_analogs" });
  });

  it("an objective that asks for new regions around another reference is routed honestly to the established analogs", async () => {
    setDiscoveryService(connectedService());
    mockInterpret({ ...mission.interpret, task_interpretation: { task: "analog_site_selection", focus_body: "earth", mission_destination: "mars", reference_site: { body: "mars", id: "elysium_planitia", name: "Elysium Planitia (InSight)", matched_text: "Elysium" }, unresolved_sites: [], direction_options: [], analog_suggestions: [], rationale: [] } });
    const onExplore = vi.fn();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><LeftSidebar defaults={defaults} defaultsError={null} evaluation={evaluation} evaluationError={null} onExploreMission={onExplore} exploreReady /></QueryClientProvider>);
    const box = screen.getByLabelText("Your mission objective");
    fireEvent.change(box, { target: { value: "Discover new Earth regions resembling Elysium Planitia" } });
    fireEvent.keyDown(box, { key: "Enter" });
    const next = await screen.findByTestId("mission-next-step");
    expect(next).toHaveAttribute("data-route", "established_analogs");
    expect(screen.getByTestId("mission-unsupported")).toHaveTextContent(/only exists for Jezero Crater; it cannot find new regions for Elysium Planitia/);
    fireEvent.click(within(next).getByRole("button", { name: /Explore established analogs/ }));
    expect(onExplore).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().exploreMode).toBe("browse");
  });

  it("a reading with no task asks the user to choose a supported workflow instead of guessing", async () => {
    mockInterpret({ ...mission.interpret, task_interpretation: undefined });
    renderTab();
    await saveMission("Something about rocks and dust");
    const next = screen.getByTestId("mission-next-step");
    expect(next).toHaveAttribute("data-route", "choose");
    expect(next).toHaveTextContent(/does not guess/);
    expect(within(next).getByRole("button", { name: "Mars landing screening" })).toBeInTheDocument();
    expect(within(next).getByRole("button", { name: "Established Earth analogs" })).toBeInTheDocument();
    // no survey is reachable in this test, so the discovery choice is disabled rather than shown as if it worked
    expect(within(next).getByRole("button", { name: "New Earth terrain resembling Jezero" })).toBeDisabled();
  });

  it("returning to edit the objective keeps research notes and the discovery selection", async () => {
    mockInterpret();
    useCandidateResearchTarget.setState({ target: { runId: "run-1", candidateId: "c-1" }, drafts: { "run-1:c-1": { status: "in_progress", notes: "Keep me across a mission edit.", findings: [], checked: [], baseUpdatedAt: null } } });
    useDiscoveryStore.setState({ runId: "run-1", runs: { "run-1": { ranked: true, selectedCandidateId: "c-1", autoSelected: true } } });
    renderTab();
    await saveMission();
    fireEvent.click(screen.getByRole("button", { name: /Edit Mission/ }));
    expect(screen.queryByTestId("draft-badge")).toBeNull();
    fireEvent.change(screen.getByLabelText("Your mission objective"), { target: { value: "Prioritise landing safety over sunlight; ignore solar. Also avoid dust." } });
    expect(screen.getByTestId("draft-badge")).toHaveTextContent(/Draft · not applied/);
    expect(screen.getByTestId("mission-next-step")).toHaveTextContent(/Apply your edited objective first/);
    fireEvent.click(screen.getByRole("button", { name: /Apply changes/ }));
    await waitFor(() => expect(interpretCalls).toHaveLength(2));
    await screen.findByTestId("mission-text");
    expect(useCandidateResearchTarget.getState().drafts["run-1:c-1"].notes).toBe("Keep me across a mission edit.");
    expect(useDiscoveryStore.getState().runs["run-1"].selectedCandidateId).toBe("c-1");
  });
});
