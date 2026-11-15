import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExplanationPanel } from "./ExplanationPanel";

vi.mock("@/hooks/useExplanation", () => ({ useExplanation: () => ({
  isFetching: false, fetchStatus: "idle", refetch: vi.fn(), error: null,
  data: { generated_by: "deterministic_fallback", sections: { research_applications: [], future_investigation: ["Acquire local terrain maps."], risks: ["Regional data only."], unfavorable: [], missing_evidence: [] },
    research_studies: [{kind: "proposed_study",title: "Validate terrain screening",research_question: "Does the regional ranking hold locally?",method: "Compare terrain maps.",why_here: "Regional slope measurements.",cannot_infer: "No validated landing safety.",motivating_citation_ids: ["[C1]"]}],
    supporting_evidence: [{chunk_id:"source#1",document_id:"source",title:"Terrain source",institution:"NASA",url:"https://example.test/terrain",excerpt:"Regional terrain measurement documentation."}],
    citations:[{citation_id:"[C1]",chunk_id:"source#1"}], source_digests:[{url:"https://example.test/terrain",purpose_label:"Terrain context",support_level:"context",what_it_tells_us:"Documents regional measurements.",why_it_matters:"Motivates a local terrain comparison.",generated_by:"extractive"}], limitations: [] }
}) }));

describe("Research potential", () => {
  it("shows structured studies and source context before the final caveats", () => {
    render(<ExplanationPanel siteId="site" mission={null} />);
    expect(screen.getByRole("heading", {name:"Validate terrain screening"})).toBeInTheDocument();
    expect(screen.getByText("How to investigate")).toBeInTheDocument();
    expect(screen.getByText("Documents regional measurements.")).toBeInTheDocument();
    expect(screen.getByRole("link", {name:"Open Terrain source"})).toHaveAttribute("href", "https://example.test/terrain");
    const study = screen.getByRole("heading", {name:"Validate terrain screening"});
    const caveats = screen.getByRole("heading", {name:"Risks, missing evidence and limits"});
    expect(study.compareDocumentPosition(caveats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
