import { describe, expect, it } from "vitest";
import { INELIGIBLE_COLOR, INSUFFICIENT_COLOR, UNSCORED_COLOR, markerAppearance, scoreToColor } from "./colors";

const hex = /^#[0-9a-f]{6}$/;
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

describe("scoreToColor", () => {
  it("returns valid hex for the whole range and clamps outside it", () => {
    for (const s of [-10, 0, 12.5, 50, 99.9, 100, 140]) expect(scoreToColor(s)).toMatch(hex);
    expect(scoreToColor(-10)).toBe(scoreToColor(0));
    expect(scoreToColor(140)).toBe(scoreToColor(100));
  });
  it("is monotonic: higher scores are brighter and more amber", () => {
    const lum = (h: string) => {
      const [r, g, b] = rgb(h);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    let prev = -1;
    for (let s = 0; s <= 100; s += 5) {
      const l = lum(scoreToColor(s));
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
    expect(scoreToColor(0)).toBe("#6b3a33");
    expect(scoreToColor(100)).toBe("#f0a03c");
  });
});

describe("markerAppearance", () => {
  it("maps statuses to distinct styles", () => {
    expect(markerAppearance("ok", 80)).toEqual({ color: scoreToColor(80), style: "scored" });
    expect(markerAppearance("ineligible", 90)).toEqual({ color: INELIGIBLE_COLOR, style: "ineligible" });
    expect(markerAppearance("insufficient_data", null)).toEqual({ color: INSUFFICIENT_COLOR, style: "insufficient_data" });
    expect(markerAppearance(null, null)).toEqual({ color: UNSCORED_COLOR, style: "unscored" });
    expect(markerAppearance("ok", null).style).toBe("unscored");
  });
});
