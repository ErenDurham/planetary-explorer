import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Object3D } from "three";
import { labelPosition } from "./labelPosition";
describe("label positioning", () => {
  it("keeps projected labels within the viewport at either edge", () => {
    const camera = new PerspectiveCamera(42, 2, 0.1, 100);
    camera.position.z = 3;
    camera.updateMatrixWorld();
    const point = new Object3D();
    point.position.set(100, 100, 0);
    point.updateMatrixWorld();
    const [x, y] = labelPosition(point, camera, { width: 800, height: 400 });
    expect(x).toBeLessThanOrEqual(660);
    expect(y).toBeGreaterThanOrEqual(55);
  });
});
