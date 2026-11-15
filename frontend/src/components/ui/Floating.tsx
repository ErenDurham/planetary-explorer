// Popups that never run off the screen. A floating layer uses fixed
// positioning (so no scrolling panel can clip it), sits beside its anchor,
// is nudged inside the viewport with an 8 px margin and flips above the
// anchor when there is no room below. It re-places itself on scroll and
// resize. It stays in the DOM where it is rendered, so keyboard order and
// mouse enter/leave behave as if it were inline.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface Rect { left: number; right: number; top: number; bottom: number }
type Side = "bottom" | "top";

export const VIEWPORT_MARGIN = 8;

/** Where a box of `size` goes next to `anchor` inside `viewport`. `align`
 * lines the box up with the anchor's left ("start") or right ("end") edge. */
export function placeFloating(
  anchor: Rect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  align: "start" | "end" = "start",
  gap = 6,
  margin = VIEWPORT_MARGIN,
): { left: number; top: number; side: Side } {
  const preferredLeft = align === "end" ? anchor.right - size.width : anchor.left;
  const left = Math.max(margin, Math.min(preferredLeft, viewport.width - size.width - margin));
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - size.height;
  const fitsBelow = below + size.height <= viewport.height - margin;
  const fitsAbove = above >= margin;
  const side: Side = fitsBelow || (!fitsAbove && viewport.height - anchor.bottom >= anchor.top) ? "bottom" : "top";
  const top = Math.max(margin, Math.min(side === "bottom" ? below : above, viewport.height - size.height - margin));
  return { left, top, side };
}

interface Props {
  /** Current anchor rectangle in viewport coordinates (read on every placement). */
  anchor: () => Rect | null | undefined;
  children: ReactNode;
  align?: "start" | "end";
  gap?: number;
  /** Fill the gap with transparent padding so the pointer can travel from
   * the anchor into the popup without "leaving" (for close-on-leave popups). */
  bridge?: boolean;
  className?: string;
  interactive?: boolean;
  /** Place and track only while true (a closed <details> keeps its content in the DOM). */
  active?: boolean;
}

export function Floating({ anchor, children, align = "start", gap = 6, bridge = false, className = "", interactive = true, active = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; side: Side } | null>(null);

  useLayoutEffect(() => {
    if (!active) return;
    const update = () => {
      const a = anchor();
      const el = ref.current;
      if (!a || !el) return;
      const r = el.getBoundingClientRect();
      const next = placeFloating(a, { width: r.width, height: r.height }, { width: window.innerWidth, height: window.innerHeight }, align, bridge ? 0 : gap);
      setPos((p) => (p && p.left === next.left && p.top === next.top && p.side === next.side ? p : next));
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  });

  return (
    <div
      ref={ref}
      className={`fixed z-[70] max-w-[calc(100vw-16px)] ${interactive ? "" : "pointer-events-none"} ${className}`}
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        // hidden only for the first, unmeasured frame of an open popup
        visibility: active && !pos ? "hidden" : undefined,
        paddingTop: bridge && pos?.side !== "top" ? gap : 0,
        paddingBottom: bridge && pos?.side === "top" ? gap : 0,
      }}
    >
      {children}
    </div>
  );
}
