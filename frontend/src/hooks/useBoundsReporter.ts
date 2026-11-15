import { useLayoutEffect, type RefObject } from "react";
import type { OverlayBounds } from "@/lib/overlay";
/** Report visible overlay geometry without reserving document space. */
export function useBoundsReporter(
  ref: RefObject<HTMLElement>,
  report?: (bounds: OverlayBounds) => void,
  enabled = true,
) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element || !report) return;
    const update = () => {
      const { left, right, top, bottom } = element.getBoundingClientRect();
      report({ left, right, top, bottom });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    element.addEventListener("animationend", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      element.removeEventListener("animationend", update);
    };
  }, [ref, report, enabled]);
}
