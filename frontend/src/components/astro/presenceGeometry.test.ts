import { expect, it } from "vitest";
import { presencePoints } from "./presenceGeometry";
it("produces bounded, deterministic geometry without a random or network dependency", () => {
 const first = presencePoints(2, "ready", 120);
 expect(first).toEqual(presencePoints(2, "ready", 120));
 expect(first).toHaveLength(120);
 for(const point of first) for(const n of [point.x,point.y,point.z]) { expect(Number.isFinite(n)).toBe(true);expect(Math.abs(n)).toBeLessThan(1.6); }
});
it("responds to real assistant state and preserves a stable particle count", () => {
 expect(presencePoints(2,"thinking",120)).not.toEqual(presencePoints(2,"ready",120));
 expect(presencePoints(2,"answer",120)).toHaveLength(120);
});
it("keeps every particle on a perfect unit sphere in every chat state", () => {
 for (const state of ["ready","thinking","answer","error"] as const) {
  for (const t of [0,.7,3,12]) for (const point of presencePoints(t,state,480)) expect(Math.hypot(point.x,point.y,point.z)).toBeCloseTo(1,10);
 }
});
