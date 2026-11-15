import { describe, expect, it } from "vitest";
import { clampPan, frameToPct, inside, toGeo, toPct, zoomAt } from "./geo";

const b = { west: 76.9921875, east: 78.046875, south: 17.9296875, north: 18.984375, source: "tile grid" };

describe("expedition geo", () => {
  it("maps the bounds' corners to the image corners", () => {
    expect(toPct(b, { lat: b.north, lon_east: b.west })).toEqual({ xPct: 0, yPct: 0 });
    expect(toPct(b, { lat: b.south, lon_east: b.east })).toEqual({ xPct: 100, yPct: 100 });
  });
  it("round-trips a coordinate through percentages", () => {
    const p = { lat: 18.4447, lon_east: 77.4508 };
    const back = toGeo(b, toPct(b, p));
    expect(back.lat).toBeCloseTo(p.lat, 5);
    expect(back.lon_east).toBeCloseTo(p.lon_east, 5);
  });
  it("clamps a drag past the edge to the image", () => {
    expect(toGeo(b, { xPct: -20, yPct: 140 })).toEqual({ lon_east: b.west, lat: b.south });
    expect(inside(b, { lat: 19.5, lon_east: 77 })).toBe(false);
  });
  it("zooms about the cursor so the point under it stays fixed", () => {
    const v = { zoom: 1, x: 0, y: 0 };
    const fit = { w: 800, h: 800 };
    const before = frameToPct(v, fit, 200, 300);
    const after = zoomAt(v, 2, 200, 300);
    expect(after.zoom).toBe(2);
    expect(frameToPct(after, fit, 200, 300).xPct).toBeCloseTo(before.xPct);
    expect(frameToPct(after, fit, 200, 300).yPct).toBeCloseTo(before.yPct);
  });
  it("never lets the image be panned fully out of the frame", () => {
    const v = clampPan({ zoom: 1, x: 5000, y: -5000 }, { w: 800, h: 600 }, { w: 600, h: 600 });
    expect(v.x).toBeLessThan(5000);
    expect(v.y).toBeGreaterThan(-5000);
  });
});
