// Objective interpretation flow: Suggest -> reviewable proposal -> edit ->
// Apply, with provenance labels that never call a draft "interpreted", a
// staleness notice when the text changes, and an offline rule-based fallback.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import mission from "@/test/fixtures/mission_examples.json";
import { useAppStore } from "@/store/useAppStore";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MissionObjective } from "./MissionObjective";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const defaults = { terrain_safety: 35, elevation_suitability: 25, surface_roughness: 20, thermal_conditions: 10, solar_illumination: 10 };
const current = { terrain_safety: 27, elevation_suitability: 19, surface_roughness: 23, thermal_conditions: 0, solar_illumination: 31 };

let interpretCalls: Array<Record<string, unknown>> = [];

function seed() {
  useAppStore.setState(useAppStore.getInitialState(), true);
  useAppStore.setState({
    defaultWeights: defaults,
    weights: { ...current },
    recommendedWeights: { ...current },
    missionObjective: "Prioritise landing safety over sunlight; ignore solar",
    appliedObjective: "Find a safe landing site with reliable solar energy.",
    appliedObjectiveHash: null,
    appliedObjectiveSource: "rule_based",
    appliedObjectiveModel: null,
    objectiveNotes: [],
  });
}

describe("MissionObjective interpretation", () => {
  beforeEach(() => {
    interpretCalls = [];
    seed();
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders the reviewable proposal with a model provenance badge, applies edited weights, then goes stale when the draft changes", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).endsWith("/mission/interpret")) {
        interpretCalls.push(JSON.parse(String(init?.body)));
        return json({ ...mission.interpret, generated_by: "llm", model: "test-model" });
      }
      return json({ error: { code: "not_found", message: `unmocked ${String(input)}` } }, 404);
    });
    render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MissionObjective excluded={["thermal_conditions"]} /></QueryClientProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Suggest priorities" }));
    const region = await screen.findByRole("region", { name: "Proposed priority allocation" });
    expect(interpretCalls).toHaveLength(1);
    expect(interpretCalls[0]).toMatchObject({ objective: "Prioritise landing safety over sunlight; ignore solar", current_weights: current, excluded_criteria: ["thermal_conditions"] });

    // provenance, confidence note, table rows and the supporting lists
    expect(region).toHaveTextContent("Interpreted by language model (test-model)");
    expect(region).toHaveTextContent("confidence high");
    expect(region).toHaveTextContent(/Confidence is about how clearly the text was read, not about any site's suitability/);
    expect(region).toHaveTextContent("Solar illumination (annual mean, top of atmosphere)");
    expect(region).toHaveTextContent("no data · forced to 0"); // thermal_conditions, data_available=false
    expect(region).toHaveTextContent("Cannot be scored by this model");
    expect(region).toHaveTextContent("Subsurface ice is not a landing-phase criterion in this model.");
    expect(region).toHaveTextContent("Should elevation be de-emphasised as well?");
    expect(region).toHaveTextContent("thermal_conditions forced to 0: no measurements.");
    expect(screen.getByLabelText("Proposed share for Solar illumination (annual mean, top of atmosphere)")).toHaveValue(0);

    // nothing applied yet
    expect(useAppStore.getState().weights.terrain_safety).toBe(27);

    // edit a proposed weight, then apply
    const terrain = screen.getByLabelText("Proposed share for Terrain safety (regional slope)");
    expect(terrain).toHaveValue(43);
    fireEvent.change(terrain, { target: { value: "80" } });
    fireEvent.click(screen.getByRole("button", { name: /Apply to priorities/ }));

    const s = useAppStore.getState();
    expect(s.weights).toEqual({ terrain_safety: 58, elevation_suitability: 19, surface_roughness: 23, thermal_conditions: 0, solar_illumination: 0 });
    expect(s.recommendedWeights.terrain_safety).toBe(58);
    expect(s.appliedObjective).toBe("Prioritise landing safety over sunlight; ignore solar");
    expect(s.appliedObjectiveHash).toBe("ac7ffbd73f2cf0d5");
    expect(s.appliedObjectiveSource).toBe("llm");
    expect(s.appliedObjectiveModel).toBe("test-model");
    expect(s.objectiveNotes.join(" ")).toContain("Cannot be scored by this model: Subsurface ice");
    expect(s.objectiveNotes.join(" ")).toContain("You edited the proposed shares");
    // the review box closes once applied; the applied provenance is shown
    expect(screen.queryByRole("region", { name: "Proposed priority allocation" })).toBeNull();
    expect(screen.getByText(/Applied objective:/)).toBeInTheDocument();
    expect(screen.getByText("Interpreted by language model (test-model)")).toBeInTheDocument();

    // a second suggestion goes stale when the draft is edited afterwards
    fireEvent.click(screen.getByRole("button", { name: "Suggest priorities" }));
    await screen.findByRole("region", { name: "Proposed priority allocation" });
    expect(screen.getByRole("button", { name: /Apply to priorities/ })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Your mission objective"), { target: { value: "Prioritise landing safety over sunlight; ignore solar and avoid dust" } });
    expect(await screen.findByText(/Objective changed since this suggestion/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply to priorities/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Re-run Suggest priorities" })).toBeInTheDocument();
    expect(screen.getByLabelText("Proposed share for Terrain safety (regional slope)")).toBeDisabled();
    // the stale interpreted badge is greyed, not removed and not relabelled
    const badges = screen.getAllByText("Interpreted by language model (test-model)");
    expect(badges.some((b) => b.closest("span")?.className.includes("opacity-50"))).toBe(true);
    expect(useAppStore.getState().appliedObjective).toBe("Prioritise landing safety over sunlight; ignore solar");
  });

  it("falls back to the offline rule-based reading when /mission/interpret rejects, and labels it so", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MissionObjective excluded={["thermal_conditions"]} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Suggest priorities" }));
    const region = await screen.findByRole("region", { name: "Proposed priority allocation" });
    expect(region).toHaveTextContent("Offline rule-based suggestion");
    expect(region).not.toHaveTextContent(/Interpreted by language model/);
    expect(region).toHaveTextContent(/Backend unreachable/);
    expect(region).toHaveTextContent(/no language model was involved/);
    // the local rules refuse to guess at exclusions, and say so
    expect(region).toHaveTextContent(/cannot interpret those reliably/);
    fireEvent.click(screen.getByRole("button", { name: /Apply to priorities/ }));
    const s = useAppStore.getState();
    expect(s.appliedObjectiveSource).toBe("offline_rule_based");
    expect(s.appliedObjectiveHash).toMatch(/^local-/);
    expect(s.weights.thermal_conditions).toBe(0);
    expect(screen.getByText("Offline rule-based suggestion")).toBeInTheDocument();
  });

  it("discards a proposal without touching the store", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(mission.interpret));
    render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MissionObjective excluded={["thermal_conditions"]} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Suggest priorities" }));
    const region = await screen.findByRole("region", { name: "Proposed priority allocation" });
    expect(within(region).getByText("Rule-based reading (no model)")).toBeInTheDocument();
    expect(within(region).queryByText(/Interpreted by language model/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByRole("region", { name: "Proposed priority allocation" })).toBeNull();
    expect(useAppStore.getState().weights).toEqual(current);
    expect(useAppStore.getState().appliedObjective).toBe("Find a safe landing site with reliable solar energy.");
  });
});

