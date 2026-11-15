// The research panel: the dossier opens without changing status, drafts
// survive navigation and are marked, the brief downloads (as a DRAFT when
// edits are unsaved) without saving, a failed save keeps the notes and says
// so, the ranking context travels with the candidate, and the way back lands
// on the same candidate in Explore.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CandidateResearchPanel } from "./CandidateResearchPanel";
import { ResearchStatusBadge } from "./ResearchStatusBadge";
import { useCandidateResearchTarget } from "../store/useCandidateResearchTarget";
import { useDiscoveryStore } from "../store/useDiscoveryStore";
import { useAppStore } from "@/store/useAppStore";
import { setDiscoveryService } from "../adapter";
import { candidates, connectedService, run } from "../test/fixtures";

const mocks = vi.hoisted(() => ({ research: vi.fn(), saveResearch: vi.fn() }));
vi.mock("@/services/discoveryEngine", () => ({ discoveryEngine: mocks }));
const target = { runId: run.run_id, candidateId: candidates[0].id };
const dossier = { run_id: run.run_id, candidate_id: candidates[0].id, candidate: { ...candidates[0], name: "Proposed region", profile: { measurements: { slope_regional_median_deg: { value: 1.3, unit: "deg", measurement_type: "derived" } }, grid: {}, terrain_valid_fraction: 1, gradient_valid_fraction: 1 }, screening_reasons: [], source_manifest: [], proposed_field_validation: [] },
  record: { status: "unresearched", notes: "", findings: [], updated_at: null, run_id: run.run_id, candidate_id: candidates[0].id }, research_questions: ["Has this region already been studied?"],
  search_tasks: [{ label: "Prior analog work", url: "https://ntrs.nasa.gov/search" }], research_brief: "Check prior work and field validation gaps.",
  background_evidence: [{ chunk_id: "chunk", document_id: "d", title: "Jezero context", url: "https://science.nasa.gov/", institution: "NASA", excerpt: "Regional background does not establish geology at this candidate.", geographic_relevance: [], score: 0.1 }], retrieval_status: "background_available", limitations: [] };
