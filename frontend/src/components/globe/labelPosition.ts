import { Vector3, type Object3D, type Camera } from "three";
const projected = new Vector3();
/** Project the geographic anchor, keeping the readable card inside the canvas. */
export function labelPosition(
  object: Object3D,
  camera: Camera,
  size: { width: number; height: number },
): number[] {
  projected.setFromMatrixPosition(object.matrixWorld).project(camera);
  const marginX = Math.min(140, size.width / 2);
  return [
    Math.max(
      marginX,
      Math.min(size.width - marginX, ((projected.x + 1) * size.width) / 2),
    ),
    Math.max(
      55,
      Math.min(size.height - 55, ((1 - projected.y) * size.height) / 2),
    ),
  ];
}
