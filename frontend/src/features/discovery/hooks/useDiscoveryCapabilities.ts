// GET /discovery/capabilities. "unavailable" is a state the backend reports
// (no verified artifacts installed) AND the state a missing service maps to;
// both are shown honestly, never papered over with fixture data.
import { useQuery } from "@tanstack/react-query";
import { discoveryService, isDiscoveryUnavailable, type DiscoveryCapabilities } from "../adapter";

export type CapabilitiesState =
  | { kind: "loading" }
  | { kind: "ready"; capabilities: DiscoveryCapabilities }
  | { kind: "unavailable"; reason: string; capabilities: DiscoveryCapabilities | null }
  | { kind: "error"; error: unknown; retry: () => void };

export const capabilitiesKey = ["discovery", "capabilities"] as const;

export function useDiscoveryCapabilities(): CapabilitiesState {
  const q = useQuery({ queryKey: capabilitiesKey, queryFn: ({ signal }) => discoveryService().capabilities(signal), staleTime: 60_000, retry: false });
  if (q.data) {
    if (q.data.state !== "ready" || q.data.runs.length === 0) return { kind: "unavailable", reason: q.data.state !== "ready" ? "The discovery service reports no verified survey artifacts installed." : "The discovery service lists no installed surveys.", capabilities: q.data };
    return { kind: "ready", capabilities: q.data };
  }
  if (q.error) return isDiscoveryUnavailable(q.error) ? { kind: "unavailable", reason: q.error.reason, capabilities: null } : { kind: "error", error: q.error, retry: () => void q.refetch() };
  return { kind: "loading" };
}
