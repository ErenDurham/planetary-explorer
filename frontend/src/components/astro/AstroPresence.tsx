import { useEffect, useRef } from "react";
import { useAppearance } from "@/theme/appearance";
import { useMotionPreference } from "@/lib/motion/preferences";
import { presencePoints, type PresenceState } from "./presenceGeometry";
import styles from "./astro.module.css";

/** Decorative state visualization. The adjacent status text conveys the same state without motion. */
export function AstroPresence({ state = "ready", size = 40 }: { state?: PresenceState; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const appearance=useAppearance(s=>s.mode);
  const reduced = useMotionPreference();
  const elapsed = useRef(0);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !("CanvasRenderingContext2D" in window)) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.ceil(size * ratio); canvas.height = Math.ceil(size * ratio);
    ctx.scale(ratio, ratio);
    let frame = 0, last = 0, visible = true, disposed = false;
    const accent = getComputedStyle(canvas).getPropertyValue("--color-copper-bright").trim() || "#d7baff";
    const ink = getComputedStyle(canvas).getPropertyValue("--color-fg").trim() || "#ece7f3";
    const draw = () => {
      const points = presencePoints(reduced ? 0 : elapsed.current, state, size <= 44 ? 160 : 480).sort((a,b) => a.z-b.z);
      ctx.globalAlpha=1;ctx.clearRect(0, 0, size, size);
      const scale = size * .35;
      for (const p of points) {
        const perspective = 2.8 / (2.8 - p.z * .25);
        ctx.fillStyle = state === "thinking" ? accent : ink;
        ctx.globalAlpha = state === "thinking" ? .25 + (p.z+1)*.32 : .16+(p.z+1)*.34;
        ctx.beginPath();ctx.arc(size/2 + p.x*scale*perspective, size/2 + p.y*scale*perspective, (size <= 44 ? .55 : .8) * perspective, 0, Math.PI*2);ctx.fill();
      }
    };
    const tick = (now: number) => {
      if (disposed || !visible || document.hidden || reduced) return;
      if (now-last >= 1000/24) { elapsed.current += Math.min((now-last)/1000,.08);last=now;draw(); }
      frame = requestAnimationFrame(tick);
    };
    const resume = () => { cancelAnimationFrame(frame);draw();if (!reduced && visible && !document.hidden) {last=performance.now();frame=requestAnimationFrame(tick);} };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {visible=entries[0]?.isIntersecting ?? true;resume();});
    observer?.observe(canvas);document.addEventListener("visibilitychange",resume);resume();
    return () => {disposed=true;cancelAnimationFrame(frame);observer?.disconnect();document.removeEventListener("visibilitychange",resume);};
  }, [state, size, reduced, appearance]);
  return <canvas ref={ref} width={size} height={size} style={{width:size,height:size}} className={styles.presence} data-state={state} data-motion={reduced ? "still" : "animated"} aria-hidden="true" />;
}
