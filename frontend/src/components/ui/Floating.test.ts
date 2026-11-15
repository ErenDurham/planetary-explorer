// Popup placement never leaves the screen: clamped 8 px inside each edge,
// flipped above the anchor when there is no room below.
import { describe, expect, it } from "vitest";
import { placeFloating, VIEWPORT_MARGIN } from "./Floating";

const viewport = { width: 1000, height: 800 };
const at = (left: number, top: number, w = 16, h = 16) => ({ left, right: left + w, top, bottom: top + h });

describe("placeFloating", () => {
  it("sits below the anchor, aligned to its start or end edge, when it fits", () => {
    expect(placeFloating(at(100, 100), { width: 288, height: 200 }, viewport, "start", 4)).toEqual({ left: 100, top: 120, side: "bottom" });
    expect(placeFloating(at(500, 100), { width: 288, height: 200 }, viewport, "end", 4)).toEqual({ left: 228, top: 120, side: "bottom" });
  });
  it("is pushed back inside the left and right screen edges", () => {
    // an end-aligned box anchored near the left edge would start off-screen
    expect(placeFloating(at(10, 100), { width: 288, height: 200 }, viewport, "end").left).toBe(VIEWPORT_MARGIN);
    // a start-aligned box anchored near the right edge would end off-screen
    const p = placeFloating(at(980, 100), { width: 288, height: 200 }, viewport, "start");
    expect(p.left + 288).toBe(viewport.width - VIEWPORT_MARGIN);
  });
  it("flips above the anchor near the bottom edge, and is clamped when neither side fits", () => {
    const flipped = placeFloating(at(100, 700), { width: 200, height: 200 }, viewport, "start", 6);
    expect(flipped.side).toBe("top");
    expect(flipped.top).toBe(700 - 6 - 200);
    const tall = placeFloating(at(100, 400), { width: 200, height: 790 }, viewport);
    expect(tall.top).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
  });
  it("never starts left of the margin, even when wider than the screen", () => {
    expect(placeFloating(at(50, 50), { width: 1200, height: 100 }, viewport).left).toBe(VIEWPORT_MARGIN);
  });
});
