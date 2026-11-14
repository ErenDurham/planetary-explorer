// Objective interpretation flow: Suggest -> reviewable proposal -> edit ->
// Apply, with provenance labels that never call a draft "interpreted", a
// staleness notice when the text changes, and an offline rule-based fallback.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import mission from "@/test/fixtures/mission_examples.json";
import { useAppStore } from "@/store/useAppStore";
import { MissionObjective } from "./MissionObjective";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const defaults = { terrain_safety: 35, elevation_suitability: 25, surface_roughness: 20, thermal_conditions: 10, solar_illumination: 10 };
const current = { terrain_safety: 27, elevation_suitability: 19, surface_roughness: 23, thermal_conditions: 0, solar_illumination: 31 };

let interpretCalls: Array<Record<string, unknown>> = [];

function seed() {
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
    render(<MissionObjective excluded={["thermal_conditions"]} />);

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
    render(<MissionObjective excluded={["thermal_conditions"]} />);
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
    render(<MissionObjective excluded={["thermal_conditions"]} />);
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
