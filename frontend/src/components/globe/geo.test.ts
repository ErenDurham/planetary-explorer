import { describe, expect, it } from "vitest";
import { latLonToVector3, normalizeLonEast, vector3ToLatLon } from "./geo";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("latLonToVector3", () => {
  it("puts the equator at 0 E on +x", () => {
    const v = latLonToVector3(0, 0, 1);
    close(v.x, 1);
    close(v.y, 0);
    close(v.z, 0);
  });
  it("puts 90 E on -z", () => {
    const v = latLonToVector3(0, 90, 1);
    close(v.x, 0);
    close(v.y, 0);
    close(v.z, -1);
  });
  it("puts 90 W on +z", () => {
    const v = latLonToVector3(0, -90, 1);
    close(v.x, 0);
    close(v.z, 1);
  });
  it("puts the north pole on +y", () => {
    const v = latLonToVector3(90, 0, 1);
    close(v.x, 0);
    close(v.y, 1);
    close(v.z, 0);
  });
  it("puts 180 on -x (texture seam)", () => {
    const v = latLonToVector3(0, 180, 1);
    close(v.x, -1);
    close(v.z, 0);
  });
  it("scales with radius and stays on the sphere", () => {
    const v = latLonToVector3(18.65, -133.8, 2.5);
    close(v.length(), 2.5);
    // Olympus Mons: western hemisphere, so z > 0 and x < 0
    expect(v.x).toBeLessThan(0);
    expect(v.z).toBeGreaterThan(0);
    expect(v.y).toBeGreaterThan(0);
  });
});

describe("normalizeLonEast", () => {
  it("wraps 226.2 E to -133.8", () => {
    close(normalizeLonEast(226.2), -133.8);
  });
  it("keeps -180..180 inputs unchanged", () => {
    close(normalizeLonEast(77.45), 77.45);
    close(normalizeLonEast(-47.95), -47.95);
  });
});

describe("vector3ToLatLon", () => {
  it("inverts latLonToVector3 everywhere but the poles, at any radius", () => {
    for (const [lat, lon] of [[0, 0], [18.4447, 77.4508], [-24.08, -69.95], [31.5, -2.5], [60, 179], [-45, -179.5], [0, 90], [0, -90]]) {
      const p = vector3ToLatLon(latLonToVector3(lat, lon, 1.0123));
      close(p.lat, lat); close(normalizeLonEast(p.lonEast - lon), 0);
    }
    expect(vector3ToLatLon(latLonToVector3(90, 12, 1)).lat).toBeCloseTo(90, 6);
  });
});
