// Whether this browser can draw the globe at all. Checked once, before the
// React Three Fiber canvas mounts, so a device without WebGL gets the static
// fallback instead of a blank canvas and a console error. jsdom has no WebGL
// and is not a device, so the test environment is treated as capable; the
// fallback is exercised there by overriding this function.
let cached: boolean | null = null;

export function hasWebGL(): boolean {
  if (cached != null) return cached;
  if (typeof document === "undefined") return (cached = false);
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) return (cached = true);
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
    cached = !!gl;
  } catch {
    cached = false;
  }
  return cached;
}

/** Test seam: force the answer. */
export function setWebGLSupport(value: boolean | null): void { cached = value; }

/** Reduced-motion preference, read once per call so a change is honoured on the next render. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}
