/** Backend-owned, generated scientific contract. No UI state or calculations. */
import type { components } from "@/types/expedition-api";
import { request } from "./api";

type Schemas = components["schemas"];
export type ExpeditionPlanRequest = Schemas["PlanRequest"];
export type ExpeditionPlanResponse = Schemas["PlanResponse"];
export type ExpeditionTerrainContext = Schemas["TerrainContext"];
export type ExpeditionCapabilities = Schemas["ServiceCapabilities"];
export type ExpeditionBody = ExpeditionPlanRequest["body"];

// Preserve cancellation semantics even though the shared fetch helper wraps network errors.
async function invoke<T>(path: string, init: RequestInit): Promise<T> {
  try {
    const result = await request<T>(path, init);
    if (init.signal?.aborted) throw new DOMException("Request aborted", "AbortError");
    return result;
  } catch (error) {
    if (init.signal?.aborted) throw new DOMException("Request aborted", "AbortError");
    throw error;
  }
}

export const expeditionEngine = {
  capabilities: (signal?: AbortSignal) => invoke<ExpeditionCapabilities>("/expedition/capabilities", { signal }),
  terrain: (body: ExpeditionBody, siteId: string, signal?: AbortSignal) => invoke<ExpeditionTerrainContext>(
    `/expedition/terrain?body=${encodeURIComponent(body)}&site_id=${encodeURIComponent(siteId)}`, { signal }),
  plan: (payload: ExpeditionPlanRequest, signal?: AbortSignal) => invoke<ExpeditionPlanResponse>(
    "/expedition/plan", { method: "POST", body: JSON.stringify(payload), signal }),
};
