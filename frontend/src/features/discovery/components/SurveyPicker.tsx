// Which installed survey is being ranked. With one survey installed this is a
// line of facts; with several it is a selector. Ranking runs automatically
// for the chosen survey; there is no live search to start.
import { Database } from "lucide-react";
import { formatBounds, extentKm } from "../lib/geo";
import type { DiscoveryRunSummary } from "../adapter";

export function SurveyPicker({ runs, runId, onRun }: { runs: DiscoveryRunSummary[]; runId: string | null; onRun: (id: string) => void }) {
  const run = runs.find(r => r.run_id === runId) ?? null;
  const km = run ? extentKm(run.bounds) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted" data-testid="survey-picker">
      <span className="inline-flex items-center gap-1.5"><Database className="h-3.5 w-3.5" aria-hidden />
        {runs.length > 1 ? (
          <label>Survey <select value={runId ?? ""} onChange={e => onRun(e.target.value)} aria-label="Installed survey" className="ml-1 rounded border border-line-strong bg-bg px-2 py-1 text-xs text-fg">{runs.map(r => <option key={r.run_id} value={r.run_id}>{r.label}</option>)}</select></label>
        ) : <span>Survey: <span className="text-fg">{run?.label ?? "—"}</span></span>}
      </span>
      {run && <><span className="num">{formatBounds(run.bounds)}{km ? ` · about ${Math.round(km.ew)} × ${Math.round(km.ns)} km` : ""}</span><span>processed {new Date(run.created_at).toLocaleDateString()}</span></>}
    </div>
  );
}
