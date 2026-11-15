// The discovery workflow against test-injected services: ready, unavailable,
// dead, empty, rejected, stale. Also that discovery selections never touch the
// curated analog selection, and that the Explore page points at this view.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";

vi.mock("@/components/globe/PlanetViewer", () => ({
  PlanetViewer: (props: { markers: Array<{ id: string; name: string }>; statusLine?: string; onSelect: (id: string) => void; selectedId: string | null }) => (
    <div data-testid="globe-stub">globe: {props.markers.length} markers · {props.statusLine} · selected {props.selectedId ?? "none"}
      {props.markers.map(m => <button key={m.id} type="button" onClick={() => props.onSelect(m.id)}>{m.name}</button>)}
    </div>
  ),
}));

import { DiscoveryView } from "./DiscoveryView";
import { setDiscoveryService, DiscoveryRequestRejected } from "../adapter";
import { useDiscoveryStore } from "../store/useDiscoveryStore";
import { candidates, capabilities, connectedService, deadService, rankResponse, run, unavailableService } from "../test/fixtures";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const catalog = { locations: [{ body: "earth", id: "atacama_yungay", name: "Atacama Desert - Yungay region", region: "Chile", lat: -24.08, lon_east: -69.95, measurements: [] }, { body: "earth", id: "near_site", name: "A site inside the view", region: "Morocco", lat: 31.5, lon_east: -2.5, measurements: [] }] };

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><DiscoveryView /></QueryClientProvider>);
}

