// The analog data for ONE hand-selected Earth/Mars pair. Similarity and rank
// come from POST /analogs/rank with the REFERENCE body's location as the
// reference, so the pair's entry is looked up by id in the ranked pool - never
// "the top match". Documented analog use, proposed studies, limitations and
// citations come from POST /analogs/match for the same pair. Both requests
// carry the current analog preferences; reweighting changes the numbers and
// never the pair.
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { useAnalogs } from "@/hooks/useAnalogs";
import { useAppStore } from "@/store/useAppStore";
import { findPairCandidate } from "@/lib/comparison";
import type { Body } from "@/lib/analogFeatures";
import type { AnalogMatch, AnalogWeight, RankedCandidate } from "@/types";

export function analogWeightList(analogWeights: Record<string, number> | null): AnalogWeight[] | null {
  return analogWeights ? Object.entries(analogWeights).map(([feature_id, weight]) => ({ feature_id, weight })) : null;
}

export function usePairMatch(args: { enabled?: boolean; referenceBody: Body; referenceId: string | null; candidateId: string | null; marsId: string | null; earthId: string | null }) {
  const analogWeights = useAppStore(s => s.analogWeights);
  const weights = analogWeightList(analogWeights);
  const weightsKey = weights ? weights.map(w => `${w.feature_id}=${w.weight}`).sort().join("&") : "default";
  const rank = useQuery({
    queryKey: ["analog-rank", args.referenceBody, args.referenceId, weightsKey],
    queryFn: () => api.rankAnalogs({ reference_body: args.referenceBody, reference_id: args.referenceId as string, weights }),
    enabled: args.enabled !== false && args.referenceId != null,
    staleTime: Infinity,
  });
  // /analogs/match is Mars-keyed; top_k 7 covers every Earth candidate.
  const match = useAnalogs(args.enabled === false ? null : args.marsId, 7);
  const candidate: RankedCandidate | undefined = findPairCandidate(rank.data, args.candidateId);
  const pairMatch: AnalogMatch | undefined = match.data?.matches.find(m => m.earth_candidate.id === args.earthId);
  return { rank, match, candidate, pairMatch, weightsKey, customised: analogWeights != null };
}
