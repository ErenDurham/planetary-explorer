import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_WORKSPACE, regionKey, useExpeditionStore } from "./useExpeditionStore";

const jezero = { body: "mars" as const, siteId: "jezero_crater" };
const gale = { body: "mars" as const, siteId: "gale_crater" };

describe("expedition store", () => {
  beforeEach(() => useExpeditionStore.setState({ open: false, stage: "intro", context: null, workspaces: {} }));

  it("opens on the intro for a new region and remembers each region's work separately", () => {
    const s = useExpeditionStore.getState();
    s.openPlanner(jezero);
    expect(useExpeditionStore.getState().stage).toBe("intro");
    s.chooseObjective("terrain_survey");
    expect(useExpeditionStore.getState().stage).toBe("workspace");
    s.addWaypoint({ lat: 18.5, lon_east: 77.5 });
    s.setContext(gale);
    expect(useExpeditionStore.getState().stage).toBe("intro");
    expect(useExpeditionStore.getState().workspaces[regionKey(gale)]).toEqual(EMPTY_WORKSPACE);
    s.setContext(jezero);
    const w = useExpeditionStore.getState().workspaces[regionKey(jezero)];
    expect(w.objective).toBe("terrain_survey");
    expect(w.waypoints).toHaveLength(1);
    expect(useExpeditionStore.getState().stage).toBe("workspace");
  });

  it("adds, moves, reorders and removes waypoints", () => {
    const s = useExpeditionStore.getState();
    s.openPlanner(jezero);
    const a = s.addWaypoint({ lat: 1, lon_east: 1 });
    const b = s.addWaypoint({ lat: 2, lon_east: 2 });
    s.moveWaypoint(a, { lat: 1.5, lon_east: 1.5 });
    s.reorderWaypoint(b, -1);
    let w = useExpeditionStore.getState().workspaces[regionKey(jezero)];
    expect(w.waypoints.map(x => x.id)).toEqual([b, a]);
    expect(w.waypoints[1]).toMatchObject({ lat: 1.5, lon_east: 1.5 });
    expect(w.selectedWaypointId).toBe(b);
    s.removeWaypoint(b);
    w = useExpeditionStore.getState().workspaces[regionKey(jezero)];
    expect(w.waypoints.map(x => x.id)).toEqual([a]);
    expect(w.selectedWaypointId).toBeNull();
  });

  it("seeds the optimisation preference from the objective only the first time", () => {
    const s = useExpeditionStore.getState();
    s.openPlanner(jezero);
    s.chooseObjective("geological_sampling");
    expect(useExpeditionStore.getState().workspaces[regionKey(jezero)].optimization).toBe("lowest_risk");
    s.update({ optimization: "shortest_distance" });
    s.chooseObjective("research_traverse");
    expect(useExpeditionStore.getState().workspaces[regionKey(jezero)].optimization).toBe("shortest_distance");
  });

  it("records runs in order and keeps the previous run as the comparison", () => {
    const s = useExpeditionStore.getState();
    s.openPlanner(jezero);
    const plan = { plan_id: "p" } as never;
    s.recordRun(plan, { waypoints: 1, targets: 0, optimization: "balanced", roverProfile: null });
    s.recordRun(plan, { waypoints: 2, targets: 0, optimization: "balanced", roverProfile: null });
    const w = useExpeditionStore.getState().workspaces[regionKey(jezero)];
    expect(w.runs.map(r => r.run)).toEqual([1, 2]);
    expect(w.activeRun).toBe(2);
    expect(w.compareRun).toBe(1);
  });
});
