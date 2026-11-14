import { describe, expect, it } from "vitest";
import { createStaleGuard } from "./staleGuard";

describe("stale-response guard", () => {
  it("accepts only the latest issued id", () => {
    const g = createStaleGuard("t");
    const a = g.issue();
    const b = g.issue();
    expect(g.accept(a)).toBe(false);
    expect(g.accept(b)).toBe(true);
    expect(g.latest).toBe(b);
  });
  it("rejects null, undefined and unknown ids", () => {
    const g = createStaleGuard("t");
    expect(g.accept(null)).toBe(false);
    g.issue();
    expect(g.accept(undefined)).toBe(false);
    expect(g.accept("t-nope-1")).toBe(false);
  });
  it("drops an out-of-order older response after a newer one was issued", async () => {
    const g = createStaleGuard("t");
    const applied: string[] = [];
    const respond = (id: string, delay: number) =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          if (g.accept(id)) applied.push(id);
          resolve();
        }, delay),
      );
    const first = g.issue(); // slow
    const second = g.issue(); // fast
    await Promise.all([respond(first, 30), respond(second, 5)]);
    expect(applied).toEqual([second]);
  });
  it("issues unique ids", () => {
    const g = createStaleGuard("t");
    const ids = new Set(Array.from({ length: 50 }, () => g.issue()));
    expect(ids.size).toBe(50);
  });
});
