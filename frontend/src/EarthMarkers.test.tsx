// Earth markers only ever render on the Earth globe and Mars markers on the
// Mars globe: the App is mounted with the WebGL viewer stubbed to print the
// body it was given and the ids of the markers it received.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fixture from "@/test/fixtures/api_examples.json";
import catalog from "@/test/fixtures/comparison_catalog.json";
import { useAppStore } from "@/store/useAppStore";

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
  rankCalls = [];
  useAppStore.setState({ weights: {}, defaultWeights: {}, hardConstraints: [], selectedSiteId: null, selectedMarsId: null, selectedEarthId: null, viewedBody: "mars", mapMode: "landing_suitability", followObjective: true, activeTab: "explore", suggestedSelection: null });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/v1/health")) return json({ status: "ok", version: "0.1.0", profile_version: "v1", scoring_spec_version: "landing-v1.0", services: { data: "ok", retrieval: "unavailable", llm: "unconfigured" } });
    if (url.includes("/api/v1/sites?")) return json(sitesFixture);
    if (url.match(/\/api\/v1\/sites\/[^/?]+$/)) return json(fixture.site);
    if (url.endsWith("/comparison/catalog")) return json(catalog);
    if (url.endsWith("/scoring/default-mission")) return json(fixture.default_mission);
    if (url.endsWith("/mission/interpret")) return json({ error: { code: "unavailable", message: "offline in test" } }, 503);
    if (url.endsWith("/scoring/evaluate")) { const body = JSON.parse(String(init?.body)); return json({ ...fixture.evaluate, client_request_id: body.client_request_id }); }
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

    fireEvent.click(screen.getByRole("radio", { name: "Earth" }));
    await waitFor(() => expect(screen.getByTestId("globe-stub")).toHaveAttribute("data-body", "earth"));
    const earthStub = screen.getByTestId("globe-stub");
    await waitFor(() => expect(earthStub).toHaveTextContent("haughton_crater/analog/-"), { timeout: 3000 });
    expect(earthStub).toHaveAttribute("data-mode", "analog");
    // the fixture catalogue carries a subset of the seven live Earth candidates; every one of them, and nothing else, is on the Earth globe
    expect(earthIds.length).toBeGreaterThan(0);
    for (const id of earthIds) expect(earthStub).toHaveTextContent(`${id}/analog/-`);
    for (const s of sitesFixture.sites) expect(earthStub).not.toHaveTextContent(s.id);
    // no reference yet: no ranking request, and the pane offers a Mars reference selector
    expect(rankCalls).toHaveLength(0);
    expect(screen.getByRole("combobox", { name: /Choose a reference location on Mars/ })).toBeInTheDocument();
    expect(screen.queryByTestId("landing-legend")).toBeNull();
  });
  it("ranks the Earth candidates against the selected Mars reference, names it in the legend, and a candidate click never rewrites the reference", async () => {
    useAppStore.getState().selectSite("elysium_planitia");
    renderApp();
    fireEvent.click(await screen.findByRole("radio", { name: "Earth" }));
    await waitFor(() => expect(rankCalls.length).toBeGreaterThan(0), { timeout: 3000 });
    expect(rankCalls[0]).toMatchObject({ reference_body: "mars", reference_id: "elysium_planitia", candidate_body: "earth" });
    expect(rankCalls[0].client_request_id).toMatch(/^analog-rank-/);
    expect((rankCalls[0].weights as unknown[]).length).toBe(5);
    await waitFor(() => expect(screen.getByTestId("globe-stub")).toHaveTextContent("Earth matches to Elysium Planitia (InSight)"), { timeout: 3000 });
    expect(screen.getByTestId("match-context-line")).toHaveTextContent(/^Earth matches to Elysium Planitia \(InSight\) · /);
    const second = earthIds[1];
    const row = await screen.findByRole("button", { name: new RegExp(`^${second}, match rank 2 of ${earthIds.length}, similarity 85`) });
    fireEvent.click(row);
    const s = useAppStore.getState();
    expect(s.selectedEarthId).toBe(second);
    expect(s.selectedMarsId).toBe("elysium_planitia");
    expect(s.viewedBody).toBe("earth");
    expect(screen.getByRole("button", { name: new RegExp(`^${second},`) })).toHaveAttribute("aria-pressed", "true");
    // the strongest match is offered only as a labelled suggestion, never selected
    expect(screen.queryByText("Suggested reference")).toBeNull(); // cleared once the user selected
  });
});
