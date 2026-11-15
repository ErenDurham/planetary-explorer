import { describe, expect, it } from "vitest";
import { routeForMission } from "./missionRoute";
import { DEFAULT_MISSION_OBJECTIVE } from "./defaultObjective";

const jezero = { id: "jezero_crater", name: "Jezero Crater", body: "mars" as const };
const elysium = { id: "elysium_planitia", name: "Elysium Planitia (InSight)", body: "mars" as const };

describe("where an applied mission goes next", () => {
  it("sends a new-region Jezero objective to the discovery pilot when a survey is installed", () => {
    const r = routeForMission({ objective: DEFAULT_MISSION_OBJECTIVE, task: "analog_site_selection", reference: jezero, focusBody: "earth", discoveryReady: true });
    expect(r.kind).toBe("discovery");
    expect(r.cta).toBe("Explore candidates");
    expect(r.detail).toMatch(/bounded set of surveyed Earth footprints.*Jezero Crater.*regional median slope and detrended relief.*not a global search/);
    expect(r.unsupported).toBeUndefined();
  });

  it("says plainly when the pilot is unavailable, and routes to the established analogs", () => {
    const r = routeForMission({ objective: DEFAULT_MISSION_OBJECTIVE, task: "analog_site_selection", reference: jezero, focusBody: "earth", discoveryReady: false });
    expect(r.kind).toBe("established_analogs");
    expect(r.unsupported).toMatch(/unavailable in this session/);
    expect(r.detail).toMatch(/No discovery survey is installed/);
  });

  it("never shows Jezero results for a new-region objective about another reference", () => {
    const r = routeForMission({ objective: "Find new Earth regions resembling Elysium Planitia", task: "analog_site_selection", reference: elysium, focusBody: "earth", discoveryReady: true });
    expect(r.kind).toBe("established_analogs");
    expect(r.unsupported).toMatch(/only exists for Jezero Crater; it cannot find new regions for Elysium Planitia/);
    expect(r.detail).toMatch(/established analogs against Elysium Planitia/);
  });

  it("routes a plain analog objective to the established analogs, with a hint about the pilot for Jezero", () => {
    const r = routeForMission({ objective: "Which established Earth analog best matches Jezero Crater's terrain?", task: "analog_site_selection", reference: jezero, focusBody: "earth", discoveryReady: true });
    expect(r.kind).toBe("established_analogs");
    expect(r.detail).toMatch(/say so in the objective: the discovery pilot covers Jezero Crater/);
    expect(r.unsupported).toBeUndefined();
  });

  it("routes landing screening to the Mars catalog and flags a new-region ask there as unsupported", () => {
    expect(routeForMission({ objective: "Find a safe landing site with reliable solar energy.", task: "landing_screening", reference: null, focusBody: "mars", discoveryReady: true })).toMatchObject({ kind: "landing_screening", cta: "Explore Mars sites", unsupported: undefined });
    expect(routeForMission({ objective: "Discover new landing regions on Mars", task: "landing_screening", reference: null, focusBody: "mars", discoveryReady: true }).unsupported).toMatch(/only available for Earth terrain compared with Jezero Crater/);
  });

  it("asks the user to choose when the task could not be read, rather than guessing", () => {
    const r = routeForMission({ objective: "Something about rocks", task: null, reference: null, focusBody: null, discoveryReady: true });
    expect(r.kind).toBe("choose");
    expect(r.detail).toMatch(/does not guess/);
  });
});
