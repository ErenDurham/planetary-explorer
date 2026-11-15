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
  const anchorX = ((projected.x + 1) * size.width) / 2;
  const anchorY = ((1 - projected.y) * size.height) / 2;
  // Html is centered on this point. Leave room for the card's lower edge,
  // the marker and the pointer; flip below near the top of the canvas.
  const cardCenterY = anchorY < 112 ? anchorY + 72 : anchorY - 72;
  return [
    Math.max(marginX, Math.min(size.width - marginX, anchorX)),
    Math.max(48, Math.min(size.height - 48, cardCenterY)),
  ];
}
