// POST /research/explain, cached per site + mission + applied objective.
//
// Deliberately NOT reactive to slider motion: the query is `enabled: false`
// and only runs when the panel calls `refetch()` (the "Explain" button) or when
// the site changes and a cached entry for that key does not exist. The applied
// objective is part of the key so that a new objective produces new source
// digests, and part of the request so the backend can say why a source matters
// to it.
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { missionKey } from "@/lib/mission";
import type { MissionProfile } from "@/types";

export function explanationQueryKey(siteId: string | null, mission: MissionProfile | null, objective = "") {
  return ["explain", siteId, missionKey(mission), objective.trim()] as const;
}

export function useExplanation(siteId: string | null, mission: MissionProfile | null, objective = "") {
  return useQuery({
    queryKey: explanationQueryKey(siteId, mission, objective),
    queryFn: () => api.explain({ site_id: siteId as string, mission, include_analogs: true, objective: objective.trim() || null }),
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
}
