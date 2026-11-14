import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.restoreAllMocks());

describe("api client", () => {
  it("parses the error envelope into an ApiError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ error: { code: "not_found", message: "site 'nope' not found", details: null } }, 404));
    await expect(api.site("nope")).rejects.toMatchObject({ name: "ApiError", code: "not_found", status: 404, message: "site 'nope' not found" });
  });
  it("maps a network failure to code 'unavailable'", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const err = (await api.health().catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("unavailable");
    expect(err.isUnavailable).toBe(true);
  });
  it("posts JSON with the client_request_id and returns the typed body", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ results: [], warnings: [], client_request_id: "r-1", mission: {}, scoring_spec_version: "x", profile_version: "v1" }));
    const res = await api.evaluate({ planet: "mars", mission: { mission_phase: "landing", criteria: [{ criterion_id: "a", weight: 1 }], missing_data_policy: "common_feature_set" }, client_request_id: "r-1" });
    expect(res.client_request_id).toBe("r-1");
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/v1\/scoring\/evaluate$/);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body)).client_request_id).toBe("r-1");
  });
});
