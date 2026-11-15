import { expect, it } from "vitest";
import { previewFitDistance, previewSlide } from "./previewMotion";
it("fits the entire atmosphere within both axes of a narrow or wide preview", () => {
 for (const aspect of [.5,.75,1,1.5,2.5]) {
  const distance=previewFitDistance(aspect);
  const halfFov=Math.atan(Math.tan(40*Math.PI/360)*Math.min(1,aspect));
  expect(distance*Math.sin(halfFov)).toBeGreaterThan(1.1);
 }
});
it("hands over the body only while invisible, and arrives centered", () => {
 expect(previewSlide(0)).toEqual({x:0,opacity:1,swap:false,done:false});
 expect(previewSlide(.5).opacity).toBe(0);
 expect(previewSlide(1)).toEqual({x:0,opacity:1,swap:true,done:true});
});
