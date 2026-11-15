// Frontend interaction state for the Expedition Planner. Everything here is a
// user choice or a service response held for display; no scientific value is
// ever derived in this store. Workspace state is keyed by region so switching
// the selected region and coming back restores that region's waypoints.
import { create } from "zustand";
import type { ExpeditionBody, ObjectiveId, OptimizationPreference, PlanResponse, RoverParameters, Waypoint, GeoPoint } from "../adapter/types";
import { newWaypointId } from "../lib/geo";
import { objectiveSpec } from "../lib/objectives";
import type { PlanRun } from "../lib/session";

export type Stage = "intro" | "objective" | "workspace" | "report";
export type MapTool = "pan" | "add";

export interface RegionContext { body: ExpeditionBody; siteId: string }

export interface RegionWorkspace {
  objective: ObjectiveId | null;
  waypoints: Waypoint[];
  selectedWaypointId: string | null;
  targetIds: string[];
  roverProfileId: string | null;
  rover: RoverParameters | null;
  optimization: OptimizationPreference;
  basemapEntryId: string | null;
  tool: MapTool;
  runs: PlanRun[];
  activeRun: number | null;
  /** Run shown beside the active one in the report's comparison; null = none. */
  compareRun: number | null;
}

export const EMPTY_WORKSPACE: RegionWorkspace = {
  objective: null, waypoints: [], selectedWaypointId: null, targetIds: [], roverProfileId: null, rover: null,
  optimization: "balanced", basemapEntryId: null, tool: "add", runs: [], activeRun: null, compareRun: null,
};

export function regionKey(ctx: RegionContext): string { return `${ctx.body}:${ctx.siteId}`; }

interface ExpeditionState {
  open: boolean;
  stage: Stage;
  context: RegionContext | null;
  workspaces: Record<string, RegionWorkspace>;
  /** Open the planner for a region, preserving that region's earlier work. */
  openPlanner: (ctx: RegionContext) => void;
  closePlanner: () => void;
  setStage: (stage: Stage) => void;
  /** Keep the planner open for a newly selected region (the Research page changed site). */
  setContext: (ctx: RegionContext) => void;
  update: (patch: Partial<RegionWorkspace> | ((w: RegionWorkspace) => Partial<RegionWorkspace>)) => void;
  chooseObjective: (id: ObjectiveId) => void;
  addWaypoint: (p: GeoPoint) => string;
  moveWaypoint: (id: string, p: GeoPoint) => void;
  removeWaypoint: (id: string) => void;
  reorderWaypoint: (id: string, direction: -1 | 1) => void;
  selectWaypoint: (id: string | null) => void;
  toggleTarget: (id: string) => void;
  recordRun: (plan: PlanResponse, inputs: PlanRun["inputs"]) => void;
  clearRuns: () => void;
}

export const useExpeditionStore = create<ExpeditionState>((set, get) => ({
  open: false,
  stage: "intro",
  context: null,
  workspaces: {},
  openPlanner: (ctx) => set((s) => ({ open: true, context: ctx, stage: s.workspaces[regionKey(ctx)]?.objective ? "workspace" : "intro", workspaces: { ...s.workspaces, [regionKey(ctx)]: s.workspaces[regionKey(ctx)] ?? { ...EMPTY_WORKSPACE } } })),
  closePlanner: () => set({ open: false }),
  setStage: (stage) => set({ stage }),
  setContext: (ctx) => set((s) => {
    if (s.context && regionKey(s.context) === regionKey(ctx)) return {};
    const existing = s.workspaces[regionKey(ctx)];
    return { context: ctx, stage: existing?.objective ? "workspace" : "intro", workspaces: { ...s.workspaces, [regionKey(ctx)]: existing ?? { ...EMPTY_WORKSPACE } } };
  }),
  update: (patch) => set((s) => {
    if (!s.context) return {};
    const key = regionKey(s.context);
    const w = s.workspaces[key] ?? { ...EMPTY_WORKSPACE };
    const next = typeof patch === "function" ? patch(w) : patch;
    return { workspaces: { ...s.workspaces, [key]: { ...w, ...next } } };
  }),
  chooseObjective: (id) => {
    get().update((w) => ({ objective: id, optimization: w.objective ? w.optimization : (objectiveSpec(id)?.suggestedOptimization ?? "balanced") }));
    set({ stage: "workspace" });
  },
  addWaypoint: (p) => {
    const id = newWaypointId();
    get().update((w) => ({ waypoints: [...w.waypoints, { id, lat: p.lat, lon_east: p.lon_east, label: null }], selectedWaypointId: id }));
    return id;
  },
  moveWaypoint: (id, p) => get().update((w) => ({ waypoints: w.waypoints.map((x) => (x.id === id ? { ...x, lat: p.lat, lon_east: p.lon_east } : x)) })),
  removeWaypoint: (id) => get().update((w) => ({ waypoints: w.waypoints.filter((x) => x.id !== id), selectedWaypointId: w.selectedWaypointId === id ? null : w.selectedWaypointId })),
  reorderWaypoint: (id, direction) => get().update((w) => {
    const i = w.waypoints.findIndex((x) => x.id === id), j = i + direction;
    if (i < 0 || j < 0 || j >= w.waypoints.length) return {};
    const next = [...w.waypoints];
    [next[i], next[j]] = [next[j], next[i]];
    return { waypoints: next };
  }),
  selectWaypoint: (id) => get().update({ selectedWaypointId: id }),
  toggleTarget: (id) => get().update((w) => ({ targetIds: w.targetIds.includes(id) ? w.targetIds.filter((t) => t !== id) : [...w.targetIds, id] })),
  recordRun: (plan, inputs) => get().update((w) => {
    const run = w.runs.length + 1;
    return { runs: [...w.runs, { run, plan, inputs }], activeRun: run, compareRun: w.activeRun ?? w.compareRun };
  }),
  clearRuns: () => get().update({ runs: [], activeRun: null, compareRun: null }),
}));

/** The current region's workspace (an empty one before any region is chosen). */
export function useWorkspace(): RegionWorkspace {
  return useExpeditionStore((s) => (s.context ? s.workspaces[regionKey(s.context)] : undefined) ?? EMPTY_WORKSPACE);
}
