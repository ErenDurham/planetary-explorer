// An evidence-led path from a fixed Earth terrain survey to a research shortlist.
import { useEffect, useMemo } from "react";
import { ArrowRight, Bookmark, Globe2, Map as MapIcon, SlidersHorizontal } from "lucide-react";
import { EmptyNote } from "@/components/ui/Section";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { useAppStore } from "@/store/useAppStore";
import { useEarthSites } from "@/hooks/useEarthSites";
import { useCandidateResearchTarget } from "../store/useCandidateResearchTarget";
import { useDiscoveryCapabilities } from "../hooks/useDiscoveryCapabilities";
import { useDiscoveryRank } from "../hooks/useDiscoveryRank";
import { useDiscoveryCandidate } from "../hooks/useDiscoveryCandidate";
import { useDiscoveryStore, useRunState } from "../store/useDiscoveryStore";
import { SurveyPicker } from "./SurveyPicker";
import { SurveyFunnel } from "./SurveyFunnel";
import { SurveyMap } from "./SurveyMap";
import { DiscoveryGlobe } from "./DiscoveryGlobe";
import { WeightControls } from "./WeightControls";
import { CandidateList } from "./CandidateList";
import { CandidateDetail } from "./CandidateDetail";
import { CandidateCompare } from "./CandidateCompare";
import { ExportPanel } from "./ExportPanel";
import { isDiscoveryNotFound, isDiscoveryRejected, isDiscoveryUnavailable } from "../adapter";

