import { Play, RotateCw } from "lucide-react";
import { formatBounds, extentKm } from "../lib/geo";
import type { DiscoveryRunSummary, DiscoveryReference } from "../adapter";

export function SurveyPicker({ runs, runId, onRun, reference, ranked, onRank, ranking }: {
  runs: DiscoveryRunSummary[]; runId: string | null; onRun: (id: string) => void; reference: DiscoveryReference | undefined; ranked: boolean; onRank: () => void; ranking: boolean;
}) {
  const run = runs.find(r => r.run_id === runId) ?? null;
  const km = run ? extentKm(run.bounds) : null;
  return <section aria-labelledby="survey-picker" className="rounded-xl border border-line bg-bg-elev p-4 sm:p-5">
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
      <div className="min-w-0 flex-1 basis-72">
        <h2 id="survey-picker" className="text-xs font-semibold text-fg-muted">1. Choose a survey</h2>
        <label className="mt-2 block"><span className="sr-only">Installed survey</span>
          <select value={runId ?? ""} onChange={e => onRun(e.target.value)} aria-label="Installed survey" className="w-full rounded-lg border border-line-strong bg-bg px-3 py-2.5 text-sm text-fg">
            <option value="" disabled>Choose a survey…</option>{runs.map(r => <option key={r.run_id} value={r.run_id}>{r.label}</option>)}
          </select>
        </label>
      </div>
      <div className="pb-1 text-sm"><p className="text-xs text-fg-muted">Mars reference</p><p className="mt-1 font-medium text-fg">{reference?.name ?? "Jezero Crater"}</p></div>
      <button type="button" onClick={onRank} disabled={!run || ranking} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-copper bg-copper px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-copper-bright hover:text-bg disabled:opacity-40">
        {ranked ? <RotateCw className={`h-4 w-4 ${ranking ? "animate-spin" : ""}`} aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}{ranking ? "Finding matches…" : ranked ? "Refresh matches" : run?.eligible_count === 0 ? "View screening results" : "Find terrain matches"}
      </button>
    </div>
    <div className="mt-3 flex flex-wrap justify-between gap-x-6 gap-y-2 text-xs text-fg-muted">
      <p>{run ? <><span className="num text-fg">{run.total_sampled}</span> sampled regions · <span className="num text-fg">{run.eligible_count}</span> eligible{km ? ` · ~${Math.round(km.ew)} × ${Math.round(km.ns)} km survey` : ""}</> : "Choose an available survey."}</p>
      <p>Preprocessed terrain data · fixed survey, not a live search</p>
    </div>
    {run && run.eligible_count === 0 && <p className="mt-3 rounded border border-warn/40 p-3 text-xs text-warn" role="note">No regions in this survey passed screening. Choose another survey; the audit explains the exclusions.</p>}
    {run && <details className="mt-3 border-t border-line pt-2 text-xs text-fg-muted"><summary className="w-fit cursor-pointer hover:text-fg">Survey extent and processing</summary><dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1"><dt>Extent</dt><dd className="num">{formatBounds(run.bounds)}</dd><dt>Processed</dt><dd>{new Date(run.created_at).toLocaleString()}</dd><dt>Coverage</dt><dd>Copernicus GLO-90 and MOLA regional terrain. This pilot uses Jezero as a fixed reference, independently of Mission Design.</dd></dl></details>}
  </section>;
}
