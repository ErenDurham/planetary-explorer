// Compare: two linked Earth/Mars columns for one hand-selected pair. These
// tests mock fetch per endpoint so each side's imagery can fail, lag or lack
// georeferencing independently of the other.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CompareView } from "./CompareView";
import { useAppStore } from "@/store/useAppStore";
import catalog from "@/test/fixtures/comparison_catalog.json";
import rankJezero from "@/test/fixtures/analog_rank_jezero.json";
import rankAtacama from "@/test/fixtures/analog_rank_atacama.json";
import matchJezero from "@/test/fixtures/analog_match_jezero.json";
import type { AnalogRankResponse, ImageryEntry, SiteImagery } from "@/types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const loc = (id: string) => (catalog.locations as { id: string; lat: number; lon_east: number }[]).find(l => l.id === id)!;
/** Bounds that contain the catalogue coordinate, like a real tile. */
const boundsFor = (id: string) => { const l = loc(id); return { west: l.lon_east - 0.3, east: l.lon_east + 0.3, south: l.lat - 0.3, north: l.lat + 0.3, source: "test grid" }; };
function entry(site_id: string, entry_id: string, view: "orbital" | "surface", extra: Partial<ImageryEntry> = {}): ImageryEntry {
  return { entry_id, site_id, view, image_type: view === "orbital" ? "orbital_mosaic" : "surface_image", title: `${entry_id} title`, institution: "Test Inst", credit: `Credit ${entry_id}`, license: "Public domain", source_page_url: "https://example.org/src", asset_url: "https://example.org/a.jpg", width_px: 800, height_px: 600, acquisition_date: null, release_date: "2020-01-01", spatial_resolution_m_per_px: 30, bounds: null, coverage_evidence: "test", relationship: "candidate_region", distance_from_site_km: 3, relevance: `Relevance of ${entry_id}`, verified_on: "2026-11-14", ...extra } as ImageryEntry;
}
const imagery: Record<string, SiteImagery> = {
  elysium_planitia: { site_id: "elysium_planitia", body: "mars", entries: [entry("elysium_planitia", "ely_ctx", "orbital", { bounds: boundsFor("elysium_planitia"), relationship: "exact_location", distance_from_site_km: 0 }), entry("elysium_planitia", "ely_pano", "surface")], missing_views: [], notes: [] },
  chryse_planitia: { site_id: "chryse_planitia", body: "mars", entries: [entry("chryse_planitia", "chryse_ctx", "orbital", { bounds: boundsFor("chryse_planitia") })], missing_views: ["surface"], notes: [] },
  atacama_yungay: { site_id: "atacama_yungay", body: "earth", entries: [entry("atacama_yungay", "atacama_gibs", "orbital", { bounds: boundsFor("atacama_yungay") })], missing_views: ["surface"], notes: ["No verifiable field photograph of the Yungay core was found."] },
  haughton_crater: { site_id: "haughton_crater", body: "earth", entries: [entry("haughton_crater", "haughton_orbital", "orbital"), entry("haughton_crater", "haughton_photo", "surface", { relationship: "exact_location", distance_from_site_km: 0 })], missing_views: [], notes: [] },
};
type Plan = { earth404?: boolean; earthNetworkError?: boolean; deferEarth?: string };
const deferred: Record<string, (r: Response) => void> = {};
function mockApi(plan: Plan = {}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/comparison/catalog")) return json(catalog);
    if (url.endsWith("/analogs/rank")) {
      const body = JSON.parse(String(init?.body));
      if (body.reference_body === "mars") return json(rankJezero);
      const rank = JSON.parse(JSON.stringify(rankAtacama)) as AnalogRankResponse;
      if (body.reference_id === "haughton_crater") for (const c of rank.candidates) if (c.location.id === "elysium_planitia") { c.similarity = 12.3; c.rank = 7; }
      return json(rank);
    }
    if (url.endsWith("/analogs/match")) return json(matchJezero);
    const m = url.match(/\/sites\/([^/]+)\/imagery$/);
    if (m) {
      const id = m[1];
      const isEarth = ["atacama_yungay", "haughton_crater"].includes(id);
      if (isEarth && plan.earth404) return json({ error: { code: "not_found", message: `imagery for '${id}' not found` } }, 404);
      if (isEarth && plan.earthNetworkError) throw new TypeError("Failed to fetch");
      if (plan.deferEarth === id) return new Promise<Response>(resolve => { deferred[id] = resolve; });
      return imagery[id] ? json(imagery[id]) : json({ error: { code: "not_found", message: "nope" } }, 404);
    }
    return json({ error: { code: "not_found", message: `unmocked ${url}` } }, 404);
  });
}
function view(selectedId = "elysium_planitia") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><CompareView sites={[]} selectedId={selectedId} /></QueryClientProvider>);
}
beforeEach(() => { useAppStore.setState(useAppStore.getInitialState()); useAppStore.setState({ comparison: { ...useAppStore.getState().comparison, earthId: "atacama_yungay" } }); });
afterEach(() => vi.restoreAllMocks());