export function DiscoveryView() {
  const caps = useDiscoveryCapabilities(), store = useDiscoveryStore(), run = useRunState(), earth = useEarthSites();
  const palette = useAppStore(s => s.rankPalette);
  const capabilities = caps.kind === "ready" || caps.kind === "unavailable" ? caps.capabilities : null;
  const runs = caps.kind === "ready" ? caps.capabilities.runs : [];
  useEffect(() => { if (capabilities) store.seedDefaults(capabilities.default_weights); }, [capabilities?.default_weights]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (runs.length && (!store.runId || !runs.some(r => r.run_id === store.runId))) store.setRun(runs[0].run_id); }, [runs]); // eslint-disable-line react-hooks/exhaustive-deps
  const rank = useDiscoveryRank(store.runId, store.weights, store.topK, run.ranked && caps.kind === "ready");
  const selected = rank.data?.candidates.find(c => c.id === run.selectedCandidateId) ?? null;
  const detail = useDiscoveryCandidate(store.runId, selected?.id ?? null);
  const activeRun = runs.find(r => r.run_id === store.runId) ?? null;
  const sources = useMemo(() => rank.data?.candidates.flatMap(c => c.sources) ?? [], [rank.data]);
  const saved = run.shortlist ?? [];
  useEffect(() => {
    if (run.ranked && run.selectedCandidateId === null && !rank.isFetching && !rank.isPlaceholderData && rank.data?.candidates.length) store.selectCandidate(rank.data.candidates[0].id);
  }, [run.ranked, run.selectedCandidateId, rank.data, rank.isFetching, rank.isPlaceholderData]); // eslint-disable-line react-hooks/exhaustive-deps
  const openEstablished = (siteId?: string) => {
    const app = useAppStore.getState(); app.setViewedBody("earth", { manual: true }); app.setMapMode("analog_match");
    if (siteId) app.selectLocation("earth", siteId); app.setActiveTab("explore");
  };
  const research = (id: string) => {
    if (!store.runId) return;
    useCandidateResearchTarget.getState().open(store.runId, id); useAppStore.getState().setActiveTab("research");
  };
  return <div className="scroll-thin h-full overflow-y-auto" data-testid="discovery-view">
    <header className="border-b border-line bg-bg-elev px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl"><p className="text-[11px] font-medium uppercase tracking-widest text-copper-bright">Earth fieldwork · Mars reference</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Discover Earth regions</h1><p className="mt-2 text-sm leading-relaxed text-fg-muted">Find terrain that resembles {capabilities?.reference?.name ?? "Jezero Crater"}, compare promising regions, and build the evidence for a field study.</p><p className="mt-2 text-xs text-fg-faint">This pilot screens regional slope and relief. Geology, site access and field suitability still need investigation.</p></div>
        <nav aria-label="Analog views" className="pt-1"><button type="button" onClick={() => openEstablished()} className="inline-flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-xs text-fg-muted hover:border-copper hover:text-fg">Browse established analogs <ArrowRight className="h-3.5 w-3.5" aria-hidden /></button></nav>
      </div>
    </header>
    <div className="mx-auto max-w-[1440px] space-y-4 px-4 py-5 pb-20 sm:px-6">
      {caps.kind === "loading" && <p role="status" className="py-8 text-sm text-fg-muted">Loading available terrain surveys…</p>}
      {caps.kind === "error" && <div className="space-y-2"><ErrorNote error={caps.error} context="discovery/capabilities" /><button type="button" onClick={caps.retry} className="rounded border border-line-strong px-3 py-2 text-xs text-fg">Retry</button></div>}
      {caps.kind === "unavailable" && <section className="rounded-xl border border-line bg-bg-elev p-6 text-sm" role="status" data-testid="discovery-unavailable"><h2 className="font-semibold text-fg">No discovery survey is available.</h2><p className="mt-2 max-w-2xl leading-relaxed text-fg-muted">{caps.reason} Results appear only when a real terrain survey is installed. You can still investigate the established analog sites.</p><button type="button" onClick={() => openEstablished()} className="mt-4 text-copper-bright underline">Open established analogs</button></section>}
      {caps.kind === "ready" && activeRun && <>
        <SurveyPicker runs={runs} runId={store.runId} onRun={store.setRun} reference={caps.capabilities.reference} ranked={run.ranked} onRank={() => { store.requestRank(); if (run.ranked) void rank.refetch(); }} ranking={rank.isFetching} />
        <details className="rounded-xl border border-line bg-bg-elev px-4 py-3"><summary className="cursor-pointer text-xs font-medium text-fg-muted"><SlidersHorizontal className="mr-2 inline h-3.5 w-3.5" aria-hidden />Refine matching <span className="num ml-2 font-normal text-fg-faint">Slope {store.weights.slope_regional_median_deg}% · Relief {store.weights.roughness_regional_m}% · up to {store.topK} results</span></summary><div className="mt-3"><WeightControls shares={store.weights} defaults={store.defaultWeights} criteria={caps.capabilities.criteria} onChange={store.setWeight} onReset={store.resetWeights} topK={store.topK} onTopK={store.setTopK} /></div></details>
        {rank.error && <div>{isDiscoveryUnavailable(rank.error) || isDiscoveryNotFound(rank.error) || isDiscoveryRejected(rank.error) ? <div role="alert" className="rounded-lg border border-warn/40 p-4 text-sm text-warn"><p>{isDiscoveryUnavailable(rank.error) ? rank.error.reason : rank.error.message}</p><button type="button" onClick={() => void rank.refetch()} className="mt-2 underline">Try matching again</button></div> : <ErrorNote error={rank.error} context="discovery/rank" />}</div>}
        <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0 rounded-xl border border-line bg-bg-elev p-3 sm:p-4" aria-label="Survey map">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-fg">2. Inspect terrain matches</h2><p className="mt-1 text-xs text-fg-muted">{rank.data ? `${rank.data.returned_count} geographically separated matches from ${rank.data.eligible_pool_count} eligible regions` : `${activeRun.total_sampled} footprints sampled · ${activeRun.eligible_count} eligible · not ranked yet`}</p></div><div role="group" aria-label="Map view" className="flex gap-1 text-xs">{(["map", "globe"] as const).map(v => <button key={v} type="button" aria-pressed={store.view === v} onClick={() => store.setView(v)} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-2 ${store.view === v ? "border-line-strong bg-bg-elev-2 text-fg" : "border-transparent text-fg-muted hover:text-fg"}`}>{v === "map" ? <MapIcon className="h-3.5 w-3.5" aria-hidden /> : <Globe2 className="h-3.5 w-3.5" aria-hidden />}{v === "map" ? "Survey map" : "Globe"}</button>)}</div></div>
            {store.view === "map" ? <SurveyMap run={activeRun} survey={rank.data?.survey ?? null} candidates={rank.data?.candidates ?? []} selectedId={run.selectedCandidateId} onSelect={store.selectCandidate} established={earth.sites} palette={palette} className="h-[320px] sm:h-[380px]" /> : <div className="h-[320px] overflow-hidden rounded-lg sm:h-[380px]"><DiscoveryGlobe candidates={rank.data?.candidates ?? []} established={earth.sites} selectedId={run.selectedCandidateId} onSelect={store.selectCandidate} palette={palette} runLabel={activeRun.label} /></div>}
            <p className="mt-3 text-[11px] leading-relaxed text-fg-muted">{rank.data ? "Rank colours show relative similarity. Footprints can overlap; results are spaced apart to avoid repeating neighbouring regions." : "The boundary shows this survey's coverage. Find terrain matches to place candidate regions on the map."}</p>
          </section>
          <aside className="min-h-0 lg:max-h-[500px]" aria-label="Candidates">
            {rank.data ? <CandidateList candidates={rank.data.candidates} selectedId={run.selectedCandidateId} onSelect={store.selectCandidate} palette={palette} pending={rank.isRefreshing} savedIds={saved.map(c => c.id)} onSave={store.toggleShortlist} onInspect={() => { const card = document.getElementById("discovery-candidate-evidence"); card?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); card?.focus({ preventScroll: true }); }} /> : <section className="flex h-full flex-col justify-center rounded-xl border border-line bg-bg-elev p-6"><Bookmark className="h-5 w-5 text-copper-bright" aria-hidden /><h2 className="mt-3 text-base font-semibold text-fg">Build a research shortlist</h2><p className="mt-2 text-sm leading-relaxed text-fg-muted">Find matches, inspect their terrain, then save up to three regions for a side-by-side comparison.</p><p className="mt-3 text-xs leading-relaxed text-fg-faint">The next step is a source-backed research notebook, where you can test the proposed analogy and record evidence gaps.</p></section>}
          </aside>
        </div>
        {rank.data && rank.data.returned_count < Math.min(store.topK, rank.data.eligible_pool_count) && <p className="text-xs text-fg-muted">Fewer results than requested: the survey's geographic separation rule removes nearby duplicates. See the screening audit for the exact rule.</p>}
        <CandidateCompare saved={saved} ranking={rank.data} pending={rank.isRefreshing} runId={store.runId!} onRemove={store.toggleShortlist} onResearch={research} />
        {selected ? <div id="discovery-candidate-evidence" tabIndex={-1} className="scroll-mt-4 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-copper-bright" aria-busy={rank.isRefreshing}>{rank.isRefreshing && <p role="status" className="mb-2 text-xs text-copper-bright">Updating match scores. Measurements below belong to this footprint.</p>}<CandidateDetail candidate={selected} detail={detail.data} detailPending={detail.isPending && detail.fetchStatus !== "idle"} detailError={detail.error} onRetry={() => void detail.refetch()} criteria={caps.capabilities.criteria} reference={rank.data?.reference ?? caps.capabilities.reference!} established={earth.sites} onCompareKnown={id => openEstablished(id)} /></div> : rank.data && rank.data.candidates.length > 0 ? <EmptyNote>Select a region above to inspect its evidence and research needs.</EmptyNote> : null}
        {rank.data && <details className="rounded-xl border border-line bg-bg-elev px-4 py-3"><summary className="cursor-pointer text-sm font-medium text-fg-muted">Screening audit, methods and data sources</summary><div className="mt-4 space-y-4"><SurveyFunnel response={rank.data} sources={sources} />{rank.data.limitations.length > 0 && <ul className="list-disc space-y-2 pl-5 text-xs leading-relaxed text-fg-muted">{rank.data.limitations.map((l,i) => <li key={i}>{l}</li>)}</ul>}<p className="text-xs text-fg-faint">Service {caps.capabilities.engine_version} · fixed, preprocessed survey. Similarity is a heuristic index, not a probability.</p></div></details>}
        <details className="rounded-xl border border-line bg-bg-elev px-4 py-3"><summary className="cursor-pointer text-xs font-medium text-fg-muted">Export full ranking and audit</summary><div className="mt-3"><ExportPanel runId={store.runId} ranking={rank.data} /></div></details>
      </>}
    </div>
  </div>;
}
