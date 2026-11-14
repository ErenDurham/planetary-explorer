import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";

export const sitesQueryKey = ["sites", "mars"] as const;

export function useSites() {
  return useQuery({
    queryKey: sitesQueryKey,
    queryFn: () => api.sites("mars"),
    staleTime: Infinity,
  });
}

export function useSiteProfile(siteId: string | null) {
  return useQuery({
    queryKey: ["site", siteId],
    queryFn: () => api.site(siteId as string),
    enabled: siteId != null,
    staleTime: Infinity,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => api.health(),
    retry: 1,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}
