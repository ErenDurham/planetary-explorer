// Export: the server's audit artifact (manifest, specification, every audit
// row, exclusions, provenance, validation) and, optionally, the ranking as
// returned. Nothing is recomputed in the browser.
import { useState } from "react";
import { Download } from "lucide-react";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { InfoTip } from "@/components/ui/InfoTip";
import { discoveryService, isAbortError } from "../adapter";
import { downloadJson } from "../lib/download";
import type { DiscoveryRankResponse } from "../adapter";

export function ExportPanel({ runId, ranking }: { runId: string | null; ranking: DiscoveryRankResponse | undefined }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);
  const exportAudit = async () => {
    if (!runId) return;
    setBusy(true); setError(null); setDone(null);
    try { const payload = await discoveryService().export(runId); downloadJson(`discovery-${runId}-audit.json`, payload); setDone(`Saved discovery-${runId}-audit.json (${payload.audit_rows.length} audit rows).`); }
    catch (e) { if (!isAbortError(e)) setError(e); }
    finally { setBusy(false); }
  };
  return (
    <section aria-labelledby="export-panel" className="rounded-xl border border-line-strong bg-bg-elev p-4 text-xs">
      <div className="flex items-center gap-1"><h2 id="export-panel" className="eyebrow">Export</h2><InfoTip label="About the export files">The audit artifact is the service's immutable record for the survey (its rank fields are null by design); the ranking file is this session's server response, re-serialised with indentation and otherwise unchanged.</InfoTip></div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void exportAudit()} disabled={!runId || busy} className="inline-flex items-center gap-1.5 rounded-lg border border-copper px-3 py-2 text-copper-bright hover:bg-copper/10 disabled:opacity-40"><Download className="h-3.5 w-3.5" aria-hidden />{busy ? "Fetching audit artifact…" : "Download survey audit"}</button>
        <button type="button" onClick={() => ranking && downloadJson(`discovery-${ranking.run_id}-ranking-${ranking.client_request_id ?? "current"}.json`, ranking)} disabled={!ranking} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-fg hover:border-copper disabled:opacity-40"><Download className="h-3.5 w-3.5" aria-hidden />Download full ranking</button>
      </div>
      {done && <p className="mt-2 text-ok" role="status">{done}</p>}
      {error != null ? <div className="mt-2"><ErrorNote error={error} context="discovery/export" /></div> : null}
    </section>
  );
}
