// POST /discovery/rank. The query key carries engine version, run, reference,
// weights and top_k, so a change of any of them is a new cache entry rather
// than a mutation of the old one. On top of that, every request carries a
// fresh client_request_id (lib/staleGuard) and a response whose echoed id is
// not the latest is discarded; the in-flight request is aborted via the signal
// when the key changes.
import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { createStaleGuard, type StaleGuard } from "@/lib/staleGuard";
import type { Shares } from "@/lib/allocation";
import { discoveryService, StaleDiscoveryResponse, type DiscoveryRankResponse, type DiscoveryService } from "../adapter";
import { toRequestWeights, weightsKey } from "../lib/weights";

export const DISCOVERY_ENGINE = "discovery-v2";
export const REFERENCE_ID = "jezero_crater" as const;

export function rankQueryKey(runId: string | null, shares: Shares, topK: number) {
  return ["discovery", "rank", DISCOVERY_ENGINE, runId, REFERENCE_ID, weightsKey(shares), topK] as const;
}

export async function fetchDiscoveryRank(guard: StaleGuard, service: DiscoveryService, runId: string, shares: Shares, topK: number, signal?: AbortSignal): Promise<DiscoveryRankResponse> {
  const id = guard.issue();
  const res = await service.rank({ run_id: runId, reference_id: REFERENCE_ID, weights: toRequestWeights(shares), top_k: topK, client_request_id: id }, signal);
  if (!guard.accept(res.client_request_id)) throw new StaleDiscoveryResponse();
  if (res.run_id !== runId) throw new StaleDiscoveryResponse();
  return res;
}

export function useDiscoveryRank(runId: string | null, shares: Shares, topK: number, enabled: boolean) {
  const guard = useRef<StaleGuard>(createStaleGuard("discovery-rank"));
  const key = useMemo(() => rankQueryKey(runId, shares, topK), [runId, shares, topK]);
  const q = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchDiscoveryRank(guard.current, discoveryService(), runId as string, shares, topK, signal),
    // A survey declares the features it scores, so no ranking is requested before the
    // weights have been seeded from it: empty weights are not a neutral request, they
    // are one the service rejects.
    enabled: enabled && runId != null && Object.keys(shares).length > 0,
    staleTime: Infinity,
    retry: false,
    // keep the previous ranking visible while a weight change re-ranks, for THIS run only
    placeholderData: (prev) => (prev && prev.run_id === runId ? prev : undefined),
  });
  const data = q.data && q.data.run_id === runId ? q.data : undefined;
  const error = q.error instanceof StaleDiscoveryResponse ? null : q.error;
  return { ...q, data, error, isRefreshing: q.isFetching && !!data };
}
