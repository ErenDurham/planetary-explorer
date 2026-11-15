// The candidate research status, as a badge and as the one place its three
// values are explained. Status is set only by saving the notebook under the
// backend's rule (a literature review needs a substantive summary and a
// direct or contradictory source finding); viewing, searching and exporting
// never change it, and none of it is field validation.
import { Badge } from "@/components/ui/Badge";
import type { DiscoveryCandidate } from "../adapter";

export type ResearchStatus = NonNullable<DiscoveryCandidate["research_status"]>;

export const RESEARCH_STATUS_MEANING: Record<ResearchStatus, { label: string; meaning: string }> = {
  unresearched: { label: "Unresearched", meaning: "No literature review has been recorded for this candidate. Terrain screening and desktop checks do not count as research." },
  in_progress: { label: "Research in progress", meaning: "Notes are being gathered and nothing has been concluded. Saved notes keep this status until a review is recorded." },
  literature_reviewed: { label: "Literature reviewed", meaning: "A documented review was saved, with a summary and at least one source finding that directly addresses or contradicts the candidate. It can conclude the candidate is unsuitable, and it is never field validation." },
};

export function ResearchStatusBadge({ status }: { status: DiscoveryCandidate["research_status"] | undefined }) {
  const s: ResearchStatus = status ?? "unresearched";
  const { label, meaning } = RESEARCH_STATUS_MEANING[s];
  return <Badge tone={s === "literature_reviewed" ? "info" : "warn"} title={`${meaning} Terrain screening and small desktop checks do not establish a researched or field validated analog.`}>{label}</Badge>;
}
