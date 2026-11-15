import { describe, expect, it } from "vitest";
import { routeForMission } from "./missionRoute";
import { DEFAULT_MISSION_OBJECTIVE } from "./defaultObjective";

const jezero = { id: "jezero_crater", name: "Jezero Crater", body: "mars" as const };
const elysium = { id: "elysium_planitia", name: "Elysium Planitia (InSight)", body: "mars" as const };

describe("where an applied mission goes next", () => {
  it("sends an analog objective to the established analogs (the discovery page was removed)", () => {
    const r = routeForMission({ objective: DEFAULT_MISSION_OBJECTIVE, task: "analog_site_selection", reference: jezero, focusBody: "earth", discoveryReady: true });
    expect(r.kind).toBe("established_analogs");
    expect(r.cta).toBe("Explore established analogs");
    expect(r.detail).toMatch(/established Earth analogs against Jezero Crater/);
    expect(r.unsupported).toBeUndefined();
  });

  it("never mentions a discovery pilot, whatever the objective asks", () => {
    const r = routeForMission({ objective: "Find new Earth regions resembling Elysium Planitia", task: "analog_site_selection", reference: elysium, focusBody: "earth", discoveryReady: false });
    expect(r.kind).toBe("established_analogs");
    expect(`${r.detail} ${r.unsupported ?? ""}`).not.toMatch(/discovery|pilot/i);
    expect(r.detail).toMatch(/established Earth analogs against Elysium Planitia/);
  });

  it("routes landing screening to the Mars catalog", () => {
    expect(routeForMission({ objective: "Find a safe landing site with reliable solar energy.", task: "landing_screening", reference: null, focusBody: "mars", discoveryReady: false })).toMatchObject({ kind: "landing_screening", cta: "Explore Mars sites" });
  });

  it("asks the user to choose when the task could not be read, rather than guessing", () => {
    const r = routeForMission({ objective: "Something about rocks", task: null, reference: null, focusBody: null, discoveryReady: false });
    expect(r.kind).toBe("choose");
    expect(r.detail).toMatch(/does not guess/);
  });
});
