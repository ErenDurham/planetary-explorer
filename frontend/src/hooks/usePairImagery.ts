// Two INDEPENDENT imagery queries, one per body, for the Compare panes. Each
// side has its own loading / error / unavailable / ready state so a missing
// Earth manifest (404 or 503 while it is being built) never blanks the Mars
// pane. Queries are keyed by location id, so a response for a location that is
// no longer selected lands in its own cache entry and is never shown under the
// new label; `site_id` is checked as well in case a server ever misroutes.
import { useQuery } from "@tanstack/react-query";
import { api, isApiError } from "@/services/api";
import type { Body } from "@/lib/analogFeatures";
import type { SiteImagery } from "@/types";

export type PaneStatus = "idle" | "loading" | "error" | "unavailable" | "ready";

export interface PaneImagery {
  body: Body;
  id: string | null;
  status: PaneStatus;
  data: SiteImagery | null;
  error: unknown;
  /** Why the side is unavailable, in plain words. */
  reason: string | null;
  refetch: () => void;
  /** False when no imagery acquisition capability exists for this location. */
  canRetry?: boolean;
}

function unavailableReason(error: unknown): string | null {
  if (!isApiError(error)) return null;
  if (error.code === "imagery_unavailable" || error.status === 503) return "The imagery manifest for this location has not been built yet.";
  if (error.code === "not_found" || error.status === 404) return "No verified imagery is published for this location yet.";
  return null;
}

export function useImageryFor(body: Body, id: string | null): PaneImagery {
  const q = useQuery({
    queryKey: ["imagery", id],
    queryFn: () => api.imagery(id as string),
    enabled: id != null,
    staleTime: Infinity,
    retry: false,
  });
  const data = q.data && q.data.site_id === id ? q.data : null;
  const reason = q.error ? unavailableReason(q.error) : null;
  const status: PaneStatus = id == null ? "idle" : data ? "ready" : q.error ? (reason ? "unavailable" : "error") : "loading";
  return { body, id, status, data, error: q.error ?? null, reason, refetch: () => void q.refetch() };
}

export function usePairImagery(ids: { earth: string | null; mars: string | null }): { earth: PaneImagery; mars: PaneImagery } {
  return { earth: useImageryFor("earth", ids.earth), mars: useImageryFor("mars", ids.mars) };
}
