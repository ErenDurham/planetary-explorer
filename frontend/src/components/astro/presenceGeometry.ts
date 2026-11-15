export type PresenceState = "ready" | "thinking" | "answer" | "error";
/** A rigid Fibonacci sphere: state changes its rotation, never its radius or silhouette. */
export function presencePoints(time: number, state: PresenceState, count = 480) {
  const speed = state === "thinking" ? .58 : state === "answer" ? .23 : .13;
  const turn = time * speed;
  const c = Math.cos(turn), s = Math.sin(turn);
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - 2 * (i + .5) / count;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * Math.PI * (3 - Math.sqrt(5));
    const x = Math.cos(phi) * ring, z = Math.sin(phi) * ring;
    return { x:x*c+z*s, y, z:z*c-x*s };
  });
}
