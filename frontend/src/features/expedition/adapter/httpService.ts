// HTTP implementation of the adapter. The three calls go through the
// backend-owned `expeditionEngine` client (src/services/expeditionEngine.ts),
// so the URL grammar and the generated types have one owner; this file only
// translates its errors into the two states the UI distinguishes and passes
// responses through untouched: no field is derived, defaulted or "repaired".
import { isApiError } from "@/services/api";
import { expeditionEngine } from "@/services/expeditionEngine";
import { ExpeditionRequestRejected, ExpeditionServiceUnavailable, type ExpeditionBody, type ExpeditionPlannerService, type PlanRequest, type PlanResponse, type ServiceCapabilities, type TerrainContext } from "./types";

export const EXPEDITION_PATHS = {
  capabilities: "/api/v1/expedition/capabilities",
  terrain: (body: ExpeditionBody, siteId: string) => `/api/v1/expedition/terrain?body=${encodeURIComponent(body)}&site_id=${encodeURIComponent(siteId)}`,
  plan: "/api/v1/expedition/plan",
} as const;

/** The first human-readable message inside a validation `details` array, if any. */
function detailMessage(details: unknown): string | null {
  if (!Array.isArray(details)) return null;
  const first = details.find(d => d && typeof d === "object" && typeof (d as { msg?: unknown }).msg === "string") as { msg: string } | undefined;
  return first ? first.msg.replace(/^Value error,\s*/, "") : null;
}

function translate(e: unknown): never {
  if (e instanceof DOMException && e.name === "AbortError") throw e;
  if (isApiError(e)) {
    if (e.code === "unavailable") throw new ExpeditionServiceUnavailable(`The expedition service could not be reached (${e.message}).`);
    if (e.status === 404 || e.status === 501) throw new ExpeditionServiceUnavailable("The expedition service is not deployed on this backend yet.");
    if (e.status === 503 || e.code === "data_unavailable") throw new ExpeditionServiceUnavailable("The expedition service is temporarily unavailable.");
    const detail = detailMessage(e.details);
    throw new ExpeditionRequestRejected(e.code, detail ? `${e.message}: ${detail}` : e.message, e.details);
  }
  throw new ExpeditionRequestRejected("unexpected_error", e instanceof Error ? e.message : String(e));
}

export class HttpExpeditionService implements ExpeditionPlannerService {
  capabilities(signal?: AbortSignal): Promise<ServiceCapabilities> {
    return expeditionEngine.capabilities(signal).catch(translate);
  }
  terrain(body: ExpeditionBody, siteId: string, signal?: AbortSignal): Promise<TerrainContext> {
    return expeditionEngine.terrain(body, siteId, signal).catch(translate);
  }
  plan(request: PlanRequest, signal?: AbortSignal): Promise<PlanResponse> {
    return expeditionEngine.plan(request, signal).catch(translate);
  }
}

export function isUnavailable(e: unknown): e is ExpeditionServiceUnavailable {
  return e instanceof ExpeditionServiceUnavailable;
}

export function isRejected(e: unknown): e is ExpeditionRequestRejected {
  return e instanceof ExpeditionRequestRejected;
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}
