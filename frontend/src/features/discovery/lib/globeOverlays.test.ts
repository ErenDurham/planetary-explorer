import { describe, expect, it } from "vitest";
import { boundsRing, discoveryOverlays, SURVEY_BOUNDS_COLOR } from "./globeOverlays";
import { candidates, rankResponse, run } from "../test/fixtures";

describe("globe overlays for discovery", () => {
  it("samples the survey bounds along each edge so the ring follows the sphere", () => {
    const ring = boundsRing(run.bounds, 4);
    expect(ring).toHaveLength(16);
    expect(ring[0]).toEqual({ lat: 32, lonEast: -3 });
    expect(ring[4]).toEqual({ lat: 32, lonEast: -2 });
    expect(ring[8]).toEqual({ lat: 31, lonEast: -2 });
    expect(ring[12]).toEqual({ lat: 31, lonEast: -3 });
  });

  it("draws one dashed bounds ring, one filled ring per candidate in its rank colour, and a dot per evaluated centre", () => {
    const res = rankResponse({ run_id: run.run_id, reference_id: "jezero_crater", top_k: 5 });
    const { rings, dots } = discoveryOverlays({ bounds: run.bounds, survey: res.survey, candidates, selectedId: candidates[1].id });
    expect(rings[0]).toMatchObject({ id: "survey-bounds", dashed: true, color: SURVEY_BOUNDS_COLOR });
    expect(rings[0].fill).toBeUndefined();
    const footprints = rings.slice(1);
    expect(footprints).toHaveLength(candidates.length);
    expect(footprints.map(r => r.pickId)).toEqual(candidates.map(c => c.id));
    expect(footprints.every(r => r.fill && r.points.length >= 4)).toBe(true);
    // the selected candidate is the only thick, highlighted ring; colours differ by rank
    expect(footprints.filter(r => r.selected).map(r => r.pickId)).toEqual([candidates[1].id]);
    expect(footprints[1].width).toBe(3);
    expect(new Set(footprints.map(r => r.color)).size).toBe(candidates.length);
    expect(dots).toHaveLength(res.survey.sampling_centres.length);
    expect(dots[0]).toMatchObject({ lat: expect.any(Number), lonEast: expect.any(Number) });
  });

  it("draws nothing it was not given", () => {
    const { rings, dots } = discoveryOverlays({ bounds: null, survey: null, candidates: [], selectedId: null });
    expect(rings).toEqual([]);
    expect(dots).toEqual([]);
  });
});
