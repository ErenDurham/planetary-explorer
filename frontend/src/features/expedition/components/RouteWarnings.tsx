// Warnings and difficult terrain reported by the service, each linked to the
// segment it concerns so hovering or focusing one highlights that leg.
import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import type { PlanWarning } from "../adapter/types";

const ICON = { info: Info, warning: AlertTriangle, critical: OctagonAlert } as const;
const TONE = { info: "border-info/40 bg-info/10 text-info", warning: "border-warn/40 bg-warn/10 text-warn", critical: "border-danger/40 bg-danger/10 text-danger" } as const;

export function RouteWarnings({ warnings, onHighlight }: { warnings: PlanWarning[]; onHighlight: (segmentId: string | null) => void }) {
  if (!warnings.length) return null;
  return (
    <ul className="space-y-1.5" aria-label="Route warnings">
      {warnings.map((w, i) => { const Icon = ICON[w.severity]; return (
        <li key={i}>
          <div tabIndex={w.segment_id ? 0 : -1} onMouseEnter={() => onHighlight(w.segment_id ?? null)} onMouseLeave={() => onHighlight(null)} onFocus={() => onHighlight(w.segment_id ?? null)} onBlur={() => onHighlight(null)} className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${TONE[w.severity]}`}>
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0"><span className="text-fg">{w.message}</span>{w.segment_id && <span className="ml-1 text-[10.5px] opacity-80">(segment {w.segment_id})</span>}</span>
          </div>
        </li>
      ); })}
    </ul>
  );
}
