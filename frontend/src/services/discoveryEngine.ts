/** Backend-owned discovery-v1 client; scientific values are supplied by the service. */
import type { components } from "@/types/discovery-api";
import { request } from "./api";
type Schemas = components["schemas"];
export type DiscoveryCapabilities = Schemas["DiscoveryCapabilities"];
export type DiscoveryRankRequest = Schemas["DiscoveryRankRequest"];
export type DiscoveryRankResponse = Schemas["DiscoveryRankResponse"];
export type DiscoveryCandidate = Schemas["DiscoveryCandidate"];
export type DiscoveryCandidateDetail = Schemas["DiscoveryCandidateDetail"];
export type DiscoveryExport = Schemas["DiscoveryExport"];
export type CandidateResearchDossier = Schemas["ResearchDossier"];
export type CandidateResearchUpdate = Schemas["ResearchUpdate"];
export type CandidateResearchBrief = Schemas["ResearchBrief"];
export type CandidateResearchRecord = Schemas["ResearchRecord"];

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
export const discoveryEngine = {
  exportResearch: (runId: string, candidateId: string, signal?: AbortSignal) => invoke<CandidateResearchBrief>(
    `/discovery/runs/${encodeURIComponent(runId)}/candidates/${encodeURIComponent(candidateId)}/research/export`, { signal }),
  research: (runId: string, candidateId: string, question = "", signal?: AbortSignal) => invoke<CandidateResearchDossier>(
    `/discovery/runs/${encodeURIComponent(runId)}/candidates/${encodeURIComponent(candidateId)}/research?question=${encodeURIComponent(question)}`, { signal }),
  saveResearch: (runId: string, candidateId: string, payload: CandidateResearchUpdate, signal?: AbortSignal) => invoke<CandidateResearchRecord>(
    `/discovery/runs/${encodeURIComponent(runId)}/candidates/${encodeURIComponent(candidateId)}/research`, { method: "POST", body: JSON.stringify(payload), signal }),
  capabilities: (signal?: AbortSignal) => invoke<DiscoveryCapabilities>("/discovery/capabilities", { signal }),
  rank: (payload: DiscoveryRankRequest, signal?: AbortSignal) => invoke<DiscoveryRankResponse>(
    "/discovery/rank", { method: "POST", body: JSON.stringify(payload), signal }),
  detail: (runId: string, candidateId: string, signal?: AbortSignal) => invoke<DiscoveryCandidateDetail>(
    `/discovery/runs/${encodeURIComponent(runId)}/candidates/${encodeURIComponent(candidateId)}`, { signal }),
  export: (runId: string, signal?: AbortSignal) => invoke<DiscoveryExport>(
    `/discovery/runs/${encodeURIComponent(runId)}/export`, { signal }),
};
