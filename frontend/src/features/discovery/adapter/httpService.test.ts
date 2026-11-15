import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpDiscoveryService } from "./httpService";
import { DiscoveryNotFound, DiscoveryRequestRejected, DiscoveryUnavailable } from "./types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
afterEach(() => vi.restoreAllMocks());

describe("HttpDiscoveryService", () => {
  it("passes capabilities through the shared client untouched", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ engine_version: "discovery-v1", state: "unavailable", runs: [] }));
    const caps = await new HttpDiscoveryService().capabilities();
    expect(caps.state).toBe("unavailable");
    expect(String(spy.mock.calls[0][0])).toMatch(/\/api\/v1\/discovery\/capabilities$/);
  });
  it("maps 503 data_unavailable and network failure to unavailable, 404 to not found, 422 to rejected with the detail message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ error: { code: "data_unavailable", message: "run artifact corrupt" } }, 503));
    await expect(new HttpDiscoveryService().export("r")).rejects.toBeInstanceOf(DiscoveryUnavailable);
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(new HttpDiscoveryService().capabilities()).rejects.toBeInstanceOf(DiscoveryUnavailable);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ error: { code: "not_found", message: "unknown run" } }, 404));
    await expect(new HttpDiscoveryService().detail("r", "c")).rejects.toBeInstanceOf(DiscoveryNotFound);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ error: { code: "validation_error", message: "request failed schema validation", details: [{ msg: "Value error, weights must have a positive total" }] } }, 422));
    const e = await new HttpDiscoveryService().rank({ run_id: "r", reference_id: "jezero_crater", top_k: 5 }).catch(x => x);
    expect(e).toBeInstanceOf(DiscoveryRequestRejected);
    expect(e.message).toMatch(/positive total/);
  });
});