// ---- Earth-Mars release: the Task block of the proposal review -------------
const analogDefaults = [
  { feature_id: "slope_regional_median_deg", label: "Similar slopes", weight: 30, reason: "Mobility / terrain wording." },
  { feature_id: "roughness_regional_m", label: "Similar regional relief", weight: 30, reason: "Mobility / terrain wording." },
  { feature_id: "terrain_morphology", label: "Similar landforms", weight: 25, reason: "Mobility / terrain wording." },
  { feature_id: "mineralogy_tags", label: "Similar materials", weight: 10, reason: "Lowered." },
  { feature_id: "precipitation_mm_day", label: "Dryness", weight: 5, reason: "Default analog weight (spec)." },
];

describe("MissionObjective task reading", () => {
  beforeEach(() => { interpretCalls = []; seed(); useAppStore.setState({ viewedBody: "mars", followObjective: true, selectedMarsId: null, selectedSiteId: null, selectedEarthId: null, missionDestination: "mars" }); });
  afterEach(() => vi.restoreAllMocks());

  it("shows the task, focus body, destination and reference, and applies them with the landing weights in one action (destination stays Mars)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ ...mission.interpret, task_interpretation: { task: "analog_site_selection", focus_body: "earth", mission_destination: "mars", reference_site: { body: "mars", id: "elysium_planitia", name: "Elysium Planitia (InSight)", matched_text: "Elysium" }, unresolved_sites: [], direction_options: [], analog_suggestions: analogDefaults, rationale: ["The text asks for a location on Earth."] } }));
    render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MissionObjective excluded={["thermal_conditions"]} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Suggest priorities" }));
    const task = await screen.findByTestId("task-review");
    expect(within(task).getByTestId("task-proposed")).toHaveTextContent("Analog site selection");
    expect(within(task).getByTestId("task-focus")).toHaveTextContent("Earth");
    expect(within(task).getByTestId("task-destination")).toHaveTextContent("Mars");
    expect(within(task).getByTestId("task-reference")).toHaveTextContent("Elysium Planitia (InSight) (Mars)");
    expect(task).toHaveTextContent("Analog match preferences (separate from landing priorities)");
    expect(task).toHaveTextContent("Analog shares total 100%.");
    expect(screen.getByText("Landing priorities (Mars suitability)")).toBeInTheDocument();
    // provenance badge is unchanged (one on the applied line, one on the proposal)
    expect(within(task.closest("[role=region]") as HTMLElement).getByText("Rule-based reading (no model)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Apply to priorities/ }));
    const s = useAppStore.getState();
    expect(s.task).toBe("analog_site_selection");
    expect(s.viewedBody).toBe("earth");
    expect(s.missionDestination).toBe("mars");
    expect(s.appliedReference).toEqual({ body: "mars", id: "elysium_planitia", name: "Elysium Planitia (InSight)" });
    expect(s.selectedMarsId).toBe("elysium_planitia");
    expect(s.analogWeights).toEqual({ slope_regional_median_deg: 30, roughness_regional_m: 30, terrain_morphology: 25, mineralogy_tags: 10, precipitation_mm_day: 5 });
    expect(s.recommendedAnalogWeights).toEqual(s.analogWeights);
    expect(s.weights.thermal_conditions).toBe(0); // landing weights still applied
    expect(s.missionType).toBe("rover_field_test"); // Earth uses its explicit task profile rather than the Mars landing model.
  });

  it("keeps Apply disabled on an ambiguous reading until a direction is chosen, and never guesses an unresolved site", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ ...mission.interpret, task_interpretation: { task: "ambiguous", focus_body: null, mission_destination: "mars", reference_site: null, unresolved_sites: [{ matched_text: "the crater", options: [{ body: "mars", id: "gale_crater", name: "Gale Crater (Bradbury Landing)", matched_text: "gale" }, { body: "earth", id: "haughton_crater", name: "Haughton impact structure", matched_text: "haughton" }] }], direction_options: [{ task: "analog_site_selection", focus_body: "earth", label: "Find Earth sites like a Mars site", description: "Pick a Mars reference." }, { task: "analog_site_selection", focus_body: "mars", label: "Find Mars sites like an Earth site", description: "Pick an Earth reference." }], analog_suggestions: analogDefaults, rationale: [] } }));
    render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MissionObjective excluded={["thermal_conditions"]} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Suggest priorities" }));
    const task = await screen.findByTestId("task-review");
    expect(within(task).getByTestId("task-proposed")).toHaveTextContent("Ambiguous");
    expect(within(task).getByTestId("task-reference")).toHaveTextContent("unresolved - pick below");
    const applyButton = screen.getByRole("button", { name: /Apply to priorities/ });
    expect(applyButton).toBeDisabled();
    fireEvent.click(within(task).getByRole("radio", { name: /Find Mars sites like an Earth site/ }));
    expect(applyButton).toBeEnabled();
    expect(within(task).getByTestId("task-focus")).toHaveTextContent("Mars");
    fireEvent.change(within(task).getByRole("combobox", { name: /Site for “the crater”/ }), { target: { value: "haughton_crater" } });
    expect(within(task).getByTestId("task-reference")).toHaveTextContent("Haughton impact structure (Earth)");
    fireEvent.click(applyButton);
    const s = useAppStore.getState();
    expect(s.task).toBe("analog_site_selection");
    expect(s.viewedBody).toBe("mars");
    expect(s.selectedEarthId).toBe("haughton_crater");
    expect(s.selectedMarsId).toBeNull();
  });
});
