import type { ScreeningPlan } from "@/types";
// Where an applied mission sends the user next, said honestly. The discovery
// pilot is the only "new region" capability and it is bounded: a fixed set of
// surveyed Earth footprints compared with Jezero Crater on regional median
// the features each survey declares. Everything else routes to a workflow that does
// exist (the established analogs ranked against the reference, or Mars
// landing screening), and an objective whose task could not be read is not
// guessed at: the user is asked to choose a supported task. Nothing here
// changes a score or a reading; it only decides the next action and its words.
import { wantsDiscovery } from "@/features/discovery/lib/objective";
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
  screening?: ScreeningPlan | null;
  objective: string;
  task: Task | null;
  reference: { id: string; name: string; body: Body } | null;
  focusBody: Body | null;
  /** The discovery service reports an installed survey. */
  discoveryReady: boolean;
}

export const DISCOVERY_REFERENCE_ID = "jezero_crater";
const PILOT = "The discovery survey compares a fixed set of surveyed Earth footprints with Jezero Crater on the features it declares, across terrain, illumination and aridity. It is not a global search, and a measured match is not geological equivalence, novelty or suitability.";

export function routeForMission(input: MissionRouteInput): MissionRoute {
  const { objective, task, reference, focusBody, discoveryReady } = input;
  const asksForNew = wantsDiscovery(objective);
  const refName = reference?.name ?? null;
  if (task === "landing_screening" && input.screening?.mission_type !== undefined && input.screening.mission_type !== "landing") {
    const plan=input.screening;
    return {kind:"landing_screening",cta:`Explore ${focusBody === "earth" ? "Earth" : "Mars"} sites`,detail:plan.mission_type==="research" ? "Explore ranks the catalogued sites by documented matches to your requested materials and landforms. Missing data stays unranked; equal matches share a rank. This is target alignment, not landing suitability or water accessibility." : plan.mission_type==="base_planning" ? "Explore the catalogue as an evidence review. Base viability cannot be scored from the available data." : "Explore ranks regional terrain against your requested slope and relief targets; this is test-environment fit, not vehicle safety.",unsupported:plan.limitations.join(" ") || undefined};
  }
  if (task === "landing_screening") {
    return {
      kind: "landing_screening",
      cta: "Explore Mars sites",
      detail: "Explore scores the catalogued Mars sites on regional terrain, elevation and solar factors under your priorities. It is a screening index over a fixed catalog, not a landing certification.",
      unsupported: asksForNew ? "Discovering new regions is only available for Earth terrain compared with Jezero Crater; Mars landing screening works on the established catalog." : undefined,
    };
  }
  if (task === "analog_site_selection") {
    const jezero = reference?.id === DISCOVERY_REFERENCE_ID;
    if (asksForNew && jezero && discoveryReady && focusBody !== "mars") {
      return { kind: "discovery", cta: "Explore candidates", detail: PILOT };
    }
    if (asksForNew && jezero && !discoveryReady) {
      return {
        kind: "established_analogs",
        cta: "Explore established analogs",
        detail: `No discovery survey is installed right now, so new candidate regions cannot be shown. Explore ranks the established Earth analogs against ${refName} instead.`,
        unsupported: "The discovery pilot is unavailable in this session; new regions beyond the catalog are not shown.",
      };
    }
    if (asksForNew && !jezero) {
      return {
        kind: "established_analogs",
        cta: "Explore established analogs",
        detail: `Explore ranks the established analogs against ${refName ?? "your reference"} on the curated factors. ${PILOT}`,
        unsupported: `New-region discovery only exists for Jezero Crater; it cannot find new regions for ${refName ?? "another reference"}.`,
      };
    }
    return {
      kind: "established_analogs",
      cta: "Explore established analogs",
      detail: `Explore ranks the established ${focusBody === "mars" ? "Mars sites" : "Earth analogs"} against ${refName ?? "your reference"} on the curated factors.${jezero ? " If you want new candidate regions beyond the catalog, say so in the objective: the discovery pilot covers Jezero Crater." : ""}`,
    };
  }
  return {
    kind: "choose",
    cta: "Choose a supported task",
    detail: "The reading could not tell which supported task this is, and the app does not guess. Pick the workflow you want, or rewrite the objective with one of the examples.",
    unsupported: asksForNew ? "New-region discovery is only available for Earth terrain compared with Jezero Crater." : undefined,
  };
}
