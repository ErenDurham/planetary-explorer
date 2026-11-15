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
let interpretCalls: Array<{ objective: string; use_llm?: boolean }> = [];

function mockFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/v1/health")) return json(fixture_health);
    if (url.includes("/api/v1/sites?")) return json(fixture_sites);
    if (url.match(/\/api\/v1\/sites\/[^/?]+$/)) return json(fixture.site);
    if (url.endsWith("/research/explain")) return json({site_id:"chryse_planitia", generated_by:"deterministic_fallback", model:null, sections:{}, supporting_evidence:[], citations:[], research_studies:[], limitations:[], generated_at:"2026-11-14T17:00:00Z"});
    if (url.endsWith("/scoring/default-mission")) return json(fixture.default_mission);
    if (url.endsWith("/mission/interpret")) interpretCalls.push(JSON.parse(String(init?.body)));
    if (url.endsWith("/scoring/evaluate")) {
      const body = JSON.parse(String(init?.body));
      evaluateCalls.push(body);
      return json({ ...fixture.evaluate, client_request_id: body.client_request_id });
    }
    return json({ error: { code: "not_found", message: `unmocked ${url}`, details: null } }, 404);
  });
}

const fixture_health = { status: "ok", version: "0.1.0", profile_version: "v1", scoring_spec_version: "landing-v1.0", services: { data: "ok", retrieval: "unavailable", llm: "unconfigured" } };
const fixture_sites = { planet: "mars", sites: fixture.evaluate.results.map(r => ({...fixture.site.site, id: r.site_id, name: r.site_name})), profile_version: "v1" };

async function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Mission Design" }));
  // the tab opens on the chat box; saving a mission brings in the sliders.
  // No priority keyword matches this text, so the seeded shares are kept.
  const box = screen.getByLabelText("Your mission objective");
  fireEvent.change(box, { target: { value: "We want to land on Mars to establish a Research Base." } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(), { timeout: 2000 });
  fireEvent.keyDown(box, { key: "Enter" });
  return view;
}

describe("App", () => {
  beforeEach(() => {
    evaluateCalls = [];
    interpretCalls = [];
    useAppStore.setState({ missionObjective: "Find a safe landing site with reliable solar energy.", missionType: "landing", task: "landing_screening", selectionBody: "mars", missionFocusOverride: null, weights: {}, defaultWeights: {}, hardConstraints: [], selectedSiteId: null, activeTab: "explore", exploreMode: "browse", missionDesigned: false, missionDraftDirty: false });
    mockFetch();
  });
  afterEach(() => vi.restoreAllMocks());

  it("seeds sliders from the default mission, evaluates once, and ranks sites", async () => {
    await renderApp();
    expect(screen.getByText("Planetary Explorer")).toBeInTheDocument();

    // sliders come from GET /scoring/default-mission
    const slider = await screen.findByLabelText("Low slopes share of priorities");
    expect(slider).toHaveValue("27"); // effective allocation, not the old raw weight of 65
    expect(screen.getAllByRole("slider")).toHaveLength(4); // the no-data thermal factor is not shown

    // debounced POST /scoring/evaluate with a client_request_id, result rendered
    await waitFor(() => expect(evaluateCalls.length).toBe(1), { timeout: 2000 });
    expect(evaluateCalls[0].client_request_id).toMatch(/^evaluate-/);
    // the startup default never waits on a language model; the user's own mission asks for it
    expect(interpretCalls.map((c) => c.use_llm)).toEqual([false, true]);
    expect(interpretCalls[1].objective).toBe("We want to land on Mars to establish a Research Base.");
    fireEvent.click(screen.getByRole("button", { name: "Explore" }));
    expect(screen.getByTestId("globe-stub")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Chryse Planitia.*rank 1/ })).toBeInTheDocument();
    expect(screen.queryByText(/Temperature data is unavailable\. Thermal conditions/)).toBeNull();
    expect(screen.getByRole("region", { name: "Scrollable candidates" })).toBeInTheDocument();
    expect(screen.getByTestId("globe-stub")).toHaveTextContent(`${fixture_sites.sites.length} markers`);
  });

  it("hands off the applied mission to its intended planet and blocks unapplied edits", async () => {
    await renderApp();
    const start = await screen.findByRole("button", { name: "Head to explore mission →" });
    await waitFor(() => expect(start).toBeEnabled());
    useAppStore.setState({viewedBody:"earth"});
    fireEvent.click(start);
    expect(useAppStore.getState()).toMatchObject({activeTab: "explore", exploreMode: "browse",viewedBody:"mars",exploreStage:"mission",selectedMarsId:fixture.evaluate.results[0].site_id});
    fireEvent.click(screen.getByRole("button", {name:"Mission Design"}));
    fireEvent.click(screen.getByRole("button", {name:/Edit Mission/}));
    fireEvent.change(screen.getByLabelText("Your mission objective"), {target:{value:"An unapplied objective"}});
    expect(screen.getByRole("button", {name:"Head to explore mission →"})).toBeDisabled();
  });

  it("keeps the Mission Design tab to the chat box alone until a mission is saved", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><App /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Mission Design" }));
    expect(screen.getByLabelText("Your mission objective")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Head to explore mission →" })).toBeNull();
    expect(document.querySelector("div.absolute.inset-0.z-\\[60\\]")).toHaveClass("hidden"); // Astro overlay
  });

  it("re-evaluates once after a burst of slider changes and shows the selected site profile", async () => {
    await renderApp();
    const slider = await screen.findByLabelText("Low slopes share of priorities");
    await waitFor(() => expect(evaluateCalls.length).toBe(1), { timeout: 2000 });

    // a drag: several changes inside the debounce window -> one request
    fireEvent.change(slider, { target: { value: "40" } });
    fireEvent.change(slider, { target: { value: "45" } });
    fireEvent.change(slider, { target: { value: "50" } });
    await waitFor(() => expect(evaluateCalls.length).toBe(2), { timeout: 2000 });
    await new Promise((r) => setTimeout(r, 250));
    expect(evaluateCalls.length).toBe(2);
    expect(evaluateCalls[1].client_request_id).not.toBe(evaluateCalls[0].client_request_id);

    // Selecting a site loads its profile in the restored sidebar.
    fireEvent.click(screen.getByRole("button", { name: "Explore" }));
    fireEvent.click(screen.getByRole("button", { name: /Chryse Planitia/ }));
    const measurements = await screen.findByText("All environmental measurements and sources");
    fireEvent.click(measurements);
    expect(await screen.findByRole("heading", { name: "Environmental profile" })).toBeInTheDocument();
    expect(screen.getByTestId("metric-surface_temperature_mean_c")).toHaveTextContent("No data");
    expect(screen.getByRole("heading", { name: "Mission suitability" })).toBeInTheDocument();
    const selectedSite = useAppStore.getState().selectedSiteId;
    fireEvent.click(screen.getByRole("button", {name:"Research"}));
    expect(await screen.findByRole("heading", {name:"Research"})).toBeInTheDocument();
    expect(screen.getByLabelText("Mars site")).toHaveValue(selectedSite);
    expect(useAppStore.getState().selectedSiteId).toBe(selectedSite);
    fireEvent.click(screen.getByRole("button", {name:"Explore"}));
    expect(await screen.findByRole("heading", {name:"Mission suitability"})).toBeInTheDocument();
  });
});
