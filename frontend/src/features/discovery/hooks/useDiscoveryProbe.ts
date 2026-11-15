// POST /discovery/probe for the dropped pin. Keyed like the ranking (engine,
// run, reference, the pin, the weights) so moving the pin or changing a weight
// is a new cache entry; the previous result stays on screen as a placeholder
// only while the SAME pin is re-scored under new weights, never across pins or
// runs. Every request carries a fresh client_request_id and a response whose
// echoed id is not the latest is discarded. The hook computes nothing: every
// number it hands back is the service's.
import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { createStaleGuard, type StaleGuard } from "@/lib/staleGuard";
import type { Shares } from "@/lib/allocation";
import { discoveryService, StaleDiscoveryResponse, type DiscoveryProbeResponse, type DiscoveryService } from "../adapter";
import { toRequestWeights, weightsKey } from "../lib/weights";
import { DISCOVERY_ENGINE, REFERENCE_ID } from "./useDiscoveryRank";

export interface PinPoint { lat: number; lon: number }

export function probeQueryKey(runId: string | null, pin: PinPoint | null, shares: Shares) {
  return ["discovery", "probe", DISCOVERY_ENGINE, runId, REFERENCE_ID, pin?.lat ?? null, pin?.lon ?? null, weightsKey(shares)] as const;
}

export async function fetchDiscoveryProbe(guard: StaleGuard, service: DiscoveryService, runId: string, pin: PinPoint, shares: Shares, signal?: AbortSignal): Promise<DiscoveryProbeResponse> {
  const id = guard.issue();
  const res = await service.probe({ run_id: runId, reference_id: REFERENCE_ID, lat: pin.lat, lon_east: pin.lon, weights: toRequestWeights(shares), client_request_id: id }, signal);
  if (!guard.accept(res.client_request_id)) throw new StaleDiscoveryResponse();
  if (res.run_id !== runId || res.lat !== pin.lat || res.lon_east !== pin.lon) throw new StaleDiscoveryResponse();
  return res;
}

export function useDiscoveryProbe(runId: string | null, pin: PinPoint | null, shares: Shares, enabled: boolean) {
  const guard = useRef<StaleGuard>(createStaleGuard("discovery-probe"));
  const key = useMemo(() => probeQueryKey(runId, pin, shares), [runId, pin, shares]);
  const q = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchDiscoveryProbe(guard.current, discoveryService(), runId as string, pin as PinPoint, shares, signal),
    enabled: enabled && runId != null && pin != null && Object.keys(shares).length > 0,
    staleTime: Infinity,
    retry: false,
    placeholderData: (prev) => (prev && pin && prev.run_id === runId && prev.lat === pin.lat && prev.lon_east === pin.lon ? prev : undefined),
  });
  const data = q.data && pin && q.data.run_id === runId && q.data.lat === pin.lat && q.data.lon_east === pin.lon ? q.data : undefined;
  const error = q.error instanceof StaleDiscoveryResponse ? null : q.error;
  return { ...q, data, error, isRefreshing: q.isFetching && !!data };
}
