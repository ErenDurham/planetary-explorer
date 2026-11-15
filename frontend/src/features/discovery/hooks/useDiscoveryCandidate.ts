// GET /discovery/runs/{run}/candidates/{id}: immutable inputs (profile,
// screening reasons, source manifest, proposed field validation). Rank fields
// in it are null by contract; the current scores come from the rank response.
import { useQuery } from "@tanstack/react-query";
import { discoveryService } from "../adapter";

export function useDiscoveryCandidate(runId: string | null, candidateId: string | null) {
  const q = useQuery({
    queryKey: ["discovery", "candidate", runId, candidateId],
    queryFn: ({ signal }) => discoveryService().detail(runId as string, candidateId as string, signal),
    enabled: runId != null && candidateId != null,
    staleTime: Infinity,
    retry: false,
  });
  const data = q.data && q.data.id === candidateId ? q.data : undefined;
  return { ...q, data };
}
