// Earth markers only ever render on the Earth globe and Mars markers on the
// Mars globe: the App is mounted with the WebGL viewer stubbed to print the
// body it was given and the ids of the markers it received.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fixture from "@/test/fixtures/api_examples.json";
import assessments from "@/test/fixtures/mission_assessment.json";
import catalog from "@/test/fixtures/comparison_catalog.json";
import { useAppStore, roverSharesFrom } from "@/store/useAppStore";

vi.mock("@/components/globe/PlanetViewer", () => ({
  PlanetViewer: (props: { config: { id: string }; markers: Array<{ id: string; mode: string; score: number | null }>; mode?: string; legendHeading?: string }) => (
    <div data-testid="globe-stub" data-body={props.config.id} data-mode={props.mode}>
      {props.config.id}:{props.markers.map((m) => `${m.id}/${m.mode}/${m.score ?? "-"}`).join(",")}|{props.legendHeading ?? ""}
    </div>
  ),
}));

import App from "./App";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const sitesFixture = { planet: "mars", sites: fixture.evaluate.results.map((r) => ({ ...fixture.site.site, id: r.site_id, name: r.site_name })), profile_version: "v1" };
const earthIds = (catalog as { locations: Array<{ id: string; body: string }> }).locations.filter((l) => l.body === "earth").map((l) => l.id);
let rankCalls: Array<Record<string, unknown>> = [];

function rankResponse(body: Record<string, unknown>) {
  const ids = body.candidate_body === "earth" ? earthIds : sitesFixture.sites.map((s) => s.id);
  const n = ids.length;
  return {
    reference: { body: body.reference_body, id: body.reference_id, name: body.reference_id === "elysium_planitia" ? "Elysium Planitia (InSight)" : String(body.reference_id), lat: 0, lon_east: 0 },
    candidate_body: body.candidate_body,
    basis_features: ["slope_regional_median_deg"],
    excluded_features: [],
    effective_weights: { slope_regional_median_deg: 1 },
    candidates: ids.map((id, i) => ({ location: { body: body.candidate_body, id, name: id, lat: 0, lon_east: 0 }, rank: i + 1, rank_color_position: n > 1 ? i / (n - 1) : 0, similarity: 90 - i * 5, distance: i, feature_distances: [], coverage_fraction: 1, unrankable_reason: null, shared_characteristics: [], important_differences: [], sources: [] })),
    pool_size: n,
    ranked_count: n,
    tie_rule: "distance then id",
    analog_spec_version: "analog-v1.0",
    profile_version: "v1",
    planetary_differences: [],
    warnings: [],
    client_request_id: body.client_request_id,
  };
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true);
  rankCalls = [];
  useAppStore.setState({ missionObjective: "Find a safe landing site with reliable solar energy.", missionType: "landing", task: "landing_screening", selectionBody: "mars", missionFocusOverride: null, weights: {}, defaultWeights: {}, hardConstraints: [], selectedSiteId: null, selectedMarsId: null, selectedEarthId: null, viewedBody: "mars", mapMode: "landing_suitability", followObjective: true, activeTab: "explore", suggestedSelection: null });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/v1/health")) return json({ status: "ok", version: "0.1.0", profile_version: "v1", scoring_spec_version: "landing-v1.0", services: { data: "ok", retrieval: "unavailable", llm: "unconfigured" } });
    if (url.includes("/api/v1/sites?")) return json(sitesFixture);
    if (url.match(/\/api\/v1\/sites\/[^/?]+$/)) return json(fixture.site);
    if (url.endsWith("/comparison/catalog")) return json(catalog);
    if (url.endsWith("/scoring/default-mission")) return json(fixture.default_mission);
    if (url.endsWith("/mission/interpret")) return json({ error: { code: "unavailable", message: "offline in test" } }, 503);
    if (url.endsWith("/scoring/evaluate")) { const body = JSON.parse(String(init?.body)); return json({ ...fixture.evaluate, client_request_id: body.client_request_id }); }
    if (url.endsWith("/missions/evaluate")) {const body=JSON.parse(String(init?.body)); return json({...assessments[body.body as "earth"|"mars"],client_request_id:body.client_request_id});}
    if (url.endsWith("/analogs/rank")) { const body = JSON.parse(String(init?.body)); rankCalls.push(body); return json(rankResponse(body)); }
    return json({ error: { code: "not_found", message: `unmocked ${url}`, details: null } }, 404);
  });
});
afterEach(() => vi.restoreAllMocks());

function renderApp() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><App /></QueryClientProvider>);
}

