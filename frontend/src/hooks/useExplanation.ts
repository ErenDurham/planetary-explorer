// POST /research/explain, cached per site + mission for the session.
//
// Deliberately NOT reactive to slider motion: the query is `enabled: false`
// and only runs when the panel calls `refetch()` (the "Explain" button) or when
// the site changes and a cached entry for that site+mission does not exist.
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { missionKey } from "@/lib/mission";
import type { MissionProfile } from "@/types";

export function explanationQueryKey(siteId: string | null, mission: MissionProfile | null) {
  return ["explain", siteId, missionKey(mission)] as const;
}

export function useExplanation(siteId: string | null, mission: MissionProfile | null) {
  return useQuery({
    queryKey: explanationQueryKey(siteId, mission),
    queryFn: () => api.explain({ site_id: siteId as string, mission, include_analogs: true }),
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
}
