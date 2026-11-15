// The one service instance the UI talks to. Tests and a future contract
// implementation swap it with `setExpeditionService`; nothing else imports
// HttpExpeditionService directly.
import { HttpExpeditionService } from "./httpService";
import type { ExpeditionPlannerService } from "./types";

let current: ExpeditionPlannerService = new HttpExpeditionService();

export function expeditionService(): ExpeditionPlannerService {
  return current;
}

export function setExpeditionService(service: ExpeditionPlannerService): void {
  current = service;
}

export * from "./types";
export { isUnavailable, isRejected, isAbort, EXPEDITION_PATHS } from "./httpService";
