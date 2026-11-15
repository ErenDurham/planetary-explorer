// Is the shared expedition service there, and what does it offer? A 404/503
// is a VALID state ("not connected"), reported as `unavailable` rather than as
// an error, so the workspace can still show the real basemap and let the user
// lay out waypoints while Calculate stays disabled.
import { useQuery } from "@tanstack/react-query";
import { expeditionService, isUnavailable, type ServiceCapabilities } from "../adapter";

export type ServiceState =
  | { kind: "loading" }
  | { kind: "available"; capabilities: ServiceCapabilities }
  | { kind: "unavailable"; reason: string }
  | { kind: "error"; error: unknown; retry: () => void };

export function useExpeditionCapabilities(): ServiceState {
  const q = useQuery({
    queryKey: ["expedition", "capabilities"],
    queryFn: ({ signal }) => expeditionService().capabilities(signal),
    staleTime: 60_000,
    retry: false,
  });
  if (q.data) return { kind: "available", capabilities: q.data };
  if (q.error) return isUnavailable(q.error) ? { kind: "unavailable", reason: q.error.reason } : { kind: "error", error: q.error, retry: () => void q.refetch() };
  return { kind: "loading" };
}
