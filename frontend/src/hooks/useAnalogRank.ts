// POST /analogs/rank for the VISIBLE body's candidates against the selected
// location on the other body.
//
// Two layers of protection, both explicit. TanStack Query keys the result on
// direction + reference + the complete analog weight set + the analog spec
// version the client was written against, so a change of context is a new
// cache entry rather than a mutation of the old one. On top of that a stale
// guard (lib/staleGuard.ts) stamps every request with a client_request_id and
// refuses any response whose echoed id is not the most recently issued one -
// so an old answer that arrives late can never be written into the cache as
// if it were the current context, even if the query key happened to match.
import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { createStaleGuard, type StaleGuard } from "@/lib/staleGuard";
import { otherBody, toAnalogShares, ANALOG_FEATURES, type Body } from "@/lib/analogFeatures";
import type { AnalogRankResponse, AnalogWeight } from "@/types";

/** The analog spec this client's weights/labels were written against. Bump when the feature set changes. */
export const ANALOG_SPEC_VERSION = "analog-v1.0";

export class StaleRankResponse extends Error {
  constructor() {
    super("stale analog rank response discarded");
    this.name = "StaleRankResponse";
  }
}

/** Analog weight record -> the request's list form, over the five features, in spec order. */
export function toWeightList(analogWeights: Record<string, number> | null | undefined): AnalogWeight[] {
  const shares = toAnalogShares(analogWeights);
  return ANALOG_FEATURES.map((f) => ({ feature_id: f.id, weight: shares[f.id] ?? 0 }));
}

export function rankQueryKey(viewedBody: Body, referenceId: string | null, analogWeights: Record<string, number> | null | undefined) {
  const weightsKey = toWeightList(analogWeights).map((w) => `${w.feature_id}:${w.weight}`).join("|");
  return ["analog-rank", ANALOG_SPEC_VERSION, otherBody(viewedBody), referenceId, viewedBody, weightsKey] as const;
}

/**
 * Issue one ranking request through the guard. Exported so the stale-rejection
 * behaviour is testable without React: a response whose echoed id is no longer
 * the latest issued throws StaleRankResponse instead of returning.
 */
export async function fetchRanked(
  guard: StaleGuard,
  viewedBody: Body,
  referenceId: string,
  analogWeights: Record<string, number> | null | undefined,
  rank: typeof api.rankAnalogs = api.rankAnalogs,
  signal?: AbortSignal,
): Promise<AnalogRankResponse> {
  const id = guard.issue();
  const res = await rank(
    { reference_body: otherBody(viewedBody), reference_id: referenceId, candidate_body: viewedBody, weights: toWeightList(analogWeights), client_request_id: id },
    signal,
  );
  if (!guard.accept(res.client_request_id)) throw new StaleRankResponse();
  return res;
}

export function useAnalogRank(viewedBody: Body, referenceId: string | null, analogWeights: Record<string, number> | null | undefined, enabled = true) {
  const guard = useRef<StaleGuard>(createStaleGuard("analog-rank"));
  const key = useMemo(() => rankQueryKey(viewedBody, referenceId, analogWeights), [viewedBody, referenceId, analogWeights]);
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchRanked(guard.current, viewedBody, referenceId as string, analogWeights, api.rankAnalogs, signal),
    enabled: enabled && referenceId != null,
    staleTime: Infinity,
    retry: (count, err) => !(err instanceof StaleRankResponse) && count < 1,
    // keep the previous ranking on screen while the next one loads, so a
    // slider move does not blank the globe
    placeholderData: (prev) => prev,
  });
}
