// Typed adapter contract between the Expedition Planner UI and the shared
// expedition-planning service (EXPEDITION_PLANNER_CONTRACT.md, engine
// `expedition-v1`). The wire types are ALIASES of the backend-generated schema
// in src/types/expedition-api.ts, so the contract has one source of truth; the
// UI never computes a distance, slope, energy figure or feasibility verdict
// itself. Everything in the metrics panel is a field of `PlanResponse` as the
// service returned it, and a missing metric is shown as missing, never as 0.
import type { components } from "@/types/expedition-api";

type S = components["schemas"];

export type PlanRequest = S["PlanRequest"];
export type PlanResponse = S["PlanResponse"];
export type TerrainContext = S["TerrainContext"];
export type TerrainCoverage = S["TerrainCoverage"];
export type TerrainDataset = S["TerrainDataset"];
export type ServiceCapabilities = S["ServiceCapabilities"];
export type Region = S["Region"];
export type RoverParameters = S["RoverParameters"];
export type RoverProfile = S["RoverProfile"];
export type ResearchTarget = S["ResearchTarget"];
export type UserTarget = S["UserTarget"];
export type RouteSegment = S["RouteSegment"];
export type PlanMetrics = S["PlanMetrics"];
export type Feasibility = S["Feasibility"];
export type PlanWarning = S["PlanWarning"];
export type Interpretation = S["Interpretation"];
export type SnappedStop = S["SnappedStop"];
export type VisitedTarget = S["VisitedTarget"];
export type GeoPoint = S["GeoPoint"];

/** `moon` is in the contract; the UI only opens the planner for Mars and Earth
 * today, and Earth is accepted by the service but reported as unavailable. */
export type ExpeditionBody = PlanRequest["body"];
export type ObjectiveId = PlanRequest["objective"];
export type OptimizationPreference = PlanRequest["optimization"];
export type RiskCategory = RouteSegment["risk"];
export type FeasibilityVerdict = Feasibility["verdict"];
export type DataStatus = PlanResponse["data_status"];

/** A user-placed waypoint. Frontend-owned; `id` is local to the session. */
export interface Waypoint extends GeoPoint {
  id: string;
  label: string | null;
}

/** The service as the UI consumes it. `HttpExpeditionService` is the real one;
 * tests inject fakes through `setExpeditionService`. */
export interface ExpeditionPlannerService {
  capabilities(signal?: AbortSignal): Promise<ServiceCapabilities>;
  terrain(body: ExpeditionBody, siteId: string, signal?: AbortSignal): Promise<TerrainContext>;
  plan(request: PlanRequest, signal?: AbortSignal): Promise<PlanResponse>;
}

/** Thrown when the service is not deployed, not reachable or declined the
 * request as a whole (404 / 501 / 503 / network). The UI shows an
 * "unavailable" state for it rather than an error, because missing is a valid
 * state. */
export class ExpeditionServiceUnavailable extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = "ExpeditionServiceUnavailable";
    this.reason = reason;
  }
}

/** A request the service rejected with a reason (validation, infeasible
 * inputs). Shown to the user verbatim and never retried automatically. */
export class ExpeditionRequestRejected extends Error {
  readonly code: string;
  readonly details: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ExpeditionRequestRejected";
    this.code = code;
    this.details = details ?? null;
  }
}