const readBlob = (b: Blob) => new Promise<string>(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(b); });
function mount() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CandidateResearchPanel /></QueryClientProvider>); }
beforeEach(() => {
  vi.clearAllMocks();
  setDiscoveryService(connectedService());
  useDiscoveryStore.setState({ runId: run.run_id, runs: { [run.run_id]: { ranked: true, selectedCandidateId: null, autoSelected: false } }, weights: { slope_regional_median_deg: 50, roughness_regional_m: 50 }, topK: 5 });
  useCandidateResearchTarget.setState({ target, drafts: {} });
  mocks.research.mockResolvedValue(dossier); mocks.saveResearch.mockResolvedValue({ status: "in_progress" });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("candidate deep research", () => {
  it("opens a scoped dossier with its ranking context, without marking the candidate researched; notes survive a background query", async () => {
    mount(); expect(await screen.findByText("Deep research: Proposed region")).toBeInTheDocument();
    expect(screen.getByText("Unresearched", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByTestId("status-meaning")).toHaveTextContent(/No literature review has been recorded/);
    expect(await screen.findByTestId("research-ranking-context")).toHaveTextContent(/Rank 1 of 3 in this session's ranking · index 77\.1 \/ 100 · weights slope 50% · relief 50%/);
    expect(screen.getByText(/Background only/)).toBeInTheDocument();
    // order: notebook and checklist come before the background passages
    const headings = screen.getAllByRole("heading", { level: 3 }).map(h => h.textContent);
    expect(headings.indexOf("Research notebook")).toBeLessThan(headings.indexOf("Background evidence"));
    expect(headings.indexOf("Research checklist")).toBeLessThan(headings.indexOf("Background evidence"));
    expect(mocks.saveResearch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Review summary and remaining gaps"), { target: { value: "Unsaved research notes must survive a background evidence query." } });
    fireEvent.change(screen.getByLabelText("Question for the evidence library"), { target: { value: "What geological evidence is missing?" } });
    fireEvent.click(screen.getByRole("button", { name: "Retrieve background evidence" }));
    await waitFor(() => expect(mocks.research).toHaveBeenLastCalledWith(run.run_id, candidates[0].id, "What geological evidence is missing?", expect.anything()));
    await waitFor(() => expect(screen.getByLabelText("Review summary and remaining gaps")).toHaveValue("Unsaved research notes must survive a background evidence query."));
    expect(screen.getByTestId("draft-indicator")).toBeInTheDocument();
  });

  it("saves explicit progress, blocks evidence-free completion, and clears the draft on success", async () => {
    mount(); await screen.findByText("Deep research: Proposed region");
    fireEvent.change(screen.getByLabelText("Candidate research status"), { target: { value: "literature_reviewed" } });
    expect(screen.getByRole("button", { name: "Save research notes" })).toBeDisabled();
    expect(screen.getByTestId("status-meaning")).toHaveTextContent(/can conclude the candidate is unsuitable/);
    fireEvent.change(screen.getByLabelText("Candidate research status"), { target: { value: "in_progress" } });
    fireEvent.change(screen.getByLabelText("Review summary and remaining gaps"), { target: { value: "Inspecting geological maps and checking prior analog research." } });
    fireEvent.click(screen.getByRole("button", { name: "Save research notes" }));
    await waitFor(() => expect(mocks.saveResearch).toHaveBeenCalledWith(run.run_id, candidates[0].id, expect.objectContaining({ status: "in_progress" })));
    await waitFor(() => expect(useCandidateResearchTarget.getState().drafts).toEqual({}));
  });

  it("keeps a draft across unmount and remount, and offers to discard it", async () => {
    const view = mount(); await screen.findByText("Deep research: Proposed region");
    fireEvent.change(screen.getByLabelText("Review summary and remaining gaps"), { target: { value: "Draft kept while I go back to Explore." } });
    view.unmount();
    mount(); await screen.findByText("Deep research: Proposed region");
    expect(screen.getByLabelText("Review summary and remaining gaps")).toHaveValue("Draft kept while I go back to Explore.");
    expect(screen.getByTestId("draft-indicator")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.getByLabelText("Review summary and remaining gaps")).toHaveValue("");
    expect(screen.queryByTestId("draft-indicator")).toBeNull();
  });

  it("downloads a research brief without saving, marked DRAFT while edits are unsaved", async () => {
    mount(); await screen.findByText("Deep research: Proposed region");
    await screen.findByTestId("research-ranking-context");
    const blobs: Blob[] = [];
    (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mockImplementation((b: Blob) => { blobs.push(b); return "blob:x"; });
    fireEvent.click(screen.getByTestId("download-research-brief"));
    expect(await screen.findByText(/Saved research-brief-pilot_2026_11_14-c_31_25_m2_75\.md\. Downloading never changes the research status\./)).toBeInTheDocument();
    expect(await readBlob(blobs[0])).toMatch(/^# Research brief: Proposed region[\s\S]*Rank in this session's ranking: 1 of 3[\s\S]*## Open questions\n\n- \[ \] Has this region already been studied\?/);
    fireEvent.change(screen.getByLabelText("Review summary and remaining gaps"), { target: { value: "Unsaved draft note." } });
    fireEvent.click(screen.getByRole("button", { name: "Download research brief (draft)" }));
    expect(await screen.findByText(/research-brief-pilot_2026_11_14-c_31_25_m2_75-DRAFT\.md \(marked DRAFT/)).toBeInTheDocument();
    expect(await readBlob(blobs[1])).toContain("**DRAFT — contains unsaved notebook edits.**");
    expect(await readBlob(blobs[1])).toContain("Unsaved draft note.");
    expect(mocks.saveResearch).not.toHaveBeenCalled();
  });

  it("shows a failed save honestly and keeps the notes", async () => {
    mocks.saveResearch.mockRejectedValue(new Error("Browser storage is unavailable."));
    mount(); await screen.findByText("Deep research: Proposed region");
    fireEvent.change(screen.getByLabelText("Review summary and remaining gaps"), { target: { value: "These notes must not vanish." } });
    fireEvent.click(screen.getByRole("button", { name: "Save research notes" }));
    expect(await screen.findByText(/Nothing was saved\. Your notes are still here/)).toBeInTheDocument();
    expect(screen.getByLabelText("Review summary and remaining gaps")).toHaveValue("These notes must not vanish.");
    expect(screen.getByTestId("draft-indicator")).toBeInTheDocument();
  });

  it("goes back to the same candidate in Explore", async () => {
    useAppStore.setState({ activeTab: "research", exploreMode: "browse" });
    mount(); await screen.findByText("Deep research: Proposed region");
    fireEvent.click(screen.getByRole("button", { name: "Back to this candidate in Explore" }));
    expect(useAppStore.getState()).toMatchObject({ activeTab: "explore", exploreMode: "find_analogs" });
    expect(useDiscoveryStore.getState().runs[run.run_id].selectedCandidateId).toBe(candidates[0].id);
  });

  it("offers a discovery handoff when no candidate is selected", () => {
    useCandidateResearchTarget.setState({ target: null }); mount();
    fireEvent.click(screen.getByRole("button", { name: "Choose a discovery candidate" }));
    expect(useAppStore.getState().activeTab).toBe("explore");
    expect(useAppStore.getState().exploreMode).toBe("find_analogs");
  });

  it("tags missing and in-progress status clearly", () => {
    const v = render(<ResearchStatusBadge status={undefined} />); expect(screen.getByText("Unresearched")).toBeInTheDocument();
    v.rerender(<ResearchStatusBadge status="in_progress" />); expect(screen.getByText("Research in progress")).toBeInTheDocument();
    expect(within(screen.getByText("Research in progress")).getByText("Research in progress")).toBeInTheDocument();
  });
});
