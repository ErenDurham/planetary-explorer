// The discovery journey end to end through the whole App, against injected
// services: Explore opens on Find Earth Analogs with the first result selected
// → its evidence → Research with the ranking context → notes saved → back to
// the same candidate with its new status → export. Also: re-ranking keeps an
// explicit selection, a draft survives the round trip, a listed survey whose
// artifacts are missing is reported, and a failed save keeps the notes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import { useDiscoveryStore } from "./store/useDiscoveryStore";
import { useCandidateResearchTarget } from "./store/useCandidateResearchTarget";
import { setDiscoveryService, DiscoveryNotFound } from "./adapter";
import { candidates, connectedService, detail, exportPayload, run } from "./test/fixtures";

vi.mock("@/components/globe/PlanetViewer", () => ({ PlanetViewer: (props: { markers: Array<{ id: string }> }) => <div data-testid="globe-stub">globe: {props.markers.length} markers</div> }));
const engine = vi.hoisted(() => ({ research: vi.fn(), saveResearch: vi.fn() }));
vi.mock("@/services/discoveryEngine", () => ({ discoveryEngine: engine }));

import App from "@/App";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const catalog = { locations: [{ body: "earth", id: "atacama_yungay", name: "Atacama Desert - Yungay region", region: "Chile", lat: -24.08, lon_east: -69.95, measurements: [] }] };
const health = { status: "ok", services: { data: "ok", retrieval: "ok", llm: "disabled" }, profile_version: "p", scoring_spec_version: "s" };
let record = { status: "unresearched" as const, notes: "", findings: [] as never[], run_id: run.run_id, candidate_id: candidates[0].id, updated_at: null as string | null };
const dossierFor = (id: string) => ({ run_id: run.run_id, candidate_id: id, candidate: detail(id), record: id === candidates[0].id ? record : { ...record, candidate_id: id }, research_questions: ["Has this region already been studied?"], search_tasks: [{ label: "Prior analog work", query: "q", url: "https://ntrs.nasa.gov/search" }], research_brief: "brief", background_evidence: [], retrieval_status: "background_available" as const, limitations: [] });

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><App /></QueryClientProvider>);
}

