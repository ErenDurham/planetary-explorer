import { describe, expect, it } from "vitest";
import { ROYGBIV_STOPS, SINGLE_HUE_STOPS, assignRankPositions, missionRankPosition, rankColor, rankPosition } from "./rankColor";

function lum(hex: string) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

describe("rankColor", () => {
  it("maps the endpoints to red and violet for every pool size >= 2", () => {
    for (const n of [2, 3, 7, 8, 20, 100]) {
      const pos = assignRankPositions(n);
      expect(pos).toHaveLength(n);
      expect(rankColor(pos[0])).toBe(ROYGBIV_STOPS[0]);
      expect(rankColor(pos[n - 1])).toBe(ROYGBIV_STOPS[6]);
    }
  });
  it("gives a single ranked match red, and an empty pool nothing", () => {
    expect(assignRankPositions(1)).toEqual([0]);
    expect(rankColor(0)).toBe(ROYGBIV_STOPS[0]);
    expect(assignRankPositions(0)).toEqual([]);
    expect(rankPosition(1, 0)).toBeNull();
  });
  it("hits every one of the seven stops exactly for a pool of seven", () => {
    const pos = assignRankPositions(7);
    pos.forEach((p, i) => expect(rankColor(p)).toBe(ROYGBIV_STOPS[i]));
  });
  it("is strictly monotonic in position (no wraparound) for pools of 8 and 20", () => {
    for (const n of [8, 20]) {
      const pos = assignRankPositions(n);
      for (let i = 1; i < n; i++) expect(pos[i]).toBeGreaterThan(pos[i - 1]);
      expect(pos[0]).toBe(0);
      expect(pos[n - 1]).toBe(1);
      // colours never return to the first stop after leaving it
      const colours = pos.map((p) => rankColor(p));
      expect(colours.filter((c) => c === ROYGBIV_STOPS[0])).toHaveLength(1);
      expect(colours.filter((c) => c === ROYGBIV_STOPS[6])).toHaveLength(1);
      expect(new Set(colours).size).toBe(n);
    }
  });
  it("clamps out-of-range ranks rather than wrapping", () => {
    expect(rankPosition(9, 8)).toBe(1);
    expect(rankColor(1.7)).toBe(ROYGBIV_STOPS[6]);
    expect(rankColor(-0.5)).toBe(ROYGBIV_STOPS[0]);
  });
  it("returns null for unrankable candidates so they are excluded from the scale", () => {
    expect(rankColor(null)).toBeNull();
    expect(rankColor(undefined)).toBeNull();
    expect(rankColor(Number.NaN)).toBeNull();
    expect(rankPosition(null, 7)).toBeNull();
  });
  it("single-hue palette is monotonic in lightness and shares the endpoints", () => {
    const pos = assignRankPositions(7);
    const sums = pos.map((p) => lum(rankColor(p, "single_hue")!).reduce((a, b) => a + b, 0));
    for (let i = 1; i < sums.length; i++) expect(sums[i]).toBeLessThan(sums[i - 1]);
    expect(rankColor(0, "single_hue")).toBe(SINGLE_HUE_STOPS[0]);
    expect(rankColor(1, "single_hue")).toBe(SINGLE_HUE_STOPS[6]);
  });
  it("interpolates between stops for intermediate positions", () => {
    const c = rankColor(1 / 12); // halfway between red and orange
    expect(c).not.toBe(ROYGBIV_STOPS[0]);
    expect(c).not.toBe(ROYGBIV_STOPS[1]);
    expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
});

it("uses full-pool mission ranks for ROYGBIV endpoints and shared ties",()=>{
 expect(rankColor(missionRankPosition(1,[1,2,3,4,5,6,7,8]))).toBe(ROYGBIV_STOPS[0]);
 expect(rankColor(missionRankPosition(8,[1,2,3,4,5,6,7,8]))).toBe(ROYGBIV_STOPS[6]);
 expect(rankColor(missionRankPosition(3,[1,1,3,3]))).toBe(ROYGBIV_STOPS[6]);
 expect(missionRankPosition(null,[1,2])).toBeNull();
});
