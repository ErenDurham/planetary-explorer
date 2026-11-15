// Explore → Find Earth Analogs. One page a reader should understand in five
// seconds: which region is the reference, which patch of Earth was actually
// searched, what was compared, and that the results are candidates needing
// validation. Everything numeric is the service's; the primary view keeps
// explanations short and the Method & Data section holds the controls, the
// formula, the screening audit, the sources and the export.
import { useEffect, useMemo } from "react";
import { ArrowUpRight, Globe2, Map as MapIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyNote } from "@/components/ui/Section";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { useAppStore } from "@/store/useAppStore";
import { useEarthSites } from "@/hooks/useEarthSites";
import { useImageryFor } from "@/hooks/usePairImagery";
import { imageryAssetUrl } from "@/components/imagery/assetUrl";
import { isGeoreferenced } from "@/lib/comparison";
import { useDiscoveryCapabilities } from "../hooks/useDiscoveryCapabilities";
import { useDiscoveryRank } from "../hooks/useDiscoveryRank";
import { useDiscoveryCandidate } from "../hooks/useDiscoveryCandidate";
import { useDiscoveryStore, useRunState } from "../store/useDiscoveryStore";
import { useCandidateResearchTarget } from "../store/useCandidateResearchTarget";
import { wantsDiscovery } from "../lib/objective";
import { OFFLINE_NOTE, SEPARATE_SCORES_NOTE } from "../lib/copy";
import { extentKm, formatBounds } from "../lib/geo";
import { ExploreModeSwitch } from "./ExploreModeSwitch";
import { SurveyPicker } from "./SurveyPicker";
import { SurveyFunnel } from "./SurveyFunnel";
import { SurveyMap } from "./SurveyMap";
import { DiscoveryGlobe } from "./DiscoveryGlobe";
import { WeightControls } from "./WeightControls";
import { CandidateList } from "./CandidateList";
import { CandidateDetail } from "./CandidateDetail";
import { ExportPanel } from "./ExportPanel";
import { isDiscoveryNotFound, isDiscoveryRejected, isDiscoveryUnavailable, type DiscoveryCriterion, type DiscoveryReference } from "../adapter";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function DiscoveryView() {
  const caps = useDiscoveryCapabilities();
  const store = useDiscoveryStore();
  const run = useRunState();
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

  useEffect(() => { if (capabilities) store.seedDefaults(capabilities.default_weights); }, [capabilities?.default_weights]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (runs.length && (!store.runId || !runs.some(r => r.run_id === store.runId))) store.setRun(runs[0].run_id); }, [runs]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ranking a fixed, preprocessed pool is cheap and deterministic, so it runs as soon as a survey is chosen.
  useEffect(() => { if (caps.kind === "ready" && store.runId && !run.ranked) store.requestRank(); }, [caps.kind, store.runId, run.ranked]); // eslint-disable-line react-hooks/exhaustive-deps

  const rank = useDiscoveryRank(store.runId, store.weights, store.topK, run.ranked && caps.kind === "ready");
  const selected = rank.data?.candidates.find(c => c.id === run.selectedCandidateId) ?? null;
  const detail = useDiscoveryCandidate(store.runId, selected?.id ?? null);
  const activeRun = runs.find(r => r.run_id === store.runId) ?? null;
  const sources = useMemo(() => rank.data?.candidates.flatMap(c => c.sources) ?? [], [rank.data]);
  const refImagery = useImageryFor("mars", reference?.id ?? null);
  const refImage = refImagery.data?.entries.find(e => isGeoreferenced(e) && /regional/i.test(e.title)) ?? refImagery.data?.entries.find(e => e.view === "orbital") ?? null;

  const openEstablished = (siteId?: string) => { setViewedBody("earth", { manual: true }); setMapMode("analog_match"); if (siteId) selectLocation("earth", siteId); setExploreMode("browse"); setActiveTab("explore"); };
  const openResearch = (candidateId: string) => { if (!store.runId) return; useCandidateResearchTarget.getState().open(store.runId, candidateId); if (reference) selectLocation("mars", reference.id); setActiveTab("research"); };

  // the four headline numbers, each bound to the dataset or omitted
  const survey = rank.data?.survey;
  const evaluated = survey?.generated_count ?? activeRun?.total_sampled ?? null;
  const presented = rank.data?.returned_count ?? null;
  const fpW = num(survey?.footprint_specification?.width_m), fpH = num(survey?.footprint_specification?.height_m);
  const cell = num(survey?.grid_specification?.cell_m);
  const stats: Array<{ n: number | string; label: string }> = [];
  if (evaluated != null) stats.push({ n: evaluated, label: "locations evaluated" });
  if (presented != null) stats.push({ n: presented, label: "spatially separated candidates presented" });
  if (fpW && fpH) stats.push({ n: `${Math.round(fpW / 1000)} × ${Math.round(fpH / 1000)} km`, label: "comparison footprints" });
  if (cell) stats.push({ n: `${Math.round(cell / 1000)} km`, label: "terrain analysis resolution" });
  const km = activeRun ? extentKm(activeRun.bounds) : null;

  return (
    <div className="scroll-thin h-full overflow-y-auto" data-testid="discovery-view">
      <div className="border-b border-line bg-bg-elev">
        <div className="mx-auto max-w-7xl px-4 pb-6 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ExploreModeSwitch />
            <div className="flex items-center gap-2">{caps.kind === "ready" ? <Badge tone="ok">Survey installed · {caps.capabilities.engine_version}</Badge> : caps.kind === "loading" ? <Badge tone="neutral">Connecting…</Badge> : <Badge tone="warn">{caps.kind === "unavailable" ? "No survey installed" : "Service error"}</Badge>}</div>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div>
              <p className="eyebrow">Explore · Find Earth Analogs</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Find Earth regions with terrain similar to {referenceName}</h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-fg-muted">Explore candidate locations identified through a regional terrain comparison. These are promising starting points for research, not confirmed planetary analogs.</p>
              {stats.length > 0 && (
                <ul className="mt-5 flex flex-wrap gap-x-8 gap-y-3" aria-label="Survey at a glance" data-testid="survey-stats">
                  {stats.map(s => <li key={s.label}><span className="num block text-2xl text-fg">{s.n}</span><span className="text-xs text-fg-muted">{s.label}</span></li>)}
                </ul>
              )}
            </div>
            <dl className="grid gap-3 self-end text-sm" aria-label="What this comparison is">
              <Fact label="Reference region">{reference ? <>{reference.name} · Mars · <span className="num text-fg-muted">{reference.lat.toFixed(2)}°N, {reference.lon_east.toFixed(2)}°E</span></> : "Jezero Crater · Mars"}</Fact>
              <Fact label="Area searched on Earth">{activeRun ? <>{activeRun.label} · <span className="num text-fg-muted">{formatBounds(activeRun.bounds)}</span>{km ? <span className="text-fg-muted"> · about {Math.round(km.ew)} × {Math.round(km.ns)} km</span> : null}. <span className="text-fg-muted">Earth was not searched globally.</span></> : <span className="text-fg-muted">No survey installed.</span>}</Fact>
              <Fact label="What was compared">Regional median slope and detrended relief, as footprint medians on the analysis grid. Climate, land cover and geology were not part of the comparison.</Fact>
              <Fact label="Status of the results">Candidate analogs that need scientific validation. <button type="button" onClick={() => openEstablished()} className="inline-flex items-center gap-0.5 text-info underline underline-offset-2">See the established analogs<ArrowUpRight className="h-3 w-3" aria-hidden /></button></Fact>
            </dl>
          </div>
          {wantsDiscovery(objective) && <p className="mt-3 text-xs text-fg-faint">Your mission objective asks for new regions beyond the established analogs; this is where that search lives.</p>}
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-5">
        {caps.kind === "loading" && <p role="status" className="text-sm text-fg-muted">Loading the installed survey…</p>}
        {caps.kind === "error" && <div className="space-y-2"><ErrorNote error={caps.error} context="discovery/capabilities" /><button type="button" onClick={caps.retry} className="rounded border border-line-strong px-3 py-1.5 text-xs text-fg">Retry</button></div>}
        {caps.kind === "unavailable" && (
          <section className="rounded-2xl border border-warn/40 bg-warn/10 p-5 text-sm" role="status" data-testid="discovery-unavailable">
            <p className="font-semibold text-warn">No terrain survey is installed.</p>
            <p className="mt-1 text-fg">{caps.reason} Nothing is simulated in its place: a survey is produced offline from cached terrain sources and installed as an immutable artifact, and until one is installed there are no candidates to show. The established analogs remain available under Browse Regions.</p>
            {caps.capabilities && caps.capabilities.limitations.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-fg-muted">{caps.capabilities.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>}
          </section>
        )}

        {caps.kind === "ready" && activeRun && reference && (
          <>
            <SurveyPicker runs={runs} runId={store.runId} onRun={store.setRun} />
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <section className="min-w-0 space-y-3" aria-label="Where the survey looked">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold tracking-tight text-fg">Where the survey looked</h2>
                  <div role="group" aria-label="Map view" className="flex gap-1 text-xs">{(["map", "globe"] as const).map(v => <button key={v} type="button" aria-pressed={store.view === v} onClick={() => store.setView(v)} className={`inline-flex items-center gap-1 rounded border px-2.5 py-1.5 ${store.view === v ? "border-copper bg-copper/10 text-copper-bright" : "border-transparent text-fg-muted hover:text-fg"}`}>{v === "map" ? <MapIcon className="h-3.5 w-3.5" aria-hidden /> : <Globe2 className="h-3.5 w-3.5" aria-hidden />}{v === "map" ? "Survey map" : "Globe"}</button>)}</div>
                </div>
                {store.view === "map"
                  ? <SurveyMap run={activeRun} survey={rank.data?.survey ?? null} candidates={rank.data?.candidates ?? []} selectedId={run.selectedCandidateId} onSelect={store.selectCandidate} established={earth.sites} palette={palette} className="h-[44vh] min-h-[340px]" />
                  : <div className="h-[44vh] min-h-[340px] overflow-hidden rounded-xl border border-line-strong"><DiscoveryGlobe candidates={rank.data?.candidates ?? []} established={earth.sites} selectedId={run.selectedCandidateId} onSelect={store.selectCandidate} palette={palette} runLabel={activeRun.label} /></div>}
                <p className="text-xs leading-relaxed text-fg-muted">The dashed box is the only area searched: {activeRun.label}, {formatBounds(activeRun.bounds)}. Dots are the footprint centres that were evaluated; coloured squares are the candidates shown, each a {fpW ? `${Math.round(fpW / 1000)} km` : "60 km"} footprint around its centre. Crosses mark established analogs from the curated catalog when any fall in view.</p>
                <ReferenceCard reference={reference} image={refImage} status={refImagery.status} criteria={caps.capabilities.criteria} />
              </section>

              <section className="min-w-0" aria-label="Candidates">
                {rank.error ? (isDiscoveryUnavailable(rank.error) ? <div role="status" className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">{rank.error.reason}</div> : isDiscoveryNotFound(rank.error) ? <div role="alert" className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn"><p className="font-semibold">This survey is listed but its artifacts could not be found.</p><p className="mt-1 text-fg">{rank.error.message}. Choose another survey or rebuild this one.</p></div> : isDiscoveryRejected(rank.error) ? <div role="alert" className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn"><p className="font-semibold">The service declined this ranking request.</p><p className="mt-1 text-fg">{rank.error.message}</p></div> : <ErrorNote error={rank.error} context="discovery/rank" />)
                  : rank.data ? <CandidateList candidates={rank.data.candidates} selectedId={run.selectedCandidateId} onSelect={store.selectCandidate} onResearch={openResearch} referenceName={rank.data.reference.name} effectiveWeights={rank.data.effective_weights} palette={palette} pending={rank.isRefreshing} />
                  : <div className="space-y-3" role="status"><h2 className="text-lg font-semibold tracking-tight text-fg">Candidate regions</h2><p className="text-sm text-fg-muted">Ranking the surveyed footprints against {referenceName}…</p><div className="h-28 animate-pulse rounded-2xl bg-bg-elev" /><div className="h-28 animate-pulse rounded-2xl bg-bg-elev" /></div>}
              </section>
            </div>

            {selected && <CandidateDetail candidate={selected} detail={detail.data} detailPending={detail.isPending && detail.fetchStatus !== "idle"} detailError={detail.error} onRetry={() => void detail.refetch()} criteria={caps.capabilities.criteria} reference={rank.data?.reference ?? reference} established={earth.sites} onCompareKnown={id => openEstablished(id)} />}

            <details className="rounded-2xl border border-line-strong bg-bg-elev" data-testid="method-and-data">
              <summary className="cursor-pointer px-5 py-4 text-base font-semibold text-fg">Method &amp; Data <span className="ml-2 text-xs font-normal text-fg-muted">weights, formula, screening thresholds, measurements, sources, processing, spacing rule, limitations</span></summary>
              <div className="grid gap-4 border-t border-line p-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div className="space-y-4">
                  <WeightControls shares={store.weights} defaults={store.defaultWeights} criteria={caps.capabilities.criteria} onChange={store.setWeight} onReset={store.resetWeights} topK={store.topK} onTopK={store.setTopK} disabled={!run.ranked} />
                  <ExportPanel runId={store.runId} ranking={rank.data} />
                </div>
                <div className="space-y-4 text-sm">
                  <section className="rounded-xl border border-line p-4" aria-labelledby="method-formula"><h3 id="method-formula" className="eyebrow">How the index is calculated</h3>
                    <p className="mt-2 text-fg">For each footprint the service takes the absolute difference between the Earth value and the {referenceName} value for each feature, divides by that feature's fixed scale, and averages the two under the weights above (D). The index is <span className="num">100 / (1 + D)</span>. Candidates are ordered by full-precision D, then spaced so no two shown centres are closer than the survey's separation rule; the raw rank before spacing is kept.</p>
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-fg-muted">{caps.capabilities.criteria.map((c: DiscoveryCriterion) => <li key={c.feature_id}>{c.label}: scale {c.scale} {c.unit} (declared by the service as an unvalidated assumption)</li>)}</ul>
                    <p className="mt-2 text-xs text-fg-muted">{SEPARATE_SCORES_NOTE}</p>
                    <p className="mt-1 text-xs text-fg-muted">{OFFLINE_NOTE}</p>
                  </section>
                  {rank.data && <SurveyFunnel response={rank.data} sources={sources} />}
                  <section className="rounded-xl border border-line p-4" aria-labelledby="method-sources"><h3 id="method-sources" className="eyebrow">Dataset sources</h3>
                    <ul className="mt-2 space-y-1 text-xs">{[...new Map(sources.map(s => [s.source_id, s])).values()].map(s => <li key={s.source_id} className="text-fg-muted"><span className="text-fg">{s.title}</span> — {s.institution} · {s.license} · {s.observation_period}{s.url && <> · <a href={s.url} target="_blank" rel="noreferrer" className="text-copper-bright underline">source</a></>}</li>)}{sources.length === 0 && <li className="text-fg-faint">Sources appear with the ranking.</li>}</ul>
                  </section>
                  <section className="rounded-xl border border-line p-4" aria-labelledby="method-limits"><h3 id="method-limits" className="eyebrow">Known limitations</h3>
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-fg-muted">{(rank.data?.limitations ?? caps.capabilities.limitations).map((l, i) => <li key={i}>{l}</li>)}</ul>
                  </section>
                </div>
              </div>
            </details>
          </>
        )}
        {caps.kind === "ready" && !activeRun && <EmptyNote>No survey could be selected.</EmptyNote>}
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-line bg-bg px-3 py-2"><dt className="text-[10.5px] uppercase tracking-wide text-fg-faint">{label}</dt><dd className="mt-0.5 text-sm leading-snug text-fg">{children}</dd></div>;
}

/** The reference region, with its own verified orbital image when one exists. */
function ReferenceCard({ reference, image, status, criteria }: { reference: DiscoveryReference; image: { entry_id: string; title: string; credit: string; relevance: string } | null; status: string; criteria: DiscoveryCriterion[] }) {
  return (
    <section aria-label={`Reference region: ${reference.name}`} className="grid overflow-hidden rounded-2xl border border-line-strong bg-bg-elev sm:grid-cols-[180px_minmax(0,1fr)]">
      <div className="relative min-h-[120px] bg-black">
        {image ? <img src={imageryAssetUrl(image.entry_id)} alt={`${reference.name}: ${image.title}`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center p-3 text-center text-[11px] text-fg-faint">{status === "loading" ? "Loading reference imagery…" : "No verified imagery"}</div>}
        <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-fg">Mars · reference</span>
      </div>
      <div className="p-4 text-sm">
        <h3 className="text-base font-semibold text-fg">{reference.name}</h3>
        <p className="num text-xs text-fg-muted">{reference.lat.toFixed(4)}°N, {reference.lon_east.toFixed(4)}°E</p>
        <p className="mt-2 text-xs leading-relaxed text-fg-muted">Every candidate is compared with this region on {criteria.map(c => c.label.toLowerCase()).join(" and ")}, measured the same way on both planets. Nothing else about {reference.name} enters the index.</p>
        {image && <p className="mt-2 text-[10.5px] text-fg-faint">{image.credit}</p>}
      </div>
    </section>
  );
}
