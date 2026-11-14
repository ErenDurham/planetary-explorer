import { describe, expect, it } from "vitest";
import { activeTotal, largestRemainder, setShare, shareDeltas, sharesEqual, toShares } from "./allocation";

const EX = ["thermal_conditions"];
const sum = (s: Record<string, number>) => Object.values(s).reduce((a, b) => a + b, 0);

describe("largestRemainder", () => {
  it("rounds to integers that hit the total exactly, ties to the later factor", () => {
    expect(largestRemainder([10, 10, 10])).toEqual([33, 33, 34]);
    expect(largestRemainder([1, 1, 1, 1, 1, 1])).toEqual([16, 16, 17, 17, 17, 17]);
    expect(largestRemainder([65, 45, 55, 75])).toEqual([27, 19, 23, 31]);
    expect(largestRemainder([3, 1], 7)).toEqual([5, 2]);
  });
  it("is deterministic and returns zeros for an empty basis", () => {
    const a = largestRemainder([7, 11, 13, 17]);
    const b = largestRemainder([7, 11, 13, 17]);
    expect(a).toEqual(b);
    expect(largestRemainder([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("toShares", () => {
  it("normalises raw weights to shares summing to 100 with excluded factors at 0", () => {
    const s = toShares({ terrain_safety: 65, elevation_suitability: 45, surface_roughness: 55, thermal_conditions: 10, solar_illumination: 75 }, EX);
    expect(s).toEqual({ terrain_safety: 27, elevation_suitability: 19, surface_roughness: 23, thermal_conditions: 0, solar_illumination: 31 });
    expect(sum(s)).toBe(100);
    expect(activeTotal(s, EX)).toBe(100);
  });
  it("rounds three equal factors to 33/33/34", () => {
    expect(toShares({ a: 20, b: 20, c: 20 })).toEqual({ a: 33, b: 33, c: 34 });
  });
  it("splits equally when every active weight is zero, so the state is never all-zero", () => {
    expect(toShares({ a: 0, b: 0, c: 0, t: 50 }, ["t"])).toEqual({ a: 33, b: 33, c: 34, t: 0 });
  });
  it("is idempotent on a share record", () => {
    const s = toShares({ a: 40, b: 35, c: 25 });
    expect(toShares(s)).toEqual(s);
  });
});

describe("setShare", () => {
  const start = { terrain_safety: 27, elevation_suitability: 19, surface_roughness: 23, thermal_conditions: 0, solar_illumination: 31 };

  it("keeps the changed factor exactly and rescales the others proportionally to 100", () => {
    const s = setShare(start, "terrain_safety", 10, EX);
    expect(s.terrain_safety).toBe(10);
    expect(s.thermal_conditions).toBe(0);
    expect(sum(s)).toBe(100);
    // others were 19/23/31 (sum 73) sharing 90: 23.42 / 28.36 / 38.22 -> the largest remainder (.42) takes the spare point
    expect(s).toEqual({ terrain_safety: 10, elevation_suitability: 24, surface_roughness: 28, thermal_conditions: 0, solar_illumination: 38 });
  });
  it("gives a raised factor its share and shrinks the rest in proportion", () => {
    const s = setShare(start, "solar_illumination", 70, EX);
    expect(s.solar_illumination).toBe(70);
    expect(sum(s)).toBe(100);
    expect(s.terrain_safety).toBeGreaterThan(s.elevation_suitability);
    expect(s.surface_roughness).toBeGreaterThan(s.elevation_suitability);
  });
  it("splits the remainder equally when the other active factors are all zero", () => {
    const s = setShare({ a: 100, b: 0, c: 0, d: 0, t: 0 }, "a", 40, ["t"]);
    expect(s).toEqual({ a: 40, b: 20, c: 20, d: 20, t: 0 });
  });
  it("clamps the value to 0..100 and lets one factor take everything", () => {
    expect(setShare(start, "terrain_safety", 140, EX)).toEqual({ terrain_safety: 100, elevation_suitability: 0, surface_roughness: 0, thermal_conditions: 0, solar_illumination: 0 });
    expect(sum(setShare(start, "terrain_safety", -5, EX))).toBe(100);
    expect(setShare(start, "terrain_safety", -5, EX).terrain_safety).toBe(0);
  });
  it("cannot reach the all-zero state: lowering the only non-zero factor to 0 hands its share to the others", () => {
    const only = { a: 100, b: 0, c: 0, t: 0 };
    const s = setShare(only, "a", 0, ["t"]);
    expect(s).toEqual({ a: 0, b: 50, c: 50, t: 0 });
    expect(activeTotal(s, ["t"])).toBe(100);
    // and every reachable state from any start keeps the total at 100
    for (const v of [0, 1, 50, 99, 100]) expect(activeTotal(setShare(s, "b", v, ["t"]), ["t"])).toBe(100);
  });
  it("ignores an excluded factor and leaves excluded factors at 0", () => {
    expect(setShare(start, "thermal_conditions", 50, EX)).toBe(start);
    const s = setShare({ ...start, thermal_conditions: 9 }, "terrain_safety", 30, EX);
    expect(s.thermal_conditions).toBe(0);
    expect(activeTotal(s, EX)).toBe(100);
  });
  it("is deterministic across repeated calls", () => {
    expect(setShare(start, "surface_roughness", 50, EX)).toEqual(setShare(start, "surface_roughness", 50, EX));
  });
});

describe("sharesEqual / shareDeltas", () => {
  it("compares rounded shares and lists non-zero deltas largest first", () => {
    expect(sharesEqual({ a: 50, b: 50 }, { a: 50, b: 50 })).toBe(true);
    expect(sharesEqual({ a: 50, b: 50 }, { a: 49, b: 51 })).toBe(false);
    expect(sharesEqual({ a: 50 }, { a: 50, b: 0 })).toBe(false);
    expect(shareDeltas({ a: 62, b: 30, c: 8 }, { a: 50, b: 38, c: 12 })).toEqual([{ id: "a", delta: 12 }, { id: "b", delta: -8 }, { id: "c", delta: -4 }]);
  });
});
