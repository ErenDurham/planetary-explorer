// Where an applied mission sends the user next, said honestly. The discovery
// pilot is the only "new region" capability and it is bounded: a fixed set of
// surveyed Earth footprints compared with Jezero Crater on regional median
// the features each survey declares. Everything else routes to a workflow that does
// exist (the established analogs ranked against the reference, or Mars
// landing screening), and an objective whose task could not be read is not
// guessed at: the user is asked to choose a supported task. Nothing here
// changes a score or a reading; it only decides the next action and its words.
import type { Body, Task } from "@/store/useAppStore";

export type MissionRouteKind = "discovery" | "established_analogs" | "landing_screening" | "choose";

export interface MissionRoute {
  kind: MissionRouteKind;
  /** The action's label. */
  cta: string;
  /** One or two plain sentences on what the user will get, including what is NOT covered. */
  detail: string;
  /** Set when the objective asked for something the pilot cannot do, so the UI can say so prominently. */
  unsupported?: string;
}

export interface MissionRouteInput {
  objective: string;
  task: Task | null;
  reference: { id: string; name: string; body: Body } | null;
  focusBody: Body | null;
  /** The discovery service reports an installed survey. */
  discoveryReady: boolean;
}

export const DISCOVERY_REFERENCE_ID = "jezero_crater";

export function routeForMission(input: MissionRouteInput): MissionRoute {
  const { task, reference, focusBody } = input;
  const refName = reference?.name ?? null;
  if (task === "landing_screening") {
    return {
      kind: "landing_screening",
      cta: "Explore Mars sites",
      detail: "Explore scores the catalogued Mars sites on regional terrain, elevation and solar factors under your priorities. It is a screening index over a fixed catalog, not a landing certification.",
    };
  }
  if (task === "analog_site_selection") {
    return {
      kind: "established_analogs",
      cta: "Explore established analogs",
      detail: `Explore ranks the established ${focusBody === "mars" ? "Mars sites" : "Earth analogs"} against ${refName ?? "your reference"} on the curated factors.`,
    };
  }
  return {
    kind: "choose",
    cta: "Choose a supported task",
    detail: "The reading could not tell which supported task this is, and the app does not guess. Pick the workflow you want, or rewrite the objective with one of the examples.",
  };
}