describe("pair columns and the objective", () => {
  it("orders the selection body first and the reference second; swapping changes display only, never the task", async () => {
    mockApi();
    useAppStore.setState({ selectionBody: "earth", task: "analog_site_selection" });
    view();
    const group = await screen.findByRole("group", { name: "Compared locations" });
    const labels = () => within(group).getAllByText(/^(Selected|Reference) on (Earth|Mars)$/).map(e => e.textContent);
    expect(labels()).toEqual(["Selected on Earth", "Reference on Mars"]);
    const panes = () => screen.getAllByTestId(/^pane-/).map(p => p.getAttribute("data-testid"));
    expect(panes()).toEqual(["pane-earth", "pane-mars"]);
    fireEvent.click(screen.getByRole("button", { name: /Swap display order/ }));
    expect(labels()).toEqual(["Reference on Mars", "Selected on Earth"]);
    expect(panes()).toEqual(["pane-mars", "pane-earth"]);
    expect(useAppStore.getState().task).toBe("analog_site_selection");
    expect(useAppStore.getState().selectionBody).toBe("earth");
    expect(screen.getByTestId("context-line")).toHaveTextContent(/Reference: Elysium Planitia.* on Mars · analog preferences: slopes 25%/);
  });
  it("edits one body's selection at a time through selectLocation and keeps the Moon out of Compare", async () => {
    mockApi();
    view();
    const earth = await screen.findByLabelText("Earth location");
    expect(earth).toHaveValue("atacama_yungay");
    expect(screen.getByLabelText("Mars location")).toHaveValue("elysium_planitia");
    fireEvent.change(earth, { target: { value: "haughton_crater" } });
    expect(useAppStore.getState().selectedEarthId).toBe("haughton_crater");
    expect(useAppStore.getState().selectedMarsId).toBeNull();
    fireEvent.change(screen.getByLabelText("Mars location"), { target: { value: "chryse_planitia" } });
    expect(useAppStore.getState().selectedMarsId).toBe("chryse_planitia");
    expect(useAppStore.getState().selectedEarthId).toBe("haughton_crater");
    expect(screen.queryByLabelText("Moon location")).toBeNull();
    expect(screen.queryByRole("button", { name: /All three|Moon/ })).toBeNull();
    expect(screen.queryByText(/Apollo|Tranquility/)).toBeNull();
    // reweighting re-ranks but never changes the hand-selected pair
    act(() => useAppStore.getState().setAnalogWeight("terrain_morphology", 60));
    expect(screen.getByLabelText("Earth location")).toHaveValue("haughton_crater");
    expect(screen.getByLabelText("Mars location")).toHaveValue("chryse_planitia");
  });
});

