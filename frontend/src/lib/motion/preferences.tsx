import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { create } from "zustand";

export const useMotionStore = create<{ paused: boolean; setPaused: (paused: boolean) => void }>(set => ({ paused: false, setPaused: paused => set({ paused }) }));
export const motionIsReduced = () => (typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export function useMotionPreference(scope: "system" | "home" = "system") {
  const paused = useMotionStore(s => s.paused);
  const [osReduced, setOsReduced] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setOsReduced(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return (scope === "home" && paused) || osReduced;
}

export function MotionControl() {
  const paused = useMotionStore(s => s.paused);
  const reduced = useMotionPreference("home");
  return <button type="button" aria-label={paused ? "Resume visual motion" : "Pause visual motion"} aria-pressed={paused} title={reduced && !paused ? "Your device requests reduced motion" : paused ? "Resume visual motion" : "Pause visual motion"} onClick={() => useMotionStore.getState().setPaused(!paused)} className="motion-control">
    {paused ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />}<span>Motion</span>
  </button>;
}
