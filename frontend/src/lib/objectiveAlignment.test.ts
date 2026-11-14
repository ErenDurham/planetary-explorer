import { describe, expect, it } from "vitest";
import { useAppStore } from "@/store/useAppStore";
import { recommendObjective } from "./objective";

describe("objective alignment", () => {
  it("restores the applied objective after a manual change instead of unrelated model defaults", () => {
    const saved = useAppStore.getState();
    try {
      const defaults = {terrain_safety:35,elevation_suitability:25,surface_roughness:20,thermal_conditions:10,solar_illumination:10};
      const text = "Safe landing with solar energy";
      const plan = recommendObjective(text, defaults, ["thermal_conditions"]);
      useAppStore.getState().setDefaultWeights(defaults);
      useAppStore.getState().applyObjective(text, plan.weights, plan.notes);
      useAppStore.getState().setWeight("solar_illumination", 3);
      useAppStore.getState().resetWeights();
      expect(useAppStore.getState().weights).toEqual({terrain_safety:27,elevation_suitability:19,surface_roughness:23,thermal_conditions:0,solar_illumination:31});
      expect(useAppStore.getState().appliedObjective).toBe(text);
      expect(useAppStore.getState().weights.solar_illumination).toBe(31);
    } finally { useAppStore.setState(saved); }
  });
});
