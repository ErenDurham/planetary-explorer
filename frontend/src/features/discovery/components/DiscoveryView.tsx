// "Discover Earth regions": rank an installed offline survey against Jezero,
// inspect candidate evidence, adjust the two terrain weights, export. Distinct
// from the Established analogs flow in Explore: its own run-scoped store, its
// own two-feature scores, and no write to the curated selections.
import { useEffect, useMemo } from "react";
import { Compass, Globe2, Map as MapIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyNote } from "@/components/ui/Section";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { useAppStore } from "@/store/useAppStore";
import { useEarthSites } from "@/hooks/useEarthSites";
import { useDiscoveryCapabilities } from "../hooks/useDiscoveryCapabilities";
import { useDiscoveryRank } from "../hooks/useDiscoveryRank";
import { useDiscoveryCandidate } from "../hooks/useDiscoveryCandidate";
import { useDiscoveryStore, useRunState } from "../store/useDiscoveryStore";
import { wantsDiscovery } from "../lib/objective";
import { OFFLINE_NOTE, PROPOSED_LABEL } from "../lib/copy";
import { SurveyPicker } from "./SurveyPicker";
import { SurveyFunnel } from "./SurveyFunnel";
import { SurveyMap } from "./SurveyMap";
import { DiscoveryGlobe } from "./DiscoveryGlobe";
import { WeightControls } from "./WeightControls";
import { CandidateList } from "./CandidateList";
import { CandidateDetail } from "./CandidateDetail";
import { ExportPanel } from "./ExportPanel";
import { isDiscoveryNotFound, isDiscoveryRejected, isDiscoveryUnavailable } from "../adapter";

