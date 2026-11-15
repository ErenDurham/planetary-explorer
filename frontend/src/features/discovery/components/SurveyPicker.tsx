// Choose an installed survey and ask the server to rank its fixed pool.
import { Database, Play } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatBounds, extentKm } from "../lib/geo";
import { OFFLINE_NOTE } from "../lib/copy";
import type { DiscoveryRunSummary, DiscoveryReference } from "../adapter";

export function SurveyPicker({ runs, runId, onRun, reference, ranked, onRank, ranking }: {
  runs: DiscoveryRunSummary[]; runId: string | null; onRun: (id: string) => void; reference: DiscoveryReference | undefined; ranked: boolean; onRank: () => void; ranking: boolean;
}) {
  const run = runs.find(r => r.run_id === runId) ?? null;
  const km = run ? extentKm(run.bounds) : null;
  return (
    <section aria-labelledby="survey-picker" className="rounded-xl border border-line-strong bg-bg-elev p-4">
      <h2 id="survey-picker" className="eyebrow flex items-center gap-1.5"><Database className="h-3.5 w-3.5" aria-hidden />Installed survey</h2>
      <label className="mt-2 block text-xs text-fg-muted">Survey
        <select value={runId ?? ""} onChange={e => onRun(e.target.value)} aria-label="Installed survey" className="mt-1 w-full rounded-lg border border-line-strong bg-bg px-2 py-2 text-sm text-fg">
          <option value="" disabled>Choose a survey…</option>
          {runs.map(r => <option key={r.run_id} value={r.run_id}>{r.label} · {r.total_sampled} sampled · {r.eligible_count} eligible</option>)}
        </select>
      </label>
      {run && (
        <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-fg-faint">Searched extent</dt><dd className="num break-words text-fg">{formatBounds(run.bounds)}</dd>
          <dt className="text-fg-faint">Approx. size</dt><dd className="num text-fg">{km ? `${Math.round(km.ew)} × ${Math.round(km.ns)} km` : "—"}</dd>
          <dt className="text-fg-faint">Processed</dt><dd className="num text-fg">{new Date(run.created_at).toLocaleString()}</dd>
          <dt className="text-fg-faint">Footprints</dt><dd className="num text-fg">{run.total_sampled} sampled · {run.eligible_count} eligible</dd>
          <dt className="text-fg-faint">Reference</dt><dd className="text-fg">{reference ? `${reference.name} (Mars)` : "Jezero Crater (Mars)"}</dd>
        </dl>
      )}
      {run && run.eligible_count === 0 && <p className="mt-2 rounded border border-warn/40 bg-warn/10 p-2 text-xs text-warn" role="note">This survey has no eligible footprints after screening, so there is nothing to rank. The funnel shows why each sampled footprint was excluded.</p>}
      <button type="button" onClick={onRank} disabled={!run || ranking} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-copper bg-copper px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-copper-bright hover:text-bg disabled:opacity-40">
        <Play className="h-4 w-4" aria-hidden />{ranking ? "Ranking on the server…" : ranked ? "Re-rank surveyed regions" : "Rank surveyed regions"}
      </button>
      <p className="mt-2 text-[11px] leading-relaxed text-fg-faint">{OFFLINE_NOTE}</p>
      <p className="mt-1"><Badge tone="neutral">Offline survey · not a live search</Badge></p>
    </section>
  );
}
