// Backend connectivity banner. The globe renders from the static texture even
// when the API is down, so this is informational rather than a blocking error.
import { WifiOff, ServerCrash } from "lucide-react";
import { useHealth } from "@/hooks/useSites";
import { API_BASE_URL, isApiError } from "@/services/api";
import { Badge } from "@/components/ui/Badge";

export function StatusBanner() {
  const h = useHealth();
  if (h.isPending) return null;
  if (h.error) {
    const unreachable = isApiError(h.error) && h.error.isUnavailable;
    return (
      <div role="alert" className="flex items-center gap-2 border-b border-danger/40 bg-danger/10 px-4 py-1.5 text-xs text-danger">
        {unreachable ? <WifiOff className="h-3.5 w-3.5" aria-hidden /> : <ServerCrash className="h-3.5 w-3.5" aria-hidden />}
        <span>
          Backend {unreachable ? "unreachable" : "error"} at <span className="num">{API_BASE_URL}</span>. The globe still renders; site data, scoring, analogs and explanations are unavailable until it is back.
        </span>
      </div>
    );
  }
  const s = h.data?.services;
  if (s && (s.data !== "ok" || s.retrieval !== "ok")) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-bg-elev px-4 py-1 text-[11px] text-fg-muted">
        <span>Backend ok · profile {h.data?.profile_version} · scoring {h.data?.scoring_spec_version}</span>
        {s.data !== "ok" && <Badge tone="danger">data: {s.data}</Badge>}
        {s.retrieval !== "ok" && <Badge tone="warn" title="Document retrieval is unavailable; explanations will carry no evidence excerpts.">retrieval: {s.retrieval}</Badge>}
        <Badge tone={s.llm === "configured" ? "copper" : "neutral"} title="Whether a language model is configured for explanations.">llm: {s.llm}</Badge>
      </div>
    );
  }
  return null;
}