export function DiscoveryView() {
  const caps = useDiscoveryCapabilities();
  const store = useDiscoveryStore();
  const run = useRunState();
  const earth = useEarthSites();
  const palette = useAppStore(s => s.rankPalette);
  const objective = useAppStore(s => (s.appliedObjective || s.missionObjective || "").trim());
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const setViewedBody = useAppStore(s => s.setViewedBody);
  const setMapMode = useAppStore(s => s.setMapMode);
  const selectLocation = useAppStore(s => s.selectLocation);
  const capabilities = caps.kind === "ready" ? caps.capabilities : caps.kind === "unavailable" ? caps.capabilities : null;
  const runs = caps.kind === "ready" ? caps.capabilities.runs : [];

  useEffect(() => { if (capabilities) store.seedDefaults(capabilities.default_weights); }, [capabilities?.default_weights]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (runs.length && (!store.runId || !runs.some(r => r.run_id === store.runId))) store.setRun(runs[0].run_id); }, [runs]); // eslint-disable-line react-hooks/exhaustive-deps

  const rank = useDiscoveryRank(store.runId, store.weights, store.topK, run.ranked && caps.kind === "ready");
  const selected = rank.data?.candidates.find(c => c.id === run.selectedCandidateId) ?? null;
  const detail = useDiscoveryCandidate(store.runId, selected?.id ?? null);
  const activeRun = runs.find(r => r.run_id === store.runId) ?? null;
  const sources = useMemo(() => rank.data?.candidates.flatMap(c => c.sources) ?? [], [rank.data]);
  const discoveryObjective = wantsDiscovery(objective);

  const openEstablished = (siteId?: string) => { setViewedBody("earth", { manual: true }); setMapMode("analog_match"); if (siteId) selectLocation("earth", siteId); setActiveTab("explore"); };

  return (
    <div className="scroll-thin h-full overflow-y-auto" data-testid="discovery-view">
      <div className="border-b border-line bg-bg-elev p-4">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><Compass className="h-5 w-5 text-info" aria-hidden /><h1 className="text-xl font-semibold tracking-tight text-fg">Discover Earth regions</h1><Badge tone="info">Earth · offline survey</Badge>{caps.kind === "ready" ? <Badge tone="ok">Service ready · {caps.capabilities.engine_version}</Badge> : caps.kind === "loading" ? <Badge tone="neutral">Connecting…</Badge> : <Badge tone="warn">{caps.kind === "unavailable" ? "No survey available" : "Service error"}</Badge>}</div>
              <p className="mt-1 max-w-3xl text-sm text-fg-muted">Proposed terrain analog candidates for {capabilities?.reference?.name ?? "Jezero Crater"} from a preprocessed regional survey. Separate from the <button type="button" onClick={() => openEstablished()} className="text-info underline underline-offset-2">Established analogs</button>, which are curated sites with their own five-feature scores.</p>
              {discoveryObjective && <p className="mt-1 text-xs text-fg-faint">Your mission objective asks for new regions beyond the established analogs; this is where that search lives.</p>}
            </div>
            <nav aria-label="Analog views" className="flex items-center gap-1 rounded-full border border-line bg-bg p-1 text-xs">
              <button type="button" onClick={() => openEstablished()} className="rounded-full px-3 py-1.5 text-fg-muted hover:text-fg">Established analogs</button>
              <span aria-current="page" className="rounded-full bg-info/20 px-3 py-1.5 text-info">Discover Earth regions</span>
            </nav>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-4 p-4">
        {caps.kind === "loading" && <p role="status" className="text-sm text-fg-muted">Loading discovery capabilities…</p>}
        {caps.kind === "error" && <div className="space-y-2"><ErrorNote error={caps.error} context="discovery/capabilities" /><button type="button" onClick={caps.retry} className="rounded border border-line-strong px-3 py-1.5 text-xs text-fg">Retry</button></div>}
        {caps.kind === "unavailable" && (
          <section className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm" role="status" data-testid="discovery-unavailable">
            <p className="font-semibold text-warn">No discovery survey is available.</p>
            <p className="mt-1 text-fg">{caps.reason} Nothing is simulated in its place: a survey is produced offline from cached terrain sources and installed as an immutable artifact, and until one is installed there are no candidates to show.</p>
            {caps.capabilities && caps.capabilities.limitations.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-fg-muted">{caps.capabilities.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>}
            <p className="mt-2 text-xs text-fg-muted">{OFFLINE_NOTE}</p>
          </section>
        )}

        {caps.kind === "ready" && activeRun && (
          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
            <aside className="space-y-4 xl:order-1" aria-label="Survey and weights">
              <SurveyPicker runs={runs} runId={store.runId} onRun={store.setRun} reference={caps.capabilities.reference} ranked={run.ranked} onRank={() => { store.requestRank(); if (run.ranked) void rank.refetch(); }} ranking={rank.isFetching} />
              <WeightControls shares={store.weights} defaults={store.defaultWeights} criteria={caps.capabilities.criteria} onChange={store.setWeight} onReset={store.resetWeights} topK={store.topK} onTopK={store.setTopK} disabled={!run.ranked} />
              <ExportPanel runId={store.runId} ranking={rank.data} />
            </aside>

            <section className="min-w-0 space-y-3 xl:order-2" aria-label="Survey map">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-fg-muted">{rank.data ? <>{rank.data.returned_count} of {rank.data.eligible_pool_count} eligible footprints shown · ranked against {rank.data.reference.name}</> : run.ranked ? "Ranking…" : `${activeRun.total_sampled} footprints sampled · ${activeRun.eligible_count} eligible · not ranked yet`}</p>
                <div role="group" aria-label="Map view" className="flex gap-1 text-xs">{(["map", "globe"] as const).map(v => <button key={v} type="button" aria-pressed={store.view === v} onClick={() => store.setView(v)} className={`inline-flex items-center gap-1 rounded border px-2.5 py-1.5 ${store.view === v ? "border-copper bg-copper/10 text-copper-bright" : "border-transparent text-fg-muted hover:text-fg"}`}>{v === "map" ? <MapIcon className="h-3.5 w-3.5" aria-hidden /> : <Globe2 className="h-3.5 w-3.5" aria-hidden />}{v === "map" ? "Survey map" : "Globe"}</button>)}</div>
              </div>
              {store.view === "map"
                ? <SurveyMap run={activeRun} survey={rank.data?.survey ?? null} candidates={rank.data?.candidates ?? []} selectedId={run.selectedCandidateId} onSelect={store.selectCandidate} established={earth.sites} palette={palette} className="h-[46vh] min-h-[340px]" />
                : <div className="h-[46vh] min-h-[340px] overflow-hidden rounded-xl border border-line-strong"><DiscoveryGlobe candidates={rank.data?.candidates ?? []} established={earth.sites} selectedId={run.selectedCandidateId} onSelect={store.selectCandidate} palette={palette} runLabel={activeRun.label} /></div>}
              {rank.error && (isDiscoveryUnavailable(rank.error) ? <div role="status" className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">{rank.error.reason}</div> : isDiscoveryNotFound(rank.error) ? <div role="alert" className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn"><p className="font-semibold">This survey is listed but its artifacts could not be found.</p><p className="mt-1 text-fg">{rank.error.message}. The service's capabilities list and its installed runs disagree; choose another survey or rebuild this one.</p></div> : isDiscoveryRejected(rank.error) ? <div role="alert" className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn"><p className="font-semibold">The service declined this ranking request.</p><p className="mt-1 text-fg">{rank.error.message}</p></div> : <ErrorNote error={rank.error} context="discovery/rank" />)}
              {!run.ranked && !rank.data && <EmptyNote>Choose a survey and use “Rank surveyed regions”. The map then shows the surveyed boundary, the exact sampling centres and each candidate's footprint as the service returns them.</EmptyNote>}
              {rank.data && <SurveyFunnel response={rank.data} sources={sources} />}
              {rank.data && rank.data.limitations.length > 0 && <details className="rounded-xl border border-line px-4 py-2 text-xs"><summary className="cursor-pointer text-fg-muted">Service limitations for this ranking · {rank.data.limitations.length}</summary><ul className="mt-2 list-disc space-y-0.5 pl-5 text-fg-muted">{rank.data.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul></details>}
            </section>

            <aside className="space-y-4 xl:order-3" aria-label="Candidates">
              {rank.data ? <CandidateList candidates={rank.data.candidates} selectedId={run.selectedCandidateId} onSelect={store.selectCandidate} palette={palette} pending={rank.isRefreshing} /> : <section className="rounded-xl border border-line-strong bg-bg-elev p-4"><h2 className="eyebrow">Proposed candidates</h2><p className="mt-2 text-xs text-fg-faint">{PROPOSED_LABEL}</p><EmptyNote>No ranking yet.</EmptyNote></section>}
              {selected && <CandidateDetail candidate={selected} detail={detail.data} detailPending={detail.isPending && detail.fetchStatus !== "idle"} detailError={detail.error} onRetry={() => void detail.refetch()} criteria={caps.capabilities.criteria} reference={rank.data?.reference ?? caps.capabilities.reference!} established={earth.sites} onCompareKnown={id => openEstablished(id)} />}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
