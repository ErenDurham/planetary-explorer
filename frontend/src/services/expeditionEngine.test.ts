import { afterEach, describe, expect, it, vi } from "vitest";
import { expeditionEngine, type ExpeditionPlanRequest } from "./expeditionEngine";

afterEach(() => vi.unstubAllGlobals());
describe("expedition scientific service", () => {
  it("preserves cancellation so obsolete region requests can be discarded", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    }));
    await expect(expeditionEngine.terrain("mars", "jezero_crater", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("uses the shared API base and passes body/site context without derived client metrics", async () => {
    const result = { body: "moon", site_id: "apollo_15", dem: { available: false } };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(await expeditionEngine.terrain("moon", "apollo_15")).toEqual(result);
    expect(fetch.mock.calls[0][0]).toMatch(/\/api\/v1\/expedition\/terrain\?body=moon&site_id=apollo_15$/);
  });
  it("sends the exact ordered plan and preserves request identity and unavailable metrics", async () => {
    const payload: ExpeditionPlanRequest = { body: "mars", site_id: "jezero_crater", objective: "terrain_survey", optimization: "balanced", start: { lat: 18.4447, lon_east: 77.4508 }, waypoints: [{ lat: 18.65, lon_east: 77.65 }], client_request_id: "plan-1" };
    const response = { client_request_id: "plan-1", data_status: "unavailable", metrics: { total_distance_m: null } };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(await expeditionEngine.plan(payload)).toEqual(response);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(payload);
  });
});
