import type { ReactNode } from "react";

/** A stable header and independently scrolling result area for every ranking mode. */
export function CandidatePanel({ title, subtitle, actions, controls, children }: {
  title: string; subtitle: ReactNode; actions?: ReactNode; controls: ReactNode; children: ReactNode;
}) {
  return <section aria-label={title} className="candidate-panel flex h-full min-h-0 flex-col px-4 py-3">
    {/* sized to its content (no reserved blank space); long controls scroll within half the pane */}
    <div className="scroll-thin max-h-[50%] shrink-0 overflow-y-auto pb-3">
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0"><h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-muted">{title}</h2><p className="mt-0.5 text-xs text-fg-faint">{subtitle}</p></div>
        {actions}
      </header>
      {controls}
    </div>
    {/* right padding keeps the scores clear of the scrollbar, which macOS draws over the content */}
    <div tabIndex={0} role="region" aria-label="Scrollable candidates" className="scroll-thin -mr-2 min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line pr-3 pt-2 focus-visible:outline focus-visible:outline-1 focus-visible:outline-copper-bright">{children}</div>
  </section>;
}
