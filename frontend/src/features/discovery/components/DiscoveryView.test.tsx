// The discovery workflow against test-injected services: ready, unavailable,
// dead, empty, rejected, stale, on the three-column workspace (list, stage,
// evidence panel). Also that discovery selections never touch the curated
// analog selection, and that the Explore page points at this view.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";

vi.mock("@/components/globe/PlanetViewer", () => ({
  PlanetViewer: (props: { markers: Array<{ id: string; name: string }>; statusLine?: string; onSelect: (id: string) => void; selectedId: string | null; overlays?: unknown; focusDistance?: number }) => (
    <div data-testid="globe-stub">globe: {props.markers.length} markers · {props.statusLine} · selected {props.selectedId ?? "none"} · overlays {props.overlays ? "drawn" : "none"} · focus {props.focusDistance ?? "default"}
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
    useAppStore.setState({ selectedEarthId: "atacama_yungay", selectedMarsId: "jezero_crater", activeTab: "explore", exploreMode: "find_analogs", appliedObjective: "", missionObjective: "Identify new candidate Earth regions beyond established analog sites" });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => String(input).includes("/comparison/catalog") ? json(catalog) : json({ error: { code: "not_found", message: `unmocked ${String(input)}` } }, 404));
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}); // jsdom cannot navigate to a blob: URL
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("explains the survey, ranks it automatically, and walks select → evidence → re-weight → export with every number from the service", async () => {
    const svc = connectedService();
    setDiscoveryService(svc);
    mount();
    expect(await screen.findByText("Survey installed · discovery-v2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Find unresearched analogs for Jezero." })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Explore mode" })).toBeInTheDocument();
    // the one installed survey is named, the area searched is stated, and ranking starts on its own
    expect(screen.getByTestId("survey-picker")).toHaveTextContent("Eastern Morocco pilot");
    expect(screen.getByText(/Earth was not searched globally/)).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Ranked proposed candidates" });
    expect(screen.getByText(/Numbered outlines: candidate footprints/)).toBeInTheDocument();

    expect(svc.calls).toHaveLength(1);
    // the scope line is bound to the run and the response: sampled count, area, reference, features, results shown
    // the scope line names the regions searched and the dimensions the survey actually scores
    expect(screen.getByText("16 surveyed locations in 2 deliberately under-studied regions compared with Jezero Crater on terrain and water. 3 candidate regions selected for review.")).toBeInTheDocument();
    expect(svc.calls[0]).toMatchObject({ run_id: run.run_id, reference_id: "jezero_crater", top_k: 5, weights: { slope_regional_median_deg: 40, roughness_regional_m: 40, precipitation_mm_day: 20 } });
    // headline numbers bound to the response: evaluated, presented, footprint, resolution
    const stats = screen.getByTestId("survey-stats");
    expect(stats).toHaveTextContent(/16locations evaluated/);
    expect(stats).toHaveTextContent(/3spatially separated candidates presented/);
    expect(stats).toHaveTextContent(/60 × 60 kmcomparison footprints/);
    expect(stats).toHaveTextContent(/4 kmterrain analysis resolution/);
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    // the left list: rank, where, index and the two status chips, nothing invented
    const first = within(list).getByRole("button", { name: /Rank 1: Footprint c_31_25_m2_75, similarity index 77\.1/ });
    expect(first).toHaveTextContent(/31\.250°N, 2\.750°W/);
    expect(first).toHaveTextContent(/77\.1/);
    expect(first).toHaveTextContent(/Not near a catalog location/);
    expect(first.textContent).not.toMatch(/Outside catalog buffer/);
    expect(screen.getByRole("heading", { name: "Ranked candidates" })).toBeInTheDocument();
    expect(screen.getByText(/3 of 16 surveyed footprints/)).toBeInTheDocument();
    // the first result is selected once on arrival, so the evidence panel is never blank; clearing it shows the survey overview
    const panel = screen.getByTestId("discovery-panel");
    expect(within(list).getByRole("button", { name: /Rank 1.*Footprint c_31_25_m2_75/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(panel).getByRole("article", { name: /Candidate evidence: Footprint c_31_25_m2_75/ })).toBeInTheDocument();
    act(() => useDiscoveryStore.getState().selectCandidate(null));
    expect(panel).toHaveTextContent(/Select a candidate on the globe or in the list/);
    expect(panel).toHaveTextContent(/Reference region.*Jezero Crater · Mars/);
    expect(panel).toHaveTextContent(/How the index is calculated/);
    // a cleared selection stays cleared across a re-render and a re-ranking (auto-select runs once per run)
    fireEvent.change(screen.getByRole("spinbutton", { name: "Shortlist size" }), { target: { value: "4" } });
    await waitFor(() => expect(svc.calls).toHaveLength(2));
    await screen.findByRole("list", { name: "Ranked proposed candidates" });
    expect(useDiscoveryStore.getState().runs[run.run_id].selectedCandidateId).toBeNull();
    // survey boundary, sampling coverage, footprints, established site in view, counts
    expect(screen.getByTestId("survey-boundary")).toBeInTheDocument();
    expect(screen.getAllByTestId("sampling-centre")).toHaveLength(16);
    expect(screen.getAllByTestId("candidate-footprint")).toHaveLength(3);
    expect(screen.getAllByTestId("established-site")).toHaveLength(1);
    const funnel = screen.getByRole("region", { name: "Survey coverage and screening" });
    expect(funnel).toHaveTextContent(/Generated16Terrain valid14Eligible3Excluded13/);
    expect(funnel).toHaveTextContent(/insufficient terrain coverage2/);
    expect(funnel).toHaveTextContent("2011-2015 (TanDEM-X)");
    expect(funnel).toHaveTextContent(/Ranked pool 3 · returned 3/);
    // select a candidate from the list: the panel shows its evidence (label, index sentence, reasons, factor table, novelty wording, missing evidence, validation steps from the detail call)
    const row2 = within(list).getByRole("button", { name: /Rank 2:/ });
    fireEvent.click(row2);
    expect(row2).toHaveAttribute("aria-pressed", "true");
    const card = await screen.findByRole("article", { name: /Candidate evidence: Footprint c_31_75_m2_25/ });
    expect(within(panel).getByRole("article", { name: /Candidate evidence/ })).toBe(card);
    expect(card).not.toHaveTextContent("Proposed terrain analog candidate");   // removed as fluff
    expect(card).toHaveTextContent("61.4");
    expect(card).toHaveTextContent(/Terrain similarity: 61\.4\/100\. This reflects how closely the region's measured slope and relief match Jezero Crater under the selected weighting \(slope 40%, relief 40%\)\. It is not a probability/);
    expect(card).toHaveTextContent(/Regional (slope|relief) is close: .* at Jezero Crater/);
    expect(card).toHaveTextContent(/Not compared: climate, land cover, geology and materials/);
    expect(card).toHaveTextContent(/The catalog is incomplete/);
    expect(within(card).getByRole("table")).toHaveTextContent(/Regional median slope.*1\.3°.*1\.077°/);
    expect(card).toHaveTextContent(/Not near a catalog location/);
    expect(card).toHaveTextContent(/not a claim of novelty/);
    expect(card).toHaveTextContent(/Geology: not assessed/);
    expect(card).toHaveTextContent(/Climate context: not available/);
    expect(await within(card).findByText(/Acquire higher-resolution DEM/)).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/unknown to science|validated analog|safe to|accessible/i);
    // the curated selection is untouched
    expect(useAppStore.getState().selectedEarthId).toBe("atacama_yungay");
    // re-weight: new request keyed on the new weights; the fake reverses the order when relief dominates; the explicit selection survives
    fireEvent.change(screen.getByRole("slider", { name: /Detrended regional relief weight share/ }), { target: { value: "80" } });
    await waitFor(() => expect(svc.calls).toHaveLength(3));
    // the moved share is exact and the remaining features rebalance to what is left of 100
    expect(svc.calls[2].weights).toMatchObject({ roughness_regional_m: 80 });
    expect(Object.values(svc.calls[2].weights as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(100);
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Ranked proposed candidates" })).getByRole("button", { name: /Rank 1: Footprint c_31_25_m2_25/ })).toBeInTheDocument());
    // the selected candidate's detail follows the new rank response
    expect(screen.getByRole("article", { name: /Candidate evidence/ })).toHaveTextContent("Rank 2");
    // export the server artifact
    fireEvent.click(screen.getByRole("button", { name: /Survey audit artifact/ }));
    expect(await screen.findByText(/Saved discovery-pilot_2026_11_14-audit\.json \(3 audit rows\)/)).toBeInTheDocument();
  });

  it("shows an honest unavailable state when no survey is installed, with nothing simulated", async () => {
    setDiscoveryService(unavailableService);
    mount();
    const box = await screen.findByTestId("discovery-unavailable");
    expect(box).toHaveTextContent(/No terrain survey is installed/);
    expect(box).toHaveTextContent(/no verified survey artifacts installed/);
    expect(screen.queryByRole("list", { name: "Ranked proposed candidates" })).toBeNull();
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
    expect(await screen.findByText(/No footprint in this survey passed screening/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ranked candidates" })).toBeInTheDocument();
    setDiscoveryService(connectedService({ rank: async () => { throw new DiscoveryRequestRejected("validation_error", "weights must have a positive total"); } }));
    fireEvent.change(screen.getByRole("slider", { name: /Regional median slope weight share/ }), { target: { value: "60" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/weights must have a positive total/);
  });

  it("drops a stale ranking that arrives after a newer request", async () => {
    let releaseFirst: (() => void) | null = null;
    let n = 0;
    const svc = connectedService({ rank: (req) => new Promise(resolve => { n += 1; if (n === 1) releaseFirst = () => resolve({ ...rankResponse(req), candidates: [{ ...candidates[0], name: "STALE RESULT" }], returned_count: 1 }); else resolve(rankResponse(req)); }) });
    setDiscoveryService(svc);
    mount();
    await waitFor(() => expect(n).toBe(1));
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
    await screen.findByRole("list", { name: "Ranked proposed candidates" });
    fireEvent.click(screen.getByRole("button", { name: "Globe" }));
    const globe = await screen.findByTestId("globe-stub");
    expect(globe).toHaveTextContent("globe: 5 markers");
    expect(globe).toHaveTextContent(/3 proposed candidate footprints and 16 evaluated centres/);
    // the footprints, bounds and centres are drawn on the sphere and selection flies in close
    expect(globe).toHaveTextContent(/overlays drawn/);
    expect(globe).toHaveTextContent(/focus 1\.1/);
    act(() => useDiscoveryStore.getState().selectCandidate(null));
    const before = useDiscoveryStore.getState().selectionRevision;
    fireEvent.click(within(globe).getByRole("button", { name: "Footprint c_31_25_m2_75" }));
    expect(useDiscoveryStore.getState().runs[run.run_id].selectedCandidateId).toBe("c_31_25_m2_75");
    expect(useDiscoveryStore.getState().selectionRevision).toBe(before + 1);
    // the list row and the panel follow the globe click
    expect(within(screen.getByRole("list", { name: "Ranked proposed candidates" })).getByRole("button", { name: /Footprint c_31_25_m2_75/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("article", { name: /Candidate evidence: Footprint c_31_25_m2_75/ })).toBeInTheDocument();
    fireEvent.click(within(globe).getByRole("button", { name: /Atacama Desert - Yungay region \(catalog context site, not a candidate\)/ }));
    expect(useDiscoveryStore.getState().runs[run.run_id].selectedCandidateId).toBe("c_31_25_m2_75");
    expect(useAppStore.getState().selectedEarthId).toBe("atacama_yungay");
  });

  it("keyboard: footprints on the map are focusable buttons that select on Enter", async () => {
    setDiscoveryService(connectedService());
    mount();
    const fp = (await screen.findAllByTestId("candidate-footprint"))[2];
    expect(fp).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(fp, { key: "Enter" });
    expect(screen.getByRole("article", { name: /Candidate evidence: Footprint c_31_25_m2_25/ })).toBeInTheDocument();
  });

  it("routes to the established analogs under Browse Regions without carrying a discovery candidate into the curated selection", async () => {
    setDiscoveryService(connectedService({ capabilities: async () => ({ ...capabilities }) }));
    mount();
    await screen.findByText("Survey installed · discovery-v2");
    expect(screen.queryByRole("button",{name:/See the established analogs/})).toBeNull();
    const before=useAppStore.getState();
    fireEvent.click(screen.getByRole("radio", { name: "Browse Regions" }));
    const s = useAppStore.getState();
    expect(s.activeTab).toBe("explore");
    expect(s.exploreMode).toBe("browse");
    expect(s.viewedBody).toBe(before.viewedBody);
    expect(s.mapMode).toBe(before.mapMode);
    expect(s.selectedEarthId).toBe("atacama_yungay");
  });

  it("hands a candidate to Research Prospects while keeping the reference region selected", async () => {
    setDiscoveryService(connectedService());
    useAppStore.setState({ selectedMarsId: "gale_crater" });
    mount();
    const list = await screen.findByRole("list", { name: "Ranked proposed candidates" });
    fireEvent.click(within(list).getByRole("button", { name: /Rank 1:/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Research this candidate" }));
    const s = useAppStore.getState();
    expect(s.activeTab).toBe("research");
    expect(s.selectedMarsId).toBe("jezero_crater");
  });
});
