// The right pane of Find Earth Analogs, inside the same resizable shell as
// Browse Regions' site panel. Shows the survey overview until a candidate is
// chosen, then that candidate's evidence; on each new selection it scrolls to
// the top and flashes, exactly as RightSidebar does, so the eye lands on the
// right place after a click on the globe.
import { useEffect, useRef, type ReactNode } from "react";

export function DiscoveryPanel({ selected, revision, overview, children }: {
  /** Whether a candidate is selected (children are its evidence). */
  selected: boolean;
  /** The discovery store's selection revision. */
  revision: number;
  overview: ReactNode;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!selected || !panel.current) return;
    panel.current.scrollTop = 0;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (window.matchMedia?.("(max-width: 1023px)")?.matches) panel.current.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "start" });
    if (!reduced) {
      panel.current.animate?.([{ boxShadow: "inset 0 0 0 2px var(--color-copper-bright)", backgroundColor: "var(--color-bg-elev-2)" }, { boxShadow: "inset 0 0 0 2px transparent", backgroundColor: "transparent" }], { duration: 1100, easing: "cubic-bezier(0.32,0.72,0,1)" });
    }
  }, [selected, revision]);
  return (
    <aside ref={panel} aria-label="Candidate evidence" className="scroll-thin flex h-auto flex-col overflow-visible bg-bg-elev lg:h-full lg:overflow-y-auto" data-testid="discovery-panel">
      {selected ? children : overview}
    </aside>
  );
}
