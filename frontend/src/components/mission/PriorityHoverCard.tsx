// The popup shown when hovering a pie slice or a slider label: the priority's
// current share in large type and one fixed sentence on what the priority
// represents (the sentence never changes with the number). Callers place it
// with <Floating>, which keeps it inside the screen.
import type { PriorityFactor } from "@/components/mission/priorityFactors";

export function PriorityHoverCard({ factor, percent }: { factor: PriorityFactor; percent: number }) {
  return (
    <div role="tooltip" data-testid={`priority-popup-${factor.id}`} className="w-64 max-w-full rounded-lg border border-line-strong bg-bg-elev-2 p-3.5 text-left shadow-xl">
      <div className="flex items-center gap-2 text-sm text-fg-muted">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: factor.color }} aria-hidden />
        {factor.name}
      </div>
      <div className="num mt-1 text-4xl font-semibold leading-tight text-fg">{percent}%</div>
      <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{factor.description}</p>
    </div>
  );
}
