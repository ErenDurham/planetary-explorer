// The discovery UI's view of the backend-owned discovery-v1 contract
// (DISCOVERY_CONTRACT.md). Wire types are ALIASES of the generated schema in
// src/types/discovery-api.ts, so the contract has one owner. The UI computes no
// scientific value: every score, distance, count and measurement on screen is a
// field the service returned, and a missing value is shown as missing.
import type { components } from "@/types/discovery-api";

type S = components["schemas"];

export type DiscoveryCapabilities = S["DiscoveryCapabilities"];
export type DiscoveryRunSummary = S["DiscoveryRunSummary"];
export type DiscoveryCriterion = S["DiscoveryCriterion"];
export type DiscoveryReference = S["DiscoveryReference"];
export type DiscoveryRankRequest = S["DiscoveryRankRequest"];
export type DiscoveryRankResponse = S["DiscoveryRankResponse"];
export type DiscoverySurvey = S["DiscoverySurvey"];
export type DiscoveryBounds = S["DiscoveryBounds"];
export type DiscoveryCandidate = S["DiscoveryCandidate"];
export type DiscoveryCandidateDetail = S["DiscoveryCandidateDetail"];
export type DiscoveryFeatureDistance = S["DiscoveryFeatureDistance"];
export type DiscoveryNovelty = S["DiscoveryNovelty"];
export type DiscoveryContext = S["DiscoveryContext"];
export type DiscoverySource = S["DiscoverySource"];
export type DiscoveryProfile = S["DiscoveryProfile"];
/** Weights name features the chosen survey scores; the service resolves them against its basis. */
export type DiscoveryWeights = Record<string, number>;
export type DiscoveryExport = S["DiscoveryExport"];
export type DiscoveryProbeRequest = S["DiscoveryProbeRequest"];
export type DiscoveryProbeResponse = S["DiscoveryProbeResponse"];
export type DiscoveryProbePlacement = S["DiscoveryProbePlacement"];

export type DiscoveryWeightId = keyof DiscoveryWeights;
export const DISCOVERY_WEIGHT_IDS: readonly DiscoveryWeightId[] = ["slope_regional_median_deg", "roughness_regional_m"];

/** The service as the UI consumes it. `HttpDiscoveryService` wraps the
 * backend-owned `discoveryEngine` client; tests inject fakes through
 * `setDiscoveryService`. Production never injects anything. */
export interface DiscoveryService {
  capabilities(signal?: AbortSignal): Promise<DiscoveryCapabilities>;
  rank(request: DiscoveryRankRequest, signal?: AbortSignal): Promise<DiscoveryRankResponse>;
  detail(runId: string, candidateId: string, signal?: AbortSignal): Promise<DiscoveryCandidateDetail>;
  export(runId: string, signal?: AbortSignal): Promise<DiscoveryExport>;
  /** Score one user-chosen point with the run's own pipeline; never part of the ranking. */
  probe(request: DiscoveryProbeRequest, signal?: AbortSignal): Promise<DiscoveryProbeResponse>;
}

/** The service or its installed artifacts are not available (not deployed,
 * unreachable, 503 data_unavailable). A valid state, shown as such. */
export class DiscoveryUnavailable extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = "DiscoveryUnavailable";
    this.reason = reason;
  }
}

/** The run or candidate id is unknown to the service (404). */
export class DiscoveryNotFound extends Error {
  /** Distinguishes this class structurally from a plain Error, so type guards narrow correctly. */
  readonly status = 404 as const;
  constructor(message: string) {
    super(message);
    this.name = "DiscoveryNotFound";
  }
}

/** The request was rejected with a reason (422 and other errors); shown verbatim. */
export class DiscoveryRequestRejected extends Error {
  readonly code: string;
  readonly details: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "DiscoveryRequestRejected";
    this.code = code;
    this.details = details ?? null;
  }
}

/** A late response for a request that is no longer the latest; never shown. */
export class StaleDiscoveryResponse extends Error {
  constructor() {
    super("stale discovery response discarded");
    this.name = "StaleDiscoveryResponse";
  }
}
