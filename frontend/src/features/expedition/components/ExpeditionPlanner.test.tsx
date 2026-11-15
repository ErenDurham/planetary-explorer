// End-to-end flow with a fake service injected through the adapter: open from
// the Research page, keep the region, choose an objective, lay out a waypoint,
// calculate, read the service's metrics and the report. Also the unavailable
// path: the map and waypoints still work, Calculate stays disabled, and no
// number is shown anywhere.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import imagery from "@/test/fixtures/imagery_jezero.json";
import fixture from "@/test/fixtures/api_examples.json";
import { ResearchView } from "@/components/layout/ResearchView";
import { useAppStore } from "@/store/useAppStore";
import { setExpeditionService, ExpeditionServiceUnavailable, type ExpeditionPlannerService, type PlanRequest, type PlanResponse, type ServiceCapabilities, type TerrainContext } from "../adapter";
import { useExpeditionStore } from "../store/useExpeditionStore";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const site = { id: "jezero_crater", planet: "mars", name: "Jezero Crater", region: "Nili Fossae / Isidis basin rim", lat: 18.4447, lon_east: 77.4508, description: "An ancient lake basin.", heritage: "", tags_terrain: [], tags_mineralogy: [], water_ice_evidence: "", coordinate_sources: [], composition_sources: [] } as never;

const rover = { profile_id: null, max_slope_deg: 20, nominal_speed_m_s: 0.1, battery_capacity_wh: 1000, drive_hours_per_sol: 4, mass_kg: 500, rolling_resistance: 0.08, drive_efficiency: 0.3, hotel_power_w: 50 };
const capabilities: ServiceCapabilities = { engine_version: "fake-0.1", bodies: ["mars"], objectives: ["terrain_survey", "geological_sampling", "research_traverse"], optimization_preferences: ["balanced", "lowest_risk"], rover_profiles: [{ profile_id: "test_rover", label: "Test rover", description: "A fake profile for tests.", parameters: rover }], regions: [{ body: "mars", site_id: "jezero_crater", name: "Jezero Crater", terrain_available: true, note: "" }], notes: [] };
const dem = { available: true, dataset: { name: "Fake DEM", source: "test", url: null, license: null, resolution_m: 20, note: null }, note: "Regional route grid; inputs snap to cell centers.", cell_height_m: 3704, longitude_convention: "east_-180_180", crs: "test" };
const terrain: TerrainContext = { body: "mars", site_id: "jezero_crater", start: { lat: 18.4447, lon_east: 77.4508 }, dem, research_targets: [{ target_id: "delta", name: "Delta front", lat: 18.5, lon_east: 77.4, kind: "outcrop", description: "Western delta.", source: "test", priority: 1 }], routing_bounds: null, notes: [] };
function planFor(req: PlanRequest): PlanResponse {
  const wps = req.waypoints ?? []; const first = wps[0] ?? req.start;
  return { plan_id: `plan-${wps.length}`, client_request_id: req.client_request_id, body: "mars", site_id: req.site_id, status: "ok", data_status: "limited", objective: req.objective,
    route: [{ segment_id: "s1", from: req.start, to: first, polyline: [req.start, first], distance_m: 4321, risk: "moderate", max_slope_deg: 7.5, note: null, elevations_m: [-2600, -2550], edge_slopes_deg: [7.5], energy_wh: 876, elevation_gain_m: 55, elevation_loss_m: 40 }],
    metrics: { total_distance_m: 4321 + wps.length, energy_wh: 876, elevation_gain_m: 55, elevation_loss_m: 40, slope_mean_deg: 3.2, slope_max_deg: 7.5, slope_p95_deg: 6.1, traverse_time_hours: 12, driving_sols: 3, targets_reached: req.target_ids ?? [], targets_unreached: [] },
    feasibility: { verdict: "marginal", summary: "Within battery margin on the test model.", reasons: ["One leg exceeds 7 degrees."] }, warnings: [{ severity: "warning", message: "Steep leg near the delta front.", segment_id: "s1" }],
    interpretation: { text: "The traverse crosses the delta's distal deposits.", generated_by: "rule_based", model: null }, assumptions: ["Nominal rover speed held constant."], limitations: ["Terrain below the DEM resolution is unassessed."], datasets: [{ name: "Fake DEM", source: "test", url: null, license: null, resolution_m: 20, note: null }],
    terrain, constraints: rover, stops: [{ stop_id: "start", requested: req.start, snapped: { lat: 18.46875, lon_east: 77.46875 }, offset_m: 1746, visited: true }, ...wps.map((p, i) => ({ stop_id: `waypoint-${i + 1}`, requested: p, snapped: p, offset_m: 102, visited: true }))],
    visited_targets: (req.target_ids ?? []).map(id => ({ target_id: id, name: "Delta front", coordinate_status: "verified" as const, visited: true })), engine_version: "fake-0.1", computed_at: "2026-11-14T20:00:00Z" };
}
const connected: ExpeditionPlannerService = { capabilities: async () => capabilities, terrain: async () => terrain, plan: async (req) => planFor(req) };
const unavailable: ExpeditionPlannerService = { capabilities: async () => { throw new ExpeditionServiceUnavailable("not deployed"); }, terrain: async () => { throw new ExpeditionServiceUnavailable("not deployed"); }, plan: async () => { throw new ExpeditionServiceUnavailable("not deployed"); } };

function mockFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/sites/jezero_crater/imagery")) return json(imagery);
    if (url.match(/\/api\/v1\/sites\/jezero_crater$/)) return json({ ...fixture.site, site: { ...fixture.site.site, id: "jezero_crater" } });
    if (url.endsWith("/research/explain")) return json({ site_id: "jezero_crater", generated_by: "deterministic_fallback", model: null, sections: {}, supporting_evidence: [], citations: [], research_studies: [{ kind: "proposed_study", title: "Delta stratigraphy", research_question: "How were the deltaic beds laid down?", method: "m", why_here: "w", motivating_citation_ids: [], cannot_infer: "c" }], limitations: [], generated_at: "2026-11-14T17:00:00Z" });
    return json({ error: { code: "not_found", message: `unmocked ${url}`, details: null } }, 404);
  });
}

function renderResearch() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ResearchView sites={[site]} selectedId="jezero_crater" onSelect={() => {}} mission={null} /></QueryClientProvider>);
}

function rect(el: HTMLElement) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 800, height: 520, right: 800, bottom: 520, x: 0, y: 0, toJSON: () => ({}) });
}

describe("Expedition Planner", () => {
  beforeEach(() => {
    useExpeditionStore.setState({ open: false, stage: "intro", context: null, workspaces: {} });
    useAppStore.setState({ appliedObjective: "", missionObjective: "Find a safe landing site." });
    mockFetch();
  });
  afterEach(() => vi.restoreAllMocks());

  it("opens from the Research page, keeps the region, and plans a route with the service's numbers", async () => {
    setExpeditionService(connected);
    renderResearch();
    fireEvent.click(await screen.findByRole("button", { name: "Plan an Expedition" }));
    const planner = await screen.findByTestId("expedition-planner");
    expect(within(planner).getByRole("heading", { name: "Expedition Planner" })).toBeInTheDocument();
    expect(planner).toHaveTextContent("Jezero Crater");
    expect(planner).toHaveTextContent("Mars");
    expect(await within(planner).findByText("Service connected")).toBeInTheDocument();
    // intro: research opportunities and terrain availability
    expect(await within(planner).findByText("Delta stratigraphy")).toBeInTheDocument();
    expect(await within(planner).findByText(/2 verified orbital mosaics/)).toBeInTheDocument();
    expect(await within(planner).findByText(/Elevation data available: Fake DEM/)).toBeInTheDocument();
    fireEvent.click(within(planner).getByRole("button", { name: /Choose a mission objective/ }));
    // objective cards
    const group = within(planner).getByRole("radiogroup", { name: "Mission objective" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    fireEvent.click(within(group).getByRole("radio", { name: /Geological Sampling/ }));
    // workspace: nothing numeric before a plan
    const metrics = await within(planner).findByTestId("metrics-panel");
    expect(metrics).toHaveTextContent(/No route has been calculated yet/);
    expect(metrics).not.toHaveTextContent(/\d+ m\b/);
    // the objective seeded its optimisation preference
    expect(within(planner).getByRole("radio", { name: /Lowest terrain risk/ })).toHaveAttribute("aria-checked", "true");
    // rover profile from the service
    fireEvent.change(within(planner).getByRole("combobox", { name: "Rover profile" }), { target: { value: "test_rover" } });
    expect(within(planner).getByLabelText(/Maximum traversable slope/)).toHaveValue(20);
    // research target from the service, and a waypoint from a click
    fireEvent.click(within(planner).getByRole("checkbox", { name: /Include research target Delta front/ }));
    const frame = within(planner).getByTestId("terrain-frame");
    rect(frame);
    fireEvent.pointerDown(frame, { button: 0, clientX: 400, clientY: 260 });
    fireEvent.pointerUp(frame, { button: 0, clientX: 400, clientY: 260 });
    expect(within(planner).getByRole("button", { name: /^Waypoint 1,/ })).toBeInTheDocument();
    expect(within(planner).getByText("Expedition stops · 1")).toBeInTheDocument();
    // calculate
    const calc = within(planner).getByRole("button", { name: "Calculate route" });
    expect(calc).toBeEnabled();
    fireEvent.click(calc);
    await waitFor(() => expect(metrics).toHaveTextContent("4,322 m"));
    expect(metrics).toHaveTextContent("876 Wh");
    expect(metrics).toHaveTextContent("Marginal");
    expect(metrics).toHaveTextContent("1 reached");
    expect(within(planner).getByTestId("route-segment-moderate")).toBeInTheDocument();
    expect(within(planner).getByText("Steep leg near the delta front.")).toBeInTheDocument();
    expect(metrics).toHaveTextContent("3 sols");
    expect(within(planner).getByTestId("data-status")).toHaveTextContent(/Terrain data limited\..*snap to cell centers.*about 3\.7 km/);
    expect(within(planner).getAllByTestId("snapped-stop").length).toBeGreaterThanOrEqual(2);
    expect(within(planner).getByText(/snapped 1\.7 km to a grid cell centre/)).toBeInTheDocument();
    // recalculate after a change, then compare in the report
    fireEvent.pointerDown(frame, { button: 0, clientX: 300, clientY: 200 });
    fireEvent.pointerUp(frame, { button: 0, clientX: 300, clientY: 200 });
    fireEvent.click(within(planner).getByRole("button", { name: "Recalculate route" }));
    await waitFor(() => expect(metrics).toHaveTextContent("4,323 m"));
    expect(within(planner).getByText(/Route 2 of 2 this session/)).toBeInTheDocument();
    fireEvent.click(within(planner).getAllByRole("button", { name: /Mission report/ })[0]);
    const report = await within(planner).findByRole("heading", { name: /Geological Sampling at Jezero Crater/ });
    expect(report).toBeInTheDocument();
    expect(within(planner).getByText("The traverse crosses the delta's distal deposits.")).toBeInTheDocument();
    expect(within(planner).getByText("Rule based")).toBeInTheDocument();
    expect(within(planner).getByText("Terrain below the DEM resolution is unassessed.")).toBeInTheDocument();
    expect(within(planner).getByText(/Basemap · CTX mosaic/)).toBeInTheDocument();
    expect(within(planner).getByText(/Delta front · reached · verified coordinate/)).toBeInTheDocument();
    expect(within(planner).getByRole("columnheader", { name: "Snapped to" })).toBeInTheDocument();
    const table = within(planner).getAllByRole("table").find(t => /Route 2/.test(t.textContent ?? ""))!;
    expect(table).toHaveTextContent("Route 2");
    expect(table).toHaveTextContent("Route 1");
    expect(table).toHaveTextContent("+1 m");
    // back to planning keeps the work
    fireEvent.click(within(planner).getByRole("button", { name: /Return to planning/ }));
    expect(within(planner).getByText("Expedition stops · 2")).toBeInTheDocument();
    // back to research prospects restores the digest
    fireEvent.click(within(planner).getByRole("button", { name: /Back to research prospects/ }));
    expect(await screen.findByRole("button", { name: "Plan an Expedition" })).toBeInTheDocument();
  });

  it("keeps the map usable and every metric absent when the service is not connected", async () => {
    setExpeditionService(unavailable);
    useExpeditionStore.getState().openPlanner({ body: "mars", siteId: "jezero_crater" });
    renderResearch();
    const planner = await screen.findByTestId("expedition-planner");
    expect(await within(planner).findByText("Service not connected")).toBeInTheDocument();
    expect(within(planner).getByText(/Not connected\./)).toBeInTheDocument();
    fireEvent.click(within(planner).getByRole("button", { name: /Choose a mission objective/ }));
    fireEvent.click(within(planner).getByRole("radio", { name: /Terrain Survey/ }));
    const frame = await within(planner).findByTestId("terrain-frame");
    rect(frame);
    fireEvent.pointerDown(frame, { button: 0, clientX: 400, clientY: 260 });
    fireEvent.pointerUp(frame, { button: 0, clientX: 400, clientY: 260 });
    expect(within(planner).getByRole("button", { name: /^Waypoint 1,/ })).toBeInTheDocument();
    const calc = within(planner).getByRole("button", { name: "Calculate route" });
    expect(calc).toBeDisabled();
    expect(within(planner).getByText(/the expedition service to be connected/)).toBeInTheDocument();
    const metrics = within(planner).getByTestId("metrics-panel");
    expect(metrics).toHaveTextContent(/once the expedition service is connected/);
    expect(metrics).not.toHaveTextContent(/\d/);
    expect(within(planner).getByText(/Rover profiles are defined by the expedition service/)).toBeInTheDocument();
    expect(within(planner).getByText(/research targets and routing terrain are unavailable/)).toBeInTheDocument();
  });
});
