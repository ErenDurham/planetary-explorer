// Explore → Find Earth Analogs, on the same three-column workspace as Browse
// Regions: the ranked shortlist on the left, the Earth globe (or the schematic
// survey map) in the centre, and the evidence for the selected candidate on
// the right, in the same resizable shell as the site panel. Everything
// numeric is the service's. Discovery selection lives in its own store and
// never touches the curated Earth selection.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyNote } from "@/components/ui/Section";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { SitePanelShell } from "@/components/layout/SitePanelShell";
import { useAppStore } from "@/store/useAppStore";
import { useEarthSites } from "@/hooks/useEarthSites";
import { useImageryFor } from "@/hooks/usePairImagery";
import { isGeoreferenced } from "@/lib/comparison";
import { useDiscoveryCapabilities } from "../hooks/useDiscoveryCapabilities";
import { useDiscoveryRank } from "../hooks/useDiscoveryRank";
import { useDiscoveryCandidate } from "../hooks/useDiscoveryCandidate";
import { useDiscoveryStore, useRunState } from "../store/useDiscoveryStore";
import { useCandidateResearchTarget } from "../store/useCandidateResearchTarget";
import { wantsDiscovery } from "../lib/objective";
import { formatPoint } from "../lib/geo";
import { DiscoveryStage } from "./DiscoveryStage";
import { DiscoveryCandidateList } from "./DiscoveryCandidateList";
import { DiscoveryPanel } from "./DiscoveryPanel";
import { DiscoverySurveyPanel } from "./DiscoverySurveyPanel";
import { CandidateDetail } from "./CandidateDetail";
import { SurveyPicker } from "./SurveyPicker";
import { SurveyMap } from "./SurveyMap";
import { DiscoveryGlobe } from "./DiscoveryGlobe";
import { isDiscoveryNotFound, isDiscoveryRejected, isDiscoveryUnavailable, type DiscoveryReference } from "../adapter";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function DiscoveryView({ panelWidth, onPanelWidthChange }: {
  /** The shared site-panel width, so resizing here and in Browse Regions is one setting. Owned locally when absent. */
  panelWidth?: number;
  onPanelWidthChange?: (width: number) => void;
} = {}) {
  const [ownWidth, setOwnWidth] = useState(380);
  const width = panelWidth ?? ownWidth;
  const setWidth = onPanelWidthChange ?? setOwnWidth;

  const caps = useDiscoveryCapabilities();
  const store = useDiscoveryStore();
  const run = useRunState();
  const focusToken = useDiscoveryStore(s => s.selectionRevision);
  const earth = useEarthSites();
  const palette = useAppStore(s => s.rankPalette);
  const objective = useAppStore(s => (s.appliedObjective || s.missionObjective || "").trim());
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const setExploreMode = useAppStore(s => s.setExploreMode);
  const setViewedBody = useAppStore(s => s.setViewedBody);
  const setMapMode = useAppStore(s => s.setMapMode);
  const selectLocation = useAppStore(s => s.selectLocation);
  const capabilities = caps.kind === "ready" ? caps.capabilities : caps.kind === "unavailable" ? caps.capabilities : null;
  const runs = caps.kind === "ready" ? caps.capabilities.runs : [];
  const reference: DiscoveryReference | undefined = capabilities?.reference;
  const referenceName = reference?.name ?? "Jezero Crater";
  const criteria = caps.kind === "ready" ? caps.capabilities.criteria : [];

  useEffect(() => { if (capabilities) store.seedDefaults(capabilities.default_weights); }, [capabilities?.default_weights]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (runs.length && (!store.runId || !runs.some(r => r.run_id === store.runId))) store.setRun(runs[0].run_id); }, [runs]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ranking a fixed, preprocessed pool is cheap and deterministic, so it runs as soon as a survey is chosen.
  useEffect(() => { if (caps.kind === "ready" && store.runId && !run.ranked) store.requestRank(); }, [caps.kind, store.runId, run.ranked]); // eslint-disable-line react-hooks/exhaustive-deps

  const rank = useDiscoveryRank(store.runId, store.weights, store.topK, run.ranked && caps.kind === "ready");
  const candidates = rank.data?.candidates;
  const selected = candidates?.find(c => c.id === run.selectedCandidateId) ?? null;
  const detail = useDiscoveryCandidate(store.runId, selected?.id ?? null);
  const activeRun = runs.find(r => r.run_id === store.runId) ?? null;
  const sources = useMemo(() => candidates?.flatMap(c => c.sources) ?? [], [candidates]);
  const refImagery = useImageryFor("mars", reference?.id ?? null);
  const refImage = refImagery.data?.entries.find(e => isGeoreferenced(e) && /regional/i.test(e.title)) ?? refImagery.data?.entries.find(e => e.view === "orbital") ?? null;

  const openEstablished = (siteId?: string) => { setViewedBody("earth", { manual: true }); setMapMode("analog_match"); if (siteId) selectLocation("earth", siteId); setExploreMode("browse"); setActiveTab("explore"); };
  const openResearch = (candidateId: string) => { if (!store.runId) return; useCandidateResearchTarget.getState().open(store.runId, candidateId); if (reference) selectLocation("mars", reference.id); setActiveTab("research"); };

  // the headline numbers, each bound to the dataset or omitted
  const survey = rank.data?.survey;
  const evaluated = survey?.generated_count ?? activeRun?.total_sampled ?? null;
  const presented = rank.data?.returned_count ?? null;
  const fpW = num(survey?.footprint_specification?.width_m), fpH = num(survey?.footprint_specification?.height_m);
  const cell = num(survey?.grid_specification?.cell_m);
  const stats: Array<{ n: number | string; label: string }> = [];
  if (evaluated != null) stats.push({ n: evaluated, label: "locations evaluated" });
  if (presented != null) stats.push({ n: presented, label: "well-spaced candidates shown" });
  if (fpW && fpH) stats.push({ n: `${Math.round(fpW / 1000)} × ${Math.round(fpH / 1000)} km`, label: "comparison footprints" });
  if (cell) stats.push({ n: `${Math.round(cell / 1000)} km`, label: "terrain analysis resolution" });

  const ready = caps.kind === "ready" && !!activeRun && !!reference;
  const badge = caps.kind === "ready" ? <Badge tone="ok">Survey installed · {caps.capabilities.engine_version}</Badge> : caps.kind === "loading" ? <Badge tone="neutral">Connecting…</Badge> : <Badge tone="warn">{caps.kind === "unavailable" ? "No survey installed" : "Service error"}</Badge>;

  // the one error or not-ready state, rendered once in the stage body
  const state = caps.kind === "loading" ? <p role="status" className="p-4 text-sm text-fg-muted">Loading the installed survey…</p>
    : caps.kind === "error" ? <div className="space-y-2 p-4"><ErrorNote error={caps.error} context="discovery/capabilities" /><button type="button" onClick={caps.retry} className="rounded border border-line-strong px-3 py-1.5 text-xs text-fg">Retry</button></div>
    : caps.kind === "unavailable" ? (
      <section className="m-4 rounded-2xl border border-warn/40 bg-warn/10 p-5 text-sm" role="status" data-testid="discovery-unavailable">
        <p className="font-semibold text-warn">No terrain survey is installed.</p>
        <p className="mt-1 text-fg">{caps.reason} Nothing is simulated in its place. A survey is made offline from cached terrain data and installed as a fixed file. Until one is installed, there are no candidates to show. The established analogs are still available under Browse Regions.</p>
        {caps.capabilities && caps.capabilities.limitations.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-fg-muted">{caps.capabilities.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      </section>
    )
    : !activeRun ? <div className="p-4"><EmptyNote>No survey could be selected.</EmptyNote></div>
    : null;

  const rankError = rank.error
    ? isDiscoveryUnavailable(rank.error) ? <div role="status" className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">{rank.error.reason}</div>
      : isDiscoveryNotFound(rank.error) ? <div role="alert" className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn"><p className="font-semibold">This survey is listed, but its files could not be found.</p><p className="mt-1 text-fg">{rank.error.message}. Choose another survey or rebuild this one.</p></div>
      : isDiscoveryRejected(rank.error) ? <div role="alert" className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn"><p className="font-semibold">The service rejected this ranking request.</p><p className="mt-1 text-fg">{rank.error.message}</p></div>
      : <ErrorNote error={rank.error} context="discovery/rank" />
    : null;

  const body = state ?? (store.view === "map"
    ? <div className="h-full p-3"><SurveyMap run={activeRun!} survey={survey ?? null} candidates={candidates ?? []} selectedId={run.selectedCandidateId} onSelect={store.selectCandidate} established={earth.sites} palette={palette} className="h-full" /></div>
    : <DiscoveryGlobe candidates={candidates ?? []} established={earth.sites} selectedId={run.selectedCandidateId} onSelect={store.selectCandidate} palette={palette} runLabel={activeRun!.label} focusToken={focusToken} bounds={activeRun!.bounds} survey={survey ?? null} />);

  const caption = !ready ? null : store.view === "map"
    ? <>The dashed box is the only area searched. Dots are the footprint centres that were evaluated. Coloured squares are the candidates shown. Each is a {fpW ? `${Math.round(fpW / 1000)} km` : "60 km"} footprint around its centre. Crosses mark established analogs from the catalog when any are in view.</>
    : null;

  const facts = ready ? (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <SurveyPicker runs={runs} runId={store.runId} onRun={store.setRun} />
        <span className="text-fg-muted">Earth was not searched globally.</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-fg-muted">
        <span>Reference: <span className="text-fg">{reference!.name}</span> · Mars · <span className="num">{reference!.lat.toFixed(2)}°N, {reference!.lon_east.toFixed(2)}°E</span></span>
        <button type="button" onClick={() => openEstablished()} className="inline-flex items-center gap-0.5 text-info underline underline-offset-2">See the established analogs<ArrowUpRight className="h-3 w-3" aria-hidden /></button>
      </div>
      {wantsDiscovery(objective) && <p className="mt-1 text-fg-faint">Your mission objective asks for new regions beyond the established analogs. This is where that search happens.</p>}
    </>
  ) : null;

  const weights = ready ? { shares: store.weights, defaults: store.defaultWeights, criteria, onChange: store.setWeight, onReset: store.resetWeights, topK: store.topK, onTopK: store.setTopK, disabled: !run.ranked } : null;

  return (
    <div className="grid h-full grid-cols-1 overflow-y-auto lg:grid-cols-[250px_minmax(0,1fr)_var(--discovery-panel-width)] lg:overflow-hidden" style={{ "--discovery-panel-width": `${width}px` } as CSSProperties} data-testid="discovery-view">
      <aside id="discovery-candidates" tabIndex={-1} aria-label="Candidate ranking" className="order-2 hidden h-full min-h-0 overflow-hidden border-r border-line bg-bg-elev lg:order-1 lg:block">
        <DiscoveryCandidateList
          candidates={candidates}
          evaluated={evaluated}
          selectedId={run.selectedCandidateId}
          onSelect={store.selectCandidate}
          palette={palette}
          pending={rank.isRefreshing}
          error={rankError}
          status={ready ? <p role="status" className="text-xs text-fg-muted">Ranking the surveyed footprints against {referenceName}…</p> : <p className="text-xs text-fg-faint">Candidates appear once a survey is installed and ranked.</p>}
          runId={store.runId}
          ranking={rank.data}
          weights={weights}
        />
      </aside>
      <div className="relative order-1 h-[72vh] min-h-[320px] lg:order-2 lg:h-full">
        <DiscoveryStage
          badge={badge}
          title={`Find Earth regions with terrain similar to ${referenceName}`}
          lede="Candidate locations found with a regional terrain comparison. They are good starting points for research. They are not confirmed planetary analogs."
          stats={stats.length > 0 ? <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1" aria-label="Survey at a glance" data-testid="survey-stats">{stats.map(s => <li key={s.label}><span className="num text-base text-fg">{s.n}</span><span className="ml-1 text-[10.5px] text-fg-muted">{s.label}</span></li>)}</ul> : null}
          facts={facts}
          view={store.view}
          onView={store.setView}
          viewEnabled={ready}
          mobile={candidates && candidates.length > 0 ? (
            <label className="flex items-center gap-1 text-xs text-fg-muted lg:hidden">Candidate
              <select value={run.selectedCandidateId ?? ""} onChange={e => store.selectCandidate(e.target.value || null)} aria-label="Candidate" className="min-w-0 rounded border border-line-strong bg-bg px-2 py-1 text-xs text-fg">
                <option value="">None selected</option>
                {candidates.map(c => <option key={c.id} value={c.id}>{c.display_rank ?? "—"}. {formatPoint(c.lat, c.lon_east)} · {c.similarity_index?.toFixed(1) ?? "—"}</option>)}
              </select>
            </label>
          ) : null}
          caption={caption}
        >
          {body}
        </DiscoveryStage>
      </div>
      <div className="order-3 min-h-0 border-t border-line bg-bg-elev lg:border-l lg:border-t-0">
        <SitePanelShell width={width} onWidthChange={setWidth} title="Candidate details">
          <DiscoveryPanel
            selected={!!selected}
            revision={focusToken}
            overview={<DiscoverySurveyPanel reference={reference} activeRun={activeRun} criteria={criteria} limitations={rank.data?.limitations ?? capabilities?.limitations ?? []} ranking={rank.data} sources={sources} refImage={refImage} refImageStatus={refImagery.status} />}
          >
            {selected && rank.data && (
              <CandidateDetail candidate={selected} detail={detail.data} detailPending={detail.isPending && detail.fetchStatus !== "idle"} detailError={detail.error} onRetry={() => void detail.refetch()} criteria={criteria} reference={rank.data.reference} established={earth.sites} onCompareKnown={id => openEstablished(id)} onResearch={openResearch} effectiveWeights={rank.data.effective_weights} returnedCount={rank.data.returned_count} survey={survey ?? null} />
            )}
          </DiscoveryPanel>
        </SitePanelShell>
      </div>
    </div>
  );
}
