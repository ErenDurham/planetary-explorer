import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { useAppStore } from "@/store/useAppStore";
import type { AnalogWeight } from "@/types";

export function useAnalogs(siteId: string | null, topK = 5) {
  const analogWeights = useAppStore((s) => s.analogWeights);
  const weights: AnalogWeight[] | null = analogWeights
    ? Object.entries(analogWeights).map(([feature_id, weight]) => ({ feature_id, weight }))
    : null;
  const weightsKey = weights ? weights.map((w) => `${w.feature_id}=${w.weight}`).sort().join("&") : "default";
  return useQuery({
    queryKey: ["analogs", siteId, topK, weightsKey],
    queryFn: () => api.matchAnalogs({ mars_site_id: siteId as string, weights, top_k: topK }),
    enabled: siteId != null,
    staleTime: Infinity,
  });
}
