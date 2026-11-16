import { expect, it } from "vitest";
import { previewFitDistance, previewSwap } from "./previewMotion";
it("fits the entire atmosphere within both axes of a narrow or wide preview", () => {
 for (const aspect of [.5,.75,1,1.5,2.5]) {
  const distance=previewFitDistance(aspect);
  const halfFov=Math.atan(Math.tan(40*Math.PI/360)*Math.min(1,aspect));
  expect(distance*Math.sin(halfFov)).toBeGreaterThan(1.1);
 }
});
it("hands over the body only while invisible, and arrives at full size", () => {
 expect(previewSwap(0)).toEqual({scale:1,opacity:1,swap:false,done:false});
 expect(previewSwap(.5).opacity).toBe(0);
 expect(previewSwap(1)).toEqual({scale:1,opacity:1,swap:true,done:true});
});
