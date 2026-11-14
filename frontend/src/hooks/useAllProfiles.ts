// All eight site profiles, for the cross-site charts. Shares the per-site
// cache key with useSiteProfile so selecting a site costs no extra request.
import { useQueries } from "@tanstack/react-query";
import { api } from "@/services/api";
import type { SiteWithProfile } from "@/types";

export function useAllProfiles(siteIds: string[] | undefined) {
  const results = useQueries({
    queries: (siteIds ?? []).map((id) => ({
      queryKey: ["site", id],
      queryFn: () => api.site(id),
      staleTime: Infinity,
    })),
  });
  const data = results.map((r) => r.data).filter((d): d is SiteWithProfile => !!d);
  return {
    data,
    isPending: results.some((r) => r.isPending),
    error: results.find((r) => r.error)?.error ?? null,
    complete: siteIds ? data.length === siteIds.length : false,
  };
}
