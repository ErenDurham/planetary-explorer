import { useSyncExternalStore } from "react";
import { browserRuntimeStatus, IS_BROWSER_PYTHON } from "@/services/browserPython";
import { WifiOff, ServerCrash } from "lucide-react";
import { useHealth } from "@/hooks/useSites";
import { API_BASE_URL, isApiError } from "@/services/api";

export function StatusBanner() {
  const h = useHealth();
  const local = useSyncExternalStore(browserRuntimeStatus.subscribe, browserRuntimeStatus.get);
  if (IS_BROWSER_PYTHON) return <div role={local.phase === "error" ? "alert" : "status"} className="border-b border-line bg-bg-elev px-4 py-2 text-xs text-fg-muted">{local.message}</div>;
  if (h.isPending) return null;
  if (h.error) {
    const unreachable = isApiError(h.error) && h.error.isUnavailable;
    return <div role="alert" className="flex items-start gap-2 border-b border-danger/40 bg-danger/10 px-4 py-2 text-xs text-danger">
      {unreachable ? <WifiOff className="h-4 w-4 shrink-0" aria-hidden /> : <ServerCrash className="h-4 w-4 shrink-0" aria-hidden />}
      <div><p>Site data did not load. The globe still works, but rankings and comparisons need the data service.</p>
        <details className="mt-1 text-fg-muted"><summary className="cursor-pointer">Connection details</summary><p className="mt-1 break-words">{API_BASE_URL} · {h.error.message}</p></details>
      </div>
    </div>;
  }
  const services = h.data?.services;
  if (!services || (services.data === "ok" && services.retrieval === "ok")) return null;
  return <div role="status" className="border-b border-line bg-bg-elev px-4 py-2 text-xs text-fg-muted">
    <p>{services.data !== "ok" ? "Some site data is missing. Rankings may not work until it is back." : "Source documents are not available. Research explanations may be missing supporting passages."}</p>
    <details className="mt-1"><summary className="cursor-pointer">Service details</summary>
      <p className="mt-1">Data: {services.data} · Documents: {services.retrieval} · Language model: {services.llm}</p>
      <p>Profile: {h.data?.profile_version} · Scoring: {h.data?.scoring_spec_version}</p>
    </details>
  </div>;
}
