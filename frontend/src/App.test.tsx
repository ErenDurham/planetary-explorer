// Integration smoke test: mounts the whole App with the WebGL canvas stubbed
// (jsdom has no WebGL) and fetch mocked from docs/api_examples.json fixtures.
// Exercises the store, the TanStack hooks, the debounced evaluate call with its
// client_request_id, and the three-column layout.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fixture from "@/test/fixtures/api_examples.json";
import { useAppStore } from "@/store/useAppStore";

vi.mock("@/components/globe/PlanetViewer", () => ({
  PlanetViewer: (props: { markers: Array<{ id: string }>; statusLine?: string }) => (
    <div data-testid="globe-stub">
      globe: {props.markers.length} markers · {props.statusLine}
    </div>
  ),
}));

import App from "./App";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let evaluateCalls: Array<{ client_request_id: string | null | undefined }> = [];

function mockFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/v1/health")) return json(fixture_health);
    if (url.includes("/api/v1/sites?")) return json(fixture_sites);
    if (url.match(/\/api\/v1\/sites\/[^/?]+$/)) return json(fixture.site);
    if (url.endsWith("/scoring/default-mission")) return json(fixture.default_mission);
    if (url.endsWith("/scoring/evaluate")) {
      const body = JSON.parse(String(init?.body));
      evaluateCalls.push(body);
      return json({ ...fixture.evaluate, client_request_id: body.client_request_id });
    }
    return json({ error: { code: "not_found", message: `unmocked ${url}`, details: null } }, 404);
  });
}

const fixture_health = { status: "ok", version: "0.1.0", profile_version: "v1", scoring_spec_version: "landing-v1.0", services: { data: "ok", retrieval: "unavailable", llm: "unconfigured" } };
const fixture_sites = { planet: "mars", sites: [fixture.site.site], profile_version: "v1" };

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App", () => {
  beforeEach(() => {
    evaluateCalls = [];
    useAppStore.setState({ weights: {}, defaultWeights: {}, hardConstraints: [], selectedSiteId: null, activeTab: "explore" });
    mockFetch();
  });
  afterEach(() => vi.restoreAllMocks());

  it("seeds sliders from the default mission, evaluates once, and ranks sites", async () => {
    renderApp();
    expect(screen.getByText("Planetary Explorer")).toBeInTheDocument();
    expect(screen.getByTestId("globe-stub")).toBeInTheDocument();

    // sliders come from GET /scoring/default-mission
    const slider = await screen.findByLabelText("Terrain safety (regional slope) weight");
    expect(slider).toHaveValue("35");
    expect(screen.getAllByRole("slider")).toHaveLength(5);

    // debounced POST /scoring/evaluate with a client_request_id, result rendered
    await waitFor(() => expect(evaluateCalls.length).toBe(1), { timeout: 2000 });
    expect(evaluateCalls[0].client_request_id).toMatch(/^evaluate-/);
    expect(await screen.findByRole("button", { name: /Chryse Planitia.*rank 1/ })).toBeInTheDocument();
    expect(screen.getByText(/thermal_conditions.*excluded/)).toBeInTheDocument();
    expect(screen.getByTestId("globe-stub")).toHaveTextContent("1 markers");
  });

  it("re-evaluates once after a burst of slider changes and shows the selected site profile", async () => {
    renderApp();
    const slider = await screen.findByLabelText("Terrain safety (regional slope) weight");
    await waitFor(() => expect(evaluateCalls.length).toBe(1), { timeout: 2000 });

    // a drag: several changes inside the debounce window -> one request
    fireEvent.change(slider, { target: { value: "40" } });
    fireEvent.change(slider, { target: { value: "45" } });
    fireEvent.change(slider, { target: { value: "50" } });
    await waitFor(() => expect(evaluateCalls.length).toBe(2), { timeout: 2000 });
    await new Promise((r) => setTimeout(r, 250));
    expect(evaluateCalls.length).toBe(2);
    expect(evaluateCalls[1].client_request_id).not.toBe(evaluateCalls[0].client_request_id);

    // selecting a site loads its profile into the right sidebar
    fireEvent.click(screen.getByRole("button", { name: /Chryse Planitia/ }));
    expect(await screen.findByRole("heading", { name: "Environmental profile" })).toBeInTheDocument();
    expect(screen.getByTestId("metric-surface_temperature_mean_c")).toHaveTextContent("No data");
    expect(screen.getByRole("heading", { name: "Landing suitability" })).toBeInTheDocument();
  });
});
