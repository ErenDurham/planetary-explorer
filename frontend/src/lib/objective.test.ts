import { describe, expect, it } from "vitest";
import { recommendObjective } from "./objective";
const defaults = {terrain_safety:35,elevation_suitability:25,surface_roughness:20,thermal_conditions:10,solar_illumination:10};
describe("mission objective suggestions", () => {
  it("raises supported priorities and excludes unavailable temperature", () => {
    const plan = recommendObjective("Safe landing with solar energy", defaults, ["thermal_conditions"]);
    expect(plan.weights.solar_illumination).toBeGreaterThan(defaults.solar_illumination);
    expect(plan.weights.terrain_safety).toBeGreaterThan(defaults.terrain_safety);
    expect(plan.weights.thermal_conditions).toBe(0);
    expect(defaults.thermal_conditions).toBe(10);
  });
  it("discloses unsupported science goals rather than inventing score factors", () => {
    const plan = recommendObjective("Search for subsurface ice near a permanent base", defaults, []);
    expect(plan.weights).toEqual(defaults);
    expect(plan.notes.join(" ")).toContain("The landing model does not cover these needs");
  });
  it("does not reverse the user's intent when exclusions are present", () => {
    const plan = recommendObjective("Ignore solar energy and prefer mobility", defaults, []);
    expect(plan.weights).toEqual(defaults);
    expect(plan.notes.join(" ")).toContain("Simple keyword rules cannot read these reliably");
  });
});
