// The adapter maps "not deployed" to an unavailable state and passes a
// service response through untouched.
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpExpeditionService, EXPEDITION_PATHS } from "./httpService";
import { ExpeditionRequestRejected, ExpeditionServiceUnavailable } from "./types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
afterEach(() => vi.restoreAllMocks());

describe("HttpExpeditionService", () => {
  it("treats a 404 as the service being unavailable, not an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: { code: "not_found", message: "no" } }, 404));
    await expect(new HttpExpeditionService().capabilities()).rejects.toBeInstanceOf(ExpeditionServiceUnavailable);
  });
  it("surfaces a rejection with the service's own code and message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: { code: "infeasible_inputs", message: "max slope below terrain minimum" } }, 422));
    const e = await new HttpExpeditionService().plan({} as never).catch(x => x);
    expect(e).toBeInstanceOf(ExpeditionRequestRejected);
    expect(e.code).toBe("infeasible_inputs");
    expect(e.message).toMatch(/max slope/);
  });
  it("posts the plan request and returns the response verbatim", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ plan_id: "p1", metrics: { total_distance_m: 1234 } }));
    const res = await new HttpExpeditionService().plan({ body: "mars", site_id: "jezero_crater", client_request_id: "x" } as never);
    expect(res).toEqual({ plan_id: "p1", metrics: { total_distance_m: 1234 } });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain(EXPEDITION_PATHS.plan);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ body: "mars", site_id: "jezero_crater", client_request_id: "x" });
  });
  it("reports a network failure as unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(new HttpExpeditionService().terrain("mars", "jezero_crater")).rejects.toBeInstanceOf(ExpeditionServiceUnavailable);
  });
});
