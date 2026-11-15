import { describe, expect, it } from "vitest";
import { footprintRings, makeFrame, project, readSamplingCentre, ringsBounds, extentKm, unproject } from "./geo";

describe("discovery map geometry", () => {
  const b = { west: -3, south: 31, east: -2, north: 32 };
  it("maps the extent corners onto the frame with ground aspect preserved", () => {
    const f = makeFrame(b, 800, 400);
    const nw = project(f, { lon: -3, lat: 32 }), se = project(f, { lon: -2, lat: 31 });
    expect(nw.y).toBeCloseTo(0, 5);
    expect(se.y).toBeCloseTo(400, 5);
    // one degree of longitude at 31.5N is shorter than one of latitude, so the box is narrower than tall
    expect(se.x - nw.x).toBeLessThan(400);
    expect(se.x - nw.x).toBeGreaterThan(300);
  });
  it("reads GeoJSON polygons (lon, lat order) and features, and rejects garbage", () => {
    const poly = { type: "Polygon", coordinates: [[[-2.5, 31.5], [-2, 31.5], [-2, 32], [-2.5, 32], [-2.5, 31.5]]] };
    expect(footprintRings(poly)[0][0]).toEqual({ lon: -2.5, lat: 31.5 });
    expect(footprintRings({ type: "Feature", geometry: poly })).toHaveLength(1);
    expect(footprintRings({ type: "Point", coordinates: [1, 2] })).toEqual([]);
    expect(ringsBounds(footprintRings(poly))).toEqual({ west: -2.5, east: -2, south: 31.5, north: 32 });
  });
  it("reads sampling centres defensively from the service's dictionaries", () => {
    expect(readSamplingCentre({ lat: 31.1, lon_east: -2.9, eligible: false })).toEqual({ lat: 31.1, lon: -2.9, id: null, status: "excluded" });
    expect(readSamplingCentre({ lat: "x" })).toBeNull();
  });
  it("describes the searched extent in kilometres without pretending precision", () => {
    const km = extentKm(b);
    expect(Math.round(km.ns)).toBe(111);
    expect(km.ew).toBeLessThan(km.ns);
  });
  it("unprojects a pixel back to the coordinate that produced it, clamped to the globe", () => {
    const f = makeFrame({ west: -3, south: 31, east: -2, north: 32 }, 800, 420);
    for (const p of [{ lon: -2.5, lat: 31.5 }, { lon: -2.98, lat: 31.02 }, { lon: -2.01, lat: 31.99 }]) {
      const q = unproject(f, project(f, p));
      expect(q.lon).toBeCloseTo(p.lon, 9); expect(q.lat).toBeCloseTo(p.lat, 9);
    }
    expect(unproject(f, { x: -1e6, y: -1e6 })).toEqual({ lon: -180, lat: 89 });
  });
});