describe("DiscoveryView", () => {
  beforeEach(() => {
    useDiscoveryStore.setState({ runId: null, runs: {}, weights: { slope_regional_median_deg: 50, roughness_regional_m: 50 }, defaultWeights: { slope_regional_median_deg: 50, roughness_regional_m: 50 }, topK: 5, view: "map" });
    useAppStore.setState({ selectedEarthId: "atacama_yungay", selectedMarsId: "jezero_crater", activeTab: "discover", appliedObjective: "", missionObjective: "Identify new candidate Earth regions beyond established analog sites" });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => String(input).includes("/comparison/catalog") ? json(catalog) : json({ error: { code: "not_found", message: `unmocked ${String(input)}` } }, 404));
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}); // jsdom cannot navigate to a blob: URL
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("walks choose survey → rank → inspect → re-weight → export, with every number from the service", async () => {
    const svc = connectedService();
    setDiscoveryService(svc);
    mount();
    await screen.findByRole("button", { name: "Find terrain matches" });
    expect(screen.getByRole("heading", { name: "Discover Earth regions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Discover Earth regions" })).toBeInTheDocument();
    expect(screen.getByText(/Find terrain that resembles Jezero Crater/)).toBeInTheDocument();
    // survey chosen by default, nothing ranked yet, no numbers that look like scores
    expect(screen.getByRole("combobox", { name: "Installed survey" })).toHaveValue(run.run_id);
    expect(screen.getByText(/16 footprints sampled · 3 eligible · not ranked yet/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Ranked proposed candidates" })).toBeNull();
    expect(svc.calls).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Find terrain matches" }));
    const list = await screen.findByRole("list", { name: "Ranked proposed candidates" });
    expect(svc.calls).toHaveLength(1);
    expect(svc.calls[0]).toMatchObject({ run_id: run.run_id, reference_id: "jezero_crater", top_k: 5, weights: { slope_regional_median_deg: 50, roughness_regional_m: 50 } });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByRole("button", { name: /Rank 1: Footprint c_31_25_m2_75, similarity index 77\.1/ })).toBeInTheDocument();
    // survey boundary, sampling coverage, footprints, established site in view, counts
    expect(screen.getByTestId("survey-boundary")).toBeInTheDocument();
    expect(screen.getAllByTestId("sampling-centre")).toHaveLength(16);
    expect(screen.getAllByTestId("candidate-footprint")).toHaveLength(3);
    expect(screen.getAllByTestId("established-site")).toHaveLength(1);
    fireEvent.click(screen.getByText("Screening audit, methods and data sources"));
    const funnel = screen.getByRole("region", { name: "Survey coverage and screening" });
    expect(funnel).toHaveTextContent(/Generated16Terrain valid14Eligible3Excluded13/);
    expect(funnel).toHaveTextContent(/insufficient terrain coverage2/);
    expect(funnel).toHaveTextContent("2011-2015 (TanDEM-X)");
    expect(funnel).toHaveTextContent(/Ranked pool 3 · returned 3/);
    // inspect a candidate: label, factor table, novelty wording, missing evidence, validation steps from the detail call
    fireEvent.click(within(list).getByRole("button", { name: /Rank 2:/ }));
    const card = await screen.findByRole("article", { name: /Candidate evidence: Footprint c_31_75_m2_25/ });
    expect(card).toHaveTextContent("Proposed terrain analog candidate; field validation required.");
    expect(card).toHaveTextContent("61.4");
    expect(within(card).getByRole("table")).toHaveTextContent(/Regional median slope.*1\.3°.*1\.077°/);
    expect(card).toHaveTextContent(/Outside catalog buffer/);
    expect(card).toHaveTextContent(/not scientific novelty/);
    expect(card).toHaveTextContent(/Geology: not assessed/);
    expect(card).toHaveTextContent(/Climate context: not available/);
    expect(await within(card).findByText(/Acquire higher-resolution DEM/)).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/unknown to science|validated analog|safe to|accessible/i);
    // the curated selection is untouched
    expect(useAppStore.getState().selectedEarthId).toBe("atacama_yungay");
    fireEvent.click(screen.getByText(/^Refine matching/));
    // re-weight: new request keyed on the new weights; the fake reverses the order when relief dominates
    fireEvent.change(screen.getByRole("slider", { name: /Detrended regional relief weight share/ }), { target: { value: "80" } });
    await waitFor(() => expect(svc.calls).toHaveLength(2));
    expect(svc.calls[1].weights).toEqual({ slope_regional_median_deg: 20, roughness_regional_m: 80 });
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Ranked proposed candidates" })).getByRole("button", { name: /Rank 1: Footprint c_31_25_m2_25/ })).toBeInTheDocument());
    // the selected candidate's detail follows the new rank response
    expect(screen.getByRole("article", { name: /Candidate evidence/ })).toHaveTextContent("Region 2");
    // export the server artifact
    fireEvent.click(screen.getByText("Export full ranking and audit"));
    fireEvent.click(screen.getByRole("button", { name: /Download survey audit/ }));
    expect(await screen.findByText(/Saved discovery-pilot_2026_11_14-audit\.json \(3 audit rows\)/)).toBeInTheDocument();
  });

  it("saves candidates for comparison and hands the right survey region to Research", async () => {
    setDiscoveryService(connectedService());
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Find terrain matches" }));
    const list = await screen.findByRole("list", { name: "Ranked proposed candidates" });
    fireEvent.click(within(list).getByRole("button", { name: `Save ${candidates[1].name} to shortlist` }));
    const comparison = screen.getByRole("region", { name: "Shortlist comparison table" });
    expect(comparison).toHaveTextContent(candidates[1].name);
    fireEvent.click(within(comparison).getByRole("button", { name: "Research candidate" }));
    const { useCandidateResearchTarget } = await import("../store/useCandidateResearchTarget");
    expect(useCandidateResearchTarget.getState().target).toEqual({ runId: run.run_id, candidateId: candidates[1].id });
    expect(useAppStore.getState().activeTab).toBe("research");
    expect(useAppStore.getState().selectedEarthId).toBe("atacama_yungay");
  });

  it("lets an empty survey expose its screening audit instead of blocking the workflow", async () => {
    const emptyRun = { ...run, eligible_count: 0 };
    setDiscoveryService(connectedService({ capabilities: async () => ({ ...capabilities, runs: [emptyRun] }), rank: async req => ({ ...rankResponse(req, []), eligible_pool_count: 0 }) }));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "View screening results" }));
    expect(await screen.findByText(/No eligible region in this survey/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Screening audit, methods and data sources"));
    expect(screen.getByRole("region", { name: "Survey coverage and screening" })).toBeVisible();
  });

  it("shows an honest unavailable state when no survey is installed, with nothing simulated", async () => {
    setDiscoveryService(unavailableService);
    mount();
    const box = await screen.findByTestId("discovery-unavailable");
    expect(box).toHaveTextContent(/No discovery survey is available/);
    expect(box).toHaveTextContent(/no verified survey artifacts installed/);
    expect(screen.queryByRole("button", { name: /Find terrain matches/ })).toBeNull();
    expect(screen.queryByTestId("candidate-footprint")).toBeNull();
  });

  it("shows an unavailable state when the service cannot be reached", async () => {
    setDiscoveryService(deadService);
    mount();
    expect(await screen.findByTestId("discovery-unavailable")).toHaveTextContent(/could not be reached/);
  });

  it("handles a survey whose ranking returns no eligible region, and a rejected request", async () => {
    const svc = connectedService({ rank: async (req) => ({ ...rankResponse(req, []), eligible_pool_count: 0, returned_count: 0 }) });
    setDiscoveryService(svc);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Find terrain matches" }));
    expect(await screen.findByText(/No eligible region in this survey/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Terrain matches 0/ })).toBeInTheDocument();
    setDiscoveryService(connectedService({ rank: async () => { throw new DiscoveryRequestRejected("validation_error", "weights must have a positive total"); } }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh matches" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/weights must have a positive total/);
  });

  it("drops a stale ranking that arrives after a newer request", async () => {
    let releaseFirst: (() => void) | null = null;
    let n = 0;
    const svc = connectedService({ rank: (req) => new Promise(resolve => { n += 1; if (n === 1) releaseFirst = () => resolve({ ...rankResponse(req), candidates: [{ ...candidates[0], name: "STALE RESULT" }], returned_count: 1 }); else resolve(rankResponse(req)); }) });
    setDiscoveryService(svc);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Find terrain matches" }));
    await waitFor(() => expect(n).toBe(1));
    fireEvent.click(screen.getByText(/^Refine matching/));
    fireEvent.change(screen.getByRole("slider", { name: /Regional median slope weight share/ }), { target: { value: "70" } });
    await waitFor(() => expect(n).toBe(2));
    await screen.findByRole("list", { name: "Ranked proposed candidates" });
    releaseFirst!();
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByText("STALE RESULT")).toBeNull();
    expect(screen.getByRole("button", { name: /Rank 1: Footprint c_31_25_m2_75/ })).toBeInTheDocument();
  });

  it("keeps discovery and curated pools independent on the globe view and lists catalog sites as established", async () => {
    setDiscoveryService(connectedService());
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Find terrain matches" }));
    await screen.findByRole("list", { name: "Ranked proposed candidates" });
    fireEvent.click(screen.getByRole("button", { name: "Globe" }));
    const globe = await screen.findByTestId("globe-stub");
    expect(globe).toHaveTextContent("globe: 5 markers");
    expect(globe).toHaveTextContent(/3 proposed candidate centres/);
    fireEvent.click(within(globe).getByRole("button", { name: "Footprint c_31_25_m2_75" }));
    expect(useDiscoveryStore.getState().runs[run.run_id].selectedCandidateId).toBe("c_31_25_m2_75");
    fireEvent.click(within(globe).getByRole("button", { name: /Atacama Desert - Yungay region \(established analog\)/ }));
    expect(useDiscoveryStore.getState().runs[run.run_id].selectedCandidateId).toBe("c_31_25_m2_75");
    expect(useAppStore.getState().selectedEarthId).toBe("atacama_yungay");
  });

  it("keyboard: footprints on the map are focusable buttons that select on Enter", async () => {
    setDiscoveryService(connectedService());
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Find terrain matches" }));
    const fp = (await screen.findAllByTestId("candidate-footprint")).find(el => el.getAttribute("aria-label")?.includes("c_31_25_m2_25"))!;
    expect(fp).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(fp, { key: "Enter" });
    expect(screen.getByRole("article", { name: /Candidate evidence: Footprint c_31_25_m2_25/ })).toBeInTheDocument();
  });

  it("routes to the established analogs without carrying a discovery candidate into the curated selection", async () => {
    setDiscoveryService(connectedService({ capabilities: async () => ({ ...capabilities }) }));
    mount();
    await screen.findByRole("heading", { name: "Discover Earth regions" });
    fireEvent.click(within(screen.getByRole("navigation", { name: "Analog views" })).getByRole("button", { name: "Browse established analogs" }));
    const s = useAppStore.getState();
    expect(s.activeTab).toBe("explore");
    expect(s.viewedBody).toBe("earth");
    expect(s.mapMode).toBe("analog_match");
    expect(s.selectedEarthId).toBe("atacama_yungay");
  });
});
