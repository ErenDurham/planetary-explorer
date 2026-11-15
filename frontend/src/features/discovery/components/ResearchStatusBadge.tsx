import { Badge } from "@/components/ui/Badge";
import type { DiscoveryCandidate } from "../adapter";

export function ResearchStatusBadge({ status }: { status: DiscoveryCandidate["research_status"] | undefined }) {
  const label = status === "literature_reviewed" ? "Literature reviewed" : status === "in_progress" ? "Research in progress" : "Unresearched";
  return <Badge tone={status === "literature_reviewed" ? "info" : "warn"} title="Candidate literature review status. Terrain screening and small desktop checks do not establish a researched or field validated analog.">{label}</Badge>;
}