describe("discovery journey", () => {
  beforeEach(() => {
    record = { status: "unresearched", notes: "", findings: [], run_id: run.run_id, candidate_id: candidates[0].id, updated_at: null };
    useDiscoveryStore.setState({ runId: null, runs: {}, weights: { slope_regional_median_deg: 50, roughness_regional_m: 50 }, defaultWeights: { slope_regional_median_deg: 50, roughness_regional_m: 50 }, topK: 5, view: "map", selectionRevision: 0 });
    useCandidateResearchTarget.setState({ target: null, drafts: {} });
    useAppStore.setState({ activeTab: "explore", exploreMode: "find_analogs", selectedEarthId: null, selectedMarsId: null, selectedSiteId: null, missionDesigned: false, appliedObjective: "" });
    engine.research.mockImplementation(async (_run: string, id: string) => dossierFor(id));
    engine.saveResearch.mockImplementation(async (_run: string, id: string, update: { status: typeof record.status; notes: string }) => { record = { ...record, ...update, candidate_id: id, updated_at: "2026-11-15T12:00:00Z" }; return record; });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => { const url = String(input); if (url.includes("/comparison/catalog")) return json(catalog); if (url.endsWith("/api/v1/health")) return json(health); return json({ error: { code: "not_found", message: `unmocked ${url}` } }, 404); });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("default results → selection → research → save → return with status → export", async () => {
    // the fixture service, with the first candidate's research_status read from the saved record on every ranking
    const svc = connectedService();
    const baseRank = svc.rank;
    svc.rank = async (req, signal) => { const r = await baseRank(req, signal); return { ...r, candidates: r.candidates.map(c => c.id === candidates[0].id ? { ...c, research_status: record.status } : c) }; };
    setDiscoveryService(svc);
    mount();
    // Explore opens on Find Earth Analogs, no mission design needed; the primary navigation is Explore and Research
    expect(screen.getByRole("radio", { name: "Find Unresearched Analogs" })).toHaveAttribute("aria-checked", "true");
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("button", { name: "Explore" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("button", { name: "Research" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Mission Design" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Find unresearched analogs for Jezero." })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Ranked proposed candidates" });
    // the first result is selected once and its evidence is in the panel
    const row1 = within(list).getByRole("button", { name: /Rank 1.*Footprint c_31_25_m2_75/ });
    expect(row1).toHaveAttribute("aria-pressed", "true");
    const panel = screen.getByTestId("discovery-panel");
    expect(within(panel).getByRole("article", { name: /Candidate evidence: Footprint c_31_25_m2_75/ })).toBeInTheDocument();
    expect(within(panel).getByRole("region", { name: "What matches" })).toHaveTextContent(/Regional slope is close/);
    // re-ranking keeps an explicit selection (row 2) rather than resetting to the top
    fireEvent.click(within(list).getByRole("button", { name: /Rank 2.*Footprint c_31_75_m2_25/ }));
    fireEvent.change(screen.getByRole("slider", { name: /Detrended regional relief weight share/ }), { target: { value: "80" } });
    await waitFor(() => expect(svc.calls).toHaveLength(2));
    await waitFor(() => expect(within(list).getByRole("button", { name: /Footprint c_31_75_m2_25/ })).toHaveAttribute("aria-pressed", "true"));
    expect(within(panel).getByRole("article", { name: /Candidate evidence: Footprint c_31_75_m2_25/ })).toBeInTheDocument();
    // back to the default weights: the first ranking is served from the cache, no new request
    fireEvent.change(screen.getByRole("slider", { name: /Detrended regional relief weight share/ }), { target: { value: "50" } });
    await waitFor(() => expect(within(list).getByRole("button", { name: /Rank 1.*Footprint c_31_25_m2_75/ })).toBeInTheDocument());
    expect(svc.calls).toHaveLength(2);
    fireEvent.click(within(list).getByRole("button", { name: /Rank 1.*Footprint c_31_25_m2_75/ }));
    // research: context travels, notes are typed, saved, and the draft is cleared
    fireEvent.click(screen.getByTestId("research-this-candidate"));
    expect(await screen.findByText("Deep research: Footprint c_31_25_m2_75")).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Research" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByTestId("research-ranking-context")).toHaveTextContent(/Rank 1 of 3 in this session's ranking · index 77\.1/);
    expect(useAppStore.getState().selectedMarsId).toBe("jezero_crater");
    fireEvent.change(screen.getByLabelText("Review summary and remaining gaps"), { target: { value: "Journey notes: checking prior analog work before any field visit." } });
    expect(screen.getByTestId("draft-indicator")).toBeInTheDocument();
    // a draft survives going back to Explore and returning
    fireEvent.click(screen.getByRole("button", { name: "Back to this candidate in Explore" }));
    expect(await screen.findByRole("list", { name: "Ranked proposed candidates" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Ranked proposed candidates" })).getByRole("button", { name: /Footprint c_31_25_m2_75/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(nav).getByRole("button", { name: "Research" }));
    expect(await screen.findByLabelText("Review summary and remaining gaps")).toHaveValue("Journey notes: checking prior analog work before any field visit.");
    fireEvent.change(screen.getByLabelText("Candidate research status"), { target: { value: "in_progress" } });
    fireEvent.click(screen.getByRole("button", { name: "Save research notes" }));
    await waitFor(() => expect(engine.saveResearch).toHaveBeenCalledWith(run.run_id, candidates[0].id, expect.objectContaining({ status: "in_progress" })));
    expect(await screen.findByText(/Research notebook saved/)).toBeInTheDocument();
    expect(screen.queryByTestId("draft-indicator")).toBeNull();
    // the brief downloads without another save
    fireEvent.click(screen.getByTestId("download-research-brief"));
    expect(await screen.findByText(/Saved research-brief-pilot_2026_11_14-c_31_25_m2_75\.md/)).toBeInTheDocument();
    expect(engine.saveResearch).toHaveBeenCalledTimes(1);
    // back in Explore the row and the panel carry the new status (the ranking was invalidated and re-read)
    fireEvent.click(screen.getByRole("button", { name: "Back to this candidate in Explore" }));
    const list2 = await screen.findByRole("list", { name: "Ranked proposed candidates" });
    await waitFor(() => expect(within(list2).getByRole("button", { name: /Footprint c_31_25_m2_75/ })).toHaveTextContent(/Research in progress/));
    // export: the audit JSON still downloads from the left column
    fireEvent.click(screen.getByRole("button", { name: /Download survey audit/ }));
    expect(await screen.findByText(new RegExp(`Saved discovery-${run.run_id}-audit\\.json \\(${exportPayload.audit_rows.length} audit rows\\)`))).toBeInTheDocument();
    // the curated selections were never touched by discovery
    expect(useAppStore.getState().selectedEarthId).toBeNull();
  });

  it("reports a listed survey whose artifacts are missing, and keeps notes when a save fails", async () => {
    setDiscoveryService(connectedService({ rank: async () => { throw new DiscoveryNotFound("run artifacts missing"); } }));
    mount();
    await waitFor(() => expect(screen.getAllByRole("alert").some(a => /This survey is listed but its artifacts could not be found/.test(a.textContent ?? ""))).toBe(true));
    expect(screen.getByTestId("discovery-panel")).toHaveTextContent(/Select a candidate on the globe or in the list/);
    // a failed save in Research keeps the notes and says nothing was saved
    engine.saveResearch.mockRejectedValue(new Error("Browser storage is unavailable."));
    useCandidateResearchTarget.getState().open(run.run_id, candidates[0].id);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("button", { name: "Research" }));
    expect(await screen.findByText("Deep research: Footprint c_31_25_m2_75")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Review summary and remaining gaps"), { target: { value: "Keep me." } });
    fireEvent.click(screen.getByRole("button", { name: "Save research notes" }));
    expect(await screen.findByText(/Nothing was saved\. Your notes are still here/)).toBeInTheDocument();
    expect(screen.getByLabelText("Review summary and remaining gaps")).toHaveValue("Keep me.");
  });

  it("keeps Analyze and Compare reachable behind Advanced", async () => {
    setDiscoveryService(connectedService());
    mount();
    fireEvent.click(screen.getByTestId("advanced-nav"));
    const menu = screen.getByRole("menu", { name: "Advanced tools" });
    expect(within(menu).getAllByRole("menuitem").map(m => m.textContent?.split(/[A-Z][a-z]+ [a-z]/)[0])).toEqual(expect.arrayContaining([expect.stringContaining("Analyze"), expect.stringContaining("Compare")]));
    expect(within(menu).queryByRole("menuitem", { name: /Mission Design/ })).toBeNull();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /^Analyze/ }));
    expect(useAppStore.getState().activeTab).toBe("analyze");
    expect(screen.getByTestId("advanced-nav")).toHaveTextContent(/Advanced · Analyze/);
  });
});
