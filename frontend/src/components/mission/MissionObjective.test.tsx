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
import { roverSharesFrom, useAppStore } from "@/store/useAppStore";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { InfoTip } from "@/components/ui/InfoTip";
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
  return screen.findByLabelText("Gentler terrain share of priorities");
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
  it("opens on the chat box alone, then Enter interprets, applies and brings in the sliders and pie", async () => {
    mockInterpret();
    const { container } = renderTab();

    expect(screen.getByRole("heading", { name: "Mission Design" })).toBeInTheDocument();
    expect(screen.getByText("Tell us what your mission is")).toBeInTheDocument();
    const box = screen.getByLabelText("Your mission objective");
    expect(box).toHaveValue("");
    expect(box).toHaveAttribute("placeholder", "We want to land on Mars to establish a Research Base.");
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
    expect(screen.queryByText("Tell us what your mission is")).toBeNull();

    // applied straight to the store as shares, with the model's provenance and its research
    const s = useAppStore.getState();
    expect(s.weights).toEqual({ terrain_safety: 43, elevation_suitability: 26, surface_roughness: 31, thermal_conditions: 0, solar_illumination: 0 });
    expect(s.recommendedWeights).toEqual(s.weights);
    expect(s.appliedObjective).toBe(TEXT);
    expect(s.appliedObjectiveSource).toBe("llm");
    expect(s.appliedObjectiveModel).toBe("test-model");
    expect(s.appliedInterpretation?.evidence.terrain_safety).toEqual([SLOPE]);
    expect(s.appliedInterpretation?.missionProfile).toBe("human");
    expect(screen.getByLabelText("Gentler terrain share of priorities")).toHaveValue("43");
    // no provenance badges and no keyword-matching notice when the model ran
    expect(screen.queryByText(/rule.based/i)).toBeNull();
    expect(screen.queryByTestId("no-model-notice")).toBeNull();

    // pie beside the sliders: a slice per non-zero share; numbers only on hover
    expect(screen.getByText("Priority distribution")).toBeInTheDocument();
    expect(screen.getByTestId("pie-slice-terrain_safety")).toHaveAttribute("aria-label", "Gentler terrain: 43%");
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByLabelText("Gentler terrain share of priorities");
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByTestId("mission-text")).toHaveTextContent("Smooth terrain for a rover");
    await waitFor(() => expect(interpretCalls).toHaveLength(2));
    expect(interpretCalls[1].objective).toBe("Smooth terrain for a rover");
    // the sliders stay in view while the new text is read
    expect(screen.getByLabelText("Gentler terrain share of priorities")).toBeInTheDocument();
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

    const label = screen.getByText("Gentler terrain", { selector: "label" });
    fireEvent.mouseEnter(label);
    expect(screen.getByTestId("priority-popup-terrain_safety")).toHaveTextContent("43%");
    // the sentence is static: it does not change with the share
    fireEvent.change(screen.getByLabelText("Gentler terrain share of priorities"), { target: { value: "60" } });
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

  it("a slider's info box closes as soon as the mouse leaves it; other info tips are unchanged", async () => {
    mockInterpret();
    renderTab();
    await saveMission();
    const summary = screen.getByLabelText("About Gentler terrain");
    const details = summary.closest("details")!;
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    fireEvent.mouseLeave(details);
    expect(details.open).toBe(false);

    render(<InfoTip label="Plain tip">text</InfoTip>);
    const plain = screen.getByLabelText("Plain tip").closest("details")!;
    fireEvent.click(screen.getByLabelText("Plain tip"));
    fireEvent.mouseLeave(plain);
    expect(plain.open).toBe(true);
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
      "Gentler terrain share of priorities", "Lower elevation share of priorities", "Smoother terrain share of priorities", "Solar energy share of priorities"]);
    expect(screen.queryByLabelText("Target regional slope share of priorities")).toBeNull();
    // no Earth reading in this response, so Earth starts from the Mars weights
    expect(screen.getByLabelText("Gentler terrain share of priorities")).toHaveValue("43");
    fireEvent.change(screen.getByLabelText("Smoother terrain share of priorities"), { target: { value: "60" } });
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
    expect(screen.getByLabelText("Gentler terrain share of priorities")).toHaveValue("43");

    fireEvent.click(screen.getByRole("button", { name: "Earth" }));
    expect(screen.getByTestId("earth-priorities")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mission priorities" })).toBeInTheDocument(); // same heading and design as Mars
    expect(screen.getByLabelText("Gentler terrain share of priorities")).toHaveValue("30");
    expect(screen.getByLabelText("Lower elevation share of priorities")).toHaveValue("0");
    expect(screen.getByLabelText("Smoother terrain share of priorities")).toHaveValue("50");
    expect(screen.getByLabelText("Solar energy share of priorities")).toHaveValue("20");
    expect(screen.getByText("Priority distribution")).toBeInTheDocument();
    expect(screen.getByTestId("pie-slice-surface_roughness")).toHaveAttribute("aria-label", "Smoother terrain: 50%");
    fireEvent.change(screen.getByLabelText("Gentler terrain share of priorities"), { target: { value: "40" } });

    fireEvent.click(screen.getByRole("button", { name: "Mars" }));
    expect(screen.getByTestId("mars-priorities")).toBeInTheDocument();
    expect(useAppStore.getState().missionType).toBe("landing");
    expect(screen.getByLabelText("Gentler terrain share of priorities")).toHaveValue("43"); // Mars untouched

    fireEvent.click(screen.getByRole("button", { name: "Earth" }));
    expect(screen.getByLabelText("Gentler terrain share of priorities")).toHaveValue("40"); // the user's Earth edit kept
    fireEvent.click(screen.getByRole("button", { name: "Reset priorities to the applied objective's suggestion" }));
    expect(screen.getByLabelText("Gentler terrain share of priorities")).toHaveValue("30"); // Reset = the LLM's Earth suggestion
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

  it("shows 'Considering the rocket science...' while the model reads the mission", async () => {
    let release!: (r: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>((resolve) => { release = resolve; }));
    renderTab();
    const box = screen.getByLabelText("Your mission objective");
    fireEvent.change(box, { target: { value: TEXT } });
    fireEvent.keyDown(box, { key: "Enter" });
    const text = await screen.findByText("Considering the rocket science...");
    const loading = screen.getByTestId("mission-loading");
    expect(loading).toHaveClass("text-xl", "justify-center", "items-center");
    // a star circling like a spinner, to the left of the text and sized to it (em-based)
    const star = within(loading).getByTestId("shooting-star");
    expect(star).toHaveClass("star-spinner", "h-[1.35em]", "w-[1.35em]");
    expect(star.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(loading.querySelector(".animate-spin")).toBeNull();
    release(json(EARTH_BODY));
    await screen.findByLabelText("Gentler terrain share of priorities");
    expect(screen.queryByText("Considering the rocket science...")).toBeNull();
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
