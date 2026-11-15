import { useRef, type ReactNode } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
export const COLLAPSED_SITE_WIDTH = 44;
const MIN_WIDTH = 280;
const DEFAULT_WIDTH = 380;
const MAX_WIDTH = 520;
export function SitePanelShell({
  width,
  onWidthChange,
  children,
  title = "Site details",
}: {
  width: number;
  onWidthChange: (width: number) => void;
  children: ReactNode;
  /** Header label; Find Earth Analogs names it for candidates rather than sites. */
  title?: string;
}) {
  const collapsed = width === COLLAPSED_SITE_WIDTH;
  const previous = useRef(DEFAULT_WIDTH);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const change = (next: number) => {
    if (next < 200) {
      onWidthChange(COLLAPSED_SITE_WIDTH);
    } else {
      const bounded = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, next));
      previous.current = bounded;
      onWidthChange(bounded);
    }
  };
  const toggle = () => {
    if (collapsed) onWidthChange(previous.current);
    else {
      previous.current = width;
      onWidthChange(COLLAPSED_SITE_WIDTH);
    }
  };
  return (
    <section
      aria-label="Site information panel"
      className="relative flex h-auto min-h-0 flex-col bg-bg-elev lg:h-full"
    >
      <div
        role="separator"
        tabIndex={0}
        aria-label="Resize site panel"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={collapsed ? 0 : width}
        aria-valuetext={collapsed ? "Collapsed" : `${width} pixels wide`}
        title="Drag right to collapse. Drag left to expand."
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          drag.current = { x: e.clientX, width };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current)
            change(drag.current.width + drag.current.x - e.clientX);
        }}
        onPointerUp={(e) => {
          drag.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onKeyDown={(e) => {
          if (
            ["Home", "End", "ArrowLeft", "ArrowRight", "Enter", " "].includes(
              e.key,
            )
          ) {
            e.preventDefault();
            if (e.key === "Home") onWidthChange(COLLAPSED_SITE_WIDTH);
            else if (e.key === "End") onWidthChange(previous.current);
            else if (e.key === "Enter" || e.key === " ") toggle();
            else if (collapsed && e.key === "ArrowLeft")
              onWidthChange(previous.current);
            else if (!collapsed && width <= MIN_WIDTH && e.key === "ArrowRight")
              onWidthChange(COLLAPSED_SITE_WIDTH);
            else change(width + (e.key === "ArrowLeft" ? 40 : -40));
          }
        }}
        className="absolute inset-y-0 -left-1 z-20 hidden w-2 cursor-col-resize touch-none items-center justify-center hover:bg-copper/20 focus-visible:bg-copper/30 focus-visible:outline-none lg:flex"
      >
        <span aria-hidden className="h-10 w-0.5 rounded bg-line-strong" />
      </div>
      <header
        className={`flex shrink-0 items-center border-b border-line px-2 py-2 ${collapsed ? "justify-center" : "justify-between"}`}
      >
        {!collapsed && (
          <h2 className="pl-2 text-[11px] font-medium uppercase tracking-widest text-fg-muted">
            {title}
          </h2>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="site-panel-content"
          aria-label={collapsed ? "Expand site panel" : "Collapse site panel"}
          title={collapsed ? "Expand site panel" : "Collapse site panel"}
          className="rounded p-1.5 text-fg-muted hover:bg-bg-elev-2 hover:text-fg"
        >
          {collapsed ? (
            <PanelRightOpen className="h-4 w-4" aria-hidden />
          ) : (
            <PanelRightClose className="h-4 w-4" aria-hidden />
          )}
        </button>
      </header>
      <div
        id="site-panel-content"
        hidden={collapsed}
        className={collapsed ? "hidden" : "min-h-0 flex-1"}
      >
        {children}
      </div>
    </section>
  );
}