describe("Earth and Mars markers", () => {
  it("renders Mars sites with landing scores on Mars, and only the seven Earth candidates (never with a landing score) on Earth", async () => {
    renderApp();
    const stub = await screen.findByTestId("globe-stub");
    await waitFor(() => expect(stub).toHaveTextContent(`mars:${sitesFixture.sites[0].id}/landing/`), { timeout: 3000 });
    expect(stub).toHaveAttribute("data-body", "mars");
    expect(stub).toHaveAttribute("data-mode", "landing");
    for (const id of earthIds) expect(stub).not.toHaveTextContent(id);

    fireEvent.click(screen.getByRole("button", { name: "View Earth" }));
    await waitFor(() => expect(screen.getByTestId("globe-stub")).toHaveAttribute("data-body", "earth"));
    const earthStub = screen.getByTestId("globe-stub");
    await waitFor(() => expect(earthStub).toHaveTextContent("haughton_crater/analog/-"), { timeout: 3000 });
    expect(earthStub).toHaveAttribute("data-mode", "analog");
    // the fixture catalogue carries a subset of the seven live Earth candidates; every one of them, and nothing else, is on the Earth globe
    expect(earthIds.length).toBeGreaterThan(0);
    for (const id of earthIds) expect(earthStub).toHaveTextContent(`${id}/analog/-`);
    for (const s of sitesFixture.sites) expect(earthStub).not.toHaveTextContent(s.id);
    // Planet navigation initializes a mission site, so analogs rank immediately.
    expect(rankCalls.length).toBeGreaterThan(0);
    expect(rankCalls[0].reference_id).toBe(useAppStore.getState().selectedMarsId);
    expect(screen.queryByTestId("landing-legend")).toBeNull();
  });
  it("explicit Earth focus opens scored mission profiles, then ranks Mars analogs against the Earth selection", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button",{name:"Mission Design"}));
    // the tab opens on the chat box alone; Mission focus appears once a mission is saved
    const box=screen.getByLabelText("Your mission objective");
    fireEvent.change(box,{target:{value:"Test a rover on Earth terrain"}});
    await waitFor(()=>expect(screen.getByRole("button",{name:"Save"})).toBeEnabled());
    fireEvent.keyDown(box,{key:"Enter"});
    fireEvent.click(await screen.findByRole("button",{name:"Earth"}));
    expect(screen.getByRole("heading",{name:"Mission priorities"})).toBeInTheDocument();
    expect(screen.getAllByRole("slider")).toHaveLength(4); // the same sliders as Mars
    fireEvent.change(screen.getByLabelText("Low slopes share of priorities"),{target:{value:"40"}});
    expect(useAppStore.getState().earthWeights.terrain_safety).toBe(40);
    expect(useAppStore.getState().missionProfileWeights.rover_field_test).toEqual(roverSharesFrom(useAppStore.getState().earthWeights));
    const start=screen.getByRole("button",{name:"Head to explore mission →"});
    await waitFor(()=>expect(start).toBeEnabled());
    fireEvent.click(start);
    await waitFor(()=>expect(screen.getByTestId("globe-stub")).toHaveAttribute("data-mode","mission"));
    expect(screen.getByRole("heading",{name:"Ranked candidates"})).toBeInTheDocument();
    expect(screen.queryByRole("heading",{name:"Mission suitability"})).toBeNull();
    expect(rankCalls).toHaveLength(0);
    const selectedEarth=useAppStore.getState().selectedEarthId;
    expect(selectedEarth).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"View Mars"}));
    await waitFor(()=>expect(rankCalls.length).toBeGreaterThan(0));
    expect(rankCalls[0]).toMatchObject({reference_body:"earth",reference_id:selectedEarth,candidate_body:"mars"});
    expect(useAppStore.getState().selectionBody).toBe("earth");
  });

  it("ranks the Earth candidates against the selected Mars reference, names it in the legend, and a candidate click never rewrites the reference", async () => {
    useAppStore.getState().selectSite("elysium_planitia");
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: "View Earth" }));
    await waitFor(() => expect(rankCalls.length).toBeGreaterThan(0), { timeout: 3000 });
    expect(rankCalls[0]).toMatchObject({ reference_body: "mars", reference_id: "elysium_planitia", candidate_body: "earth" });
    expect(rankCalls[0].client_request_id).toMatch(/^analog-rank-/);
    expect((rankCalls[0].weights as unknown[]).length).toBe(5);
    await waitFor(() => expect(screen.getByTestId("globe-stub")).toHaveTextContent("Earth matches to Elysium Planitia (InSight)"), { timeout: 3000 });
    expect(screen.getByTestId("match-context-line")).toHaveTextContent(/^Earth matches to Elysium Planitia \(InSight\)/);
    await waitFor(() => expect(useAppStore.getState().selectedEarthId).toBe(earthIds[0]));
    const second = earthIds[1];
    const row = await screen.findByRole("button", { name: new RegExp(`^${second}, match rank 2 of ${earthIds.length}, 85% match`) });
    fireEvent.click(row);
    const s = useAppStore.getState();
    expect(s.selectedEarthId).toBe(second);
    expect(s.selectedMarsId).toBe("elysium_planitia");
    expect(s.viewedBody).toBe("earth");
    expect(screen.getByRole("button", { name: new RegExp(`^${second},`) })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "View Mars" }));
    expect(useAppStore.getState().selectedMarsId).toBe("elysium_planitia");
    fireEvent.click(screen.getByRole("button", { name: "View Earth" }));
    await waitFor(() => expect(useAppStore.getState().selectedEarthId).toBe(second));
    act(() => useAppStore.getState().selectLocation("earth", null));
    await waitFor(() => expect(useAppStore.getState().selectedEarthId).toBeNull());
  });
});
