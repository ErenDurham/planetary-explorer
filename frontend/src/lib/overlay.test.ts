import { describe, expect, it } from "vitest";
import { legendBottomOffset } from "./overlay";
const viewport = { left: 250, right: 1220, top: 150, bottom: 1000 };
const legend = { width: 470, height: 110 };
describe("Floating Astro clearance", () => {
  it("keeps the legend in place without a collision", () => {
    expect(legendBottomOffset(viewport, legend, null)).toBe(12);
    expect(
      legendBottomOffset(viewport, legend, {
        left: 800,
        right: 950,
        top: 940,
        bottom: 988,
      }),
    ).toBe(12);
  });
  it("moves the legend above overlapping compact or expanded Astro", () => {
    expect(
      legendBottomOffset(viewport, legend, {
        left: 700,
        right: 840,
        top: 946,
        bottom: 988,
      }),
    ).toBe(66);
    expect(
      legendBottomOffset(viewport, legend, {
        left: 400,
        right: 1040,
        top: 520,
        bottom: 988,
      }),
    ).toBe(492);
  });
  it("keeps the legend inside a short globe", () => {
    expect(
      legendBottomOffset(
        { left: 0, right: 390, top: 200, bottom: 600 },
        { width: 360, height: 130 },
        { left: 0, right: 390, top: 100, bottom: 600 },
      ),
    ).toBe(258);
  });
});
