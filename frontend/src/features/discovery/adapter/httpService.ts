// Production adapter: every call goes through the backend-owned
// `discoveryEngine` (src/services/discoveryEngine.ts), which shares the app's
// one HTTP transport. This file only translates its errors into the states the
// UI distinguishes. Responses pass through untouched.
import { isApiError } from "@/services/api";
import { discoveryEngine } from "@/services/discoveryEngine";
import { DiscoveryNotFound, DiscoveryRequestRejected, DiscoveryUnavailable, type DiscoveryService } from "./types";

function detailMessage(details: unknown): string | null {
  if (!Array.isArray(details)) return null;
  const first = details.find(d => d && typeof d === "object" && typeof (d as { msg?: unknown }).msg === "string") as { msg: string } | undefined;
  return first ? first.msg.replace(/^Value error,\s*/, "") : null;
}

export function translateDiscoveryError(e: unknown): never {
  if (e instanceof DOMException && e.name === "AbortError") throw e;
  if (isApiError(e)) {
    if (e.code === "unavailable") throw new DiscoveryUnavailable(`The discovery service could not be reached (${e.message}).`);
    if (e.status === 503 || e.code === "data_unavailable") throw new DiscoveryUnavailable(e.message || "The installed discovery artifacts are missing or corrupt.");
    if (e.status === 501) throw new DiscoveryUnavailable("The discovery service is not deployed on this backend.");
    if (e.status === 404) throw new DiscoveryNotFound(e.message || "Unknown discovery run or candidate.");
    const detail = detailMessage(e.details);
    throw new DiscoveryRequestRejected(e.code, detail ? `${e.message}: ${detail}` : e.message, e.details);
  }
  throw new DiscoveryRequestRejected("unexpected_error", e instanceof Error ? e.message : String(e));
}

export class HttpDiscoveryService implements DiscoveryService {
  capabilities(signal?: AbortSignal) { return discoveryEngine.capabilities(signal).catch(translateDiscoveryError); }
  rank(request: Parameters<DiscoveryService["rank"]>[0], signal?: AbortSignal) { return discoveryEngine.rank(request, signal).catch(translateDiscoveryError); }
  detail(runId: string, candidateId: string, signal?: AbortSignal) { return discoveryEngine.detail(runId, candidateId, signal).catch(translateDiscoveryError); }
  export(runId: string, signal?: AbortSignal) { return discoveryEngine.export(runId, signal).catch(translateDiscoveryError); }
}

export const isDiscoveryUnavailable = (e: unknown): e is DiscoveryUnavailable => e instanceof DiscoveryUnavailable;
export const isDiscoveryNotFound = (e: unknown): e is DiscoveryNotFound => e instanceof DiscoveryNotFound;
export const isDiscoveryRejected = (e: unknown): e is DiscoveryRequestRejected => e instanceof DiscoveryRequestRejected;
export const isAbortError = (e: unknown): boolean => e instanceof DOMException && e.name === "AbortError";
