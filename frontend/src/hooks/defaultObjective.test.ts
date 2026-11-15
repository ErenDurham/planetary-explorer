import { describe, expect, it } from "vitest";
import { DEFAULT_MISSION_OBJECTIVE } from "@/lib/defaultObjective";
import { applicationFromInterpretation, interpretOffline } from "./useInterpretObjective";

describe("built-in analog objective without a backend", () => {
  it("keeps the Earth search and Jezero reference when interpretation is unavailable", () => {
    const reading = interpretOffline(DEFAULT_MISSION_OBJECTIVE, {}, ["thermal_conditions"]);
    const app = applicationFromInterpretation(reading, ["thermal_conditions"], "offline_rule_based");
    expect(app.meta.source).toBe("offline_rule_based");
    expect(app.meta.taskApplication).toMatchObject({ task: "analog_site_selection", focusBody: "earth", missionDestination: "mars", reference: { body: "mars", id: "jezero_crater" } });
  });
  it("does not assign the preset reference to unrelated free text", () => {
    const reading = interpretOffline("Explore an unspecified environment", {}, []);
    expect(applicationFromInterpretation(reading, [], "offline_rule_based").meta.taskApplication).toBeNull();
  });
});
