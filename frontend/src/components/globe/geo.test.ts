import { describe, expect, it } from "vitest";
import { latLonToVector3, normalizeLonEast } from "./geo";

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