describe("side-by-side panes", () => {
  it("keeps the Mars pane useful while the Earth side is unavailable, with per-side retry", async () => {
    mockApi({ earth404: true });
    view();
    const earthPane = await screen.findByTestId("pane-earth");
    await within(earthPane).findByText(/Earth imagery unavailable for Atacama/);
    expect(within(earthPane).getByRole("button", { name: "Retry Earth imagery" })).toBeInTheDocument();
    const marsPane = screen.getByTestId("pane-mars");
    expect(await within(marsPane).findByRole("img", { name: /ely_ctx title/ })).toBeInTheDocument();
    expect(within(marsPane).queryByText(/unavailable/)).toBeNull();
  });
  it("shows a network failure on one side as an error with retry, independently of the other", async () => {
    mockApi({ earthNetworkError: true });
    view();
    const earthPane = await screen.findByTestId("pane-earth");
    expect(await within(earthPane).findByRole("alert")).toBeInTheDocument();
    expect(within(earthPane).getByRole("button", { name: "Retry Earth imagery" })).toBeInTheDocument();
    expect(await within(screen.getByTestId("pane-mars")).findByRole("img", { name: /ely_ctx title/ })).toBeInTheDocument();
  });
  it("ignores an imagery response for a location that is no longer selected", async () => {
    mockApi({ deferEarth: "atacama_yungay" });
    view();
    const earth = await screen.findByLabelText("Earth location");
    expect(await within(screen.getByTestId("pane-earth")).findByText(/Loading Earth imagery/)).toBeInTheDocument();
    fireEvent.change(earth, { target: { value: "haughton_crater" } });
    expect(await within(screen.getByTestId("pane-earth")).findByRole("img", { name: /haughton_orbital title/ })).toBeInTheDocument();
    await act(async () => { deferred.atacama_yungay(json(imagery.atacama_yungay)); await new Promise(r => setTimeout(r, 20)); });
    const pane = screen.getByTestId("pane-earth");
    expect(within(pane).getByRole("img", { name: /haughton_orbital title/ })).toBeInTheDocument();
    expect(within(pane).queryByRole("img", { name: /atacama_gibs/ })).toBeNull();
    expect(within(pane).getByRole("heading", { level: 3 })).toHaveTextContent("Haughton impact structure");
  });
  it("draws the footprint, marker and scale bar only when the entry carries bounds", async () => {
    mockApi();
    useAppStore.setState({ selectedEarthId: "haughton_crater" });
    view();
    const marsPane = await screen.findByTestId("pane-mars");
    await within(marsPane).findByRole("img", { name: /ely_ctx title/ });
    expect(within(marsPane).getByTestId("point-marker")).toBeInTheDocument();
    expect(within(marsPane).getByTestId("footprint-outline")).toHaveAccessibleName(/Analysis footprint, ±0.5° square/);
    expect(within(marsPane).getByTestId("scale-bar")).toBeInTheDocument();
    const earthPane = screen.getByTestId("pane-earth");
    await within(earthPane).findByRole("img", { name: /haughton_orbital title/ });
    expect(within(earthPane).queryByTestId("geo-overlay")).toBeNull();
    expect(within(earthPane).getByTestId("no-georef")).toHaveTextContent("This image is not georeferenced");
  });
  it("enables Match scale only when both panes show georeferenced orbital entries", async () => {
    mockApi();
    view();
    await within(await screen.findByTestId("pane-earth")).findByRole("img", { name: /atacama_gibs title/ });
    const link = screen.getByRole("checkbox", { name: /Match the scale/ });
    expect(link).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Field photos" }));
    expect(screen.getByRole("checkbox", { name: /Match the scale/ })).toBeDisabled();
    expect(screen.getByText(/Field photos have no map scale/)).toBeInTheDocument();
    // the Earth side has no field photos: an explicit per-side state with a way back to orbital imagery
    const earthPane = screen.getByTestId("pane-earth");
    expect(within(earthPane).getByText(/No field photographs for Atacama/)).toBeInTheDocument();
    expect(within(earthPane).getByText(/No verifiable field photograph of the Yungay core/)).toBeInTheDocument();
    fireEvent.click(within(earthPane).getByRole("button", { name: /Show orbital view for this location instead/ }));
    expect(await within(earthPane).findByRole("img", { name: /atacama_gibs title/ })).toBeInTheDocument();
    expect(within(screen.getByTestId("pane-mars")).getByRole("img", { name: /ely_pano title/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Orbital view" }));
    fireEvent.change(screen.getByLabelText("Earth location"), { target: { value: "haughton_crater" } });
    await within(screen.getByTestId("pane-earth")).findByRole("img", { name: /haughton_orbital title/ });
    expect(screen.getByRole("checkbox", { name: /Match the scale/ })).toBeDisabled();
    expect(screen.getByText(/Both panes need georeferenced orbital images/)).toBeInTheDocument();
  });
});

describe("similarity for the exact pair", () => {
  it("reads similarity and rank from the rank response entry for the selected pair, not the top match", async () => {
    mockApi();
    view();
    const card = await screen.findByTestId("pair-similarity");
    const rank = rankAtacama as unknown as AnalogRankResponse;
    const ely = rank.candidates.find(c => c.location.id === "elysium_planitia")!;
    expect(ely.rank).not.toBe(1);
    expect(card).toHaveTextContent(`${ely.similarity!.toFixed(1).replace(/\.0$/, "")}`);
    expect(card).toHaveTextContent(`Rank ${ely.rank} of ${rank.ranked_count} ranked Mars candidates`);
    expect(screen.getByText(/Strongest supported similarities/)).toBeInTheDocument();
    expect(screen.getByText(/Important differences/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Earth location"), { target: { value: "haughton_crater" } });
    await waitFor(() => expect(screen.getByTestId("pair-similarity")).toHaveTextContent("12.3"));
    expect(screen.getByTestId("pair-similarity")).toHaveTextContent("Rank 7 of");
    expect(screen.queryByText(/landing suitability/i, { selector: "[data-testid=pair-similarity] *" })).toBeNull();
  });
  it("keeps planetary context, caveats and documented-versus-proposed studies apart from the index", async () => {
    mockApi();
    view();
    const context = await screen.findByRole("region", { name: /Planetary context. This is not part of the similarity score/ });
    expect(await within(context).findByText(/Gravity: Mars surface gravity/)).toBeInTheDocument();
    expect(context).toHaveTextContent(/Elevation datum/);
    const studies = await screen.findByRole("region", { name: "What this pair can help test" });
    expect(await within(studies).findAllByText("Documented")).not.toHaveLength(0);
    expect(within(studies).getByText(/Field work on Earth is not a completed Mars experiment/)).toBeInTheDocument();
    fireEvent.click(within(studies).getByRole("button", { name: /Open Research for/ }));
    expect(useAppStore.getState().activeTab).toBe("research");
    expect(useAppStore.getState().selectedMarsId).toBeNull();
    expect(screen.getByText(/2 m air temperatures/)).toBeInTheDocument();
    expect(screen.getByText(/cannot be subtracted/)).toBeInTheDocument();
    expect(screen.getByText(/Sunlight at the top of the atmosphere is not sunlight at the surface/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Pair measurements" })).toHaveTextContent(/~3.7 km matched baseline/);
  });
  it("shows a recoverable catalogue error without fabricating anything", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    view();
    expect(await screen.findByRole("button", { name: "Retry comparison" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
