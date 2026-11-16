import { useEffect, useState } from "react";

export const motionIsReduced = () => (typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** True when the device asks for reduced motion. */
export function useMotionPreference() {
  const [osReduced, setOsReduced] = useState(motionIsReduced);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setOsReduced(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return osReduced;
}
