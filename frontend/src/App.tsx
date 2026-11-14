// App shell. The store separates the MISSION (task, destination, selections on
// each body) from the VIEW (which globe is shown, which map mode colours it).
// This component turns server data into one marker list for the visible body:
// Mars sites coloured by the landing evaluation in landing mode, or either
// body's candidates coloured by their analog match rank against the selected
// location on the other body. Earth markers only ever render on the Earth
// texture and Mars markers on the Mars texture, and an Earth location never
// carries a landing score.
import { ExploreView, type ExploreAnalogContext } from "@/components/layout/ExploreView";
import { useEffect, useMemo, useRef, useState } from "react";
import { TopNav } from "@/components/layout/TopNav";
import { StatusBanner } from "@/components/layout/StatusBanner";
import { HealthChip } from "@/components/layout/HealthChip";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { AnalyzeView } from "@/components/layout/AnalyzeView";
import { ResearchView } from "@/components/layout/ResearchView";
import { CompareView } from "@/components/layout/CompareView";
import { PlanetViewer, PLANET_CONFIGS, markerAppearance, analogMarkerAppearance, type MarkerDatum } from "@/components/globe";
import { useSites } from "@/hooks/useSites";
import { useEarthSites } from "@/hooks/useEarthSites";
import { useDefaultMission } from "@/hooks/useDefaultMission";
import { useEvaluation } from "@/hooks/useEvaluation";
import { useAnalogRank } from "@/hooks/useAnalogRank";
import { effectiveMapMode, referenceIdFor, selectedIdFor, useAppStore } from "@/store/useAppStore";
import { BODY_NAME, otherBody, toAnalogShares } from "@/lib/analogFeatures";
import { sharesEqual } from "@/lib/allocation";
import { RankedList, AnalogRankedList } from "@/components/mission/RankedList";
import type { RankChange } from "@/components/mission/AnalogPreferences";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { EmptyNote } from "@/components/ui/Section";
import type { AnalogRankResponse } from "@/types";

export default function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const focusToken = useAppStore((s) => s.selectionRevision);
  const viewedBody = useAppStore((s) => s.viewedBody);
  const mapMode = useAppStore((s) => s.mapMode);
  const selectedEarthId = useAppStore((s) => s.selectedEarthId);
  const selectedMarsId = useAppStore((s) => s.selectedMarsId);
  const selectLocation = useAppStore((s) => s.selectLocation);
  const selectSite = useAppStore((s) => s.selectSite);
  const analogWeights = useAppStore((s) => s.analogWeights);
  const rankPalette = useAppStore((s) => s.rankPalette);
  const setRankPalette = useAppStore((s) => s.setRankPalette);
  const suggested = useAppStore((s) => s.suggestedSelection);
  const setSuggestedSelection = useAppStore((s) => s.setSuggestedSelection);
  const autoRotate = useAppStore((s) => s.autoRotate);
  const setAutoRotate = useAppStore((s) => s.setAutoRotate);
  const cameraResetToken = useAppStore((s) => s.cameraResetToken);
  const requestCameraReset = useAppStore((s) => s.requestCameraReset);

  const sites = useSites();
  const earth = useEarthSites();
  const defaults = useDefaultMission();
  const evaluation = useEvaluation();

  const mode = effectiveMapMode({ viewedBody, mapMode });
  const analog = mode === "analog_match";
  const selectedId = selectedIdFor({ selectedEarthId, selectedMarsId }, viewedBody);
  const referenceId = referenceIdFor({ viewedBody, selectedEarthId, selectedMarsId });
  const refBody = otherBody(viewedBody);
  const config = PLANET_CONFIGS[viewedBody];

  const rank = useAnalogRank(viewedBody, referenceId, analogWeights, analog && activeTab === "explore");
  // placeholderData keeps the previous response while a new one loads; only
  // trust it for THIS direction and reference, never for the other body's
  const rankData: AnalogRankResponse | undefined = rank.data && rank.data.candidate_body === viewedBody && rank.data.reference.id === referenceId ? rank.data : undefined;

  const marsNames = useMemo(() => new Map((sites.data?.sites ?? []).map((s) => [s.id, s.name])), [sites.data]);
  const earthNames = useMemo(() => new Map(earth.sites.map((s) => [s.id, s.name])), [earth.sites]);
  const referenceName = referenceId ? (refBody === "earth" ? earthNames.get(referenceId) : marsNames.get(referenceId)) ?? rankData?.reference.name ?? referenceId : null;
  const referenceOptions = useMemo(() => (refBody === "earth" ? earth.sites.map((s) => ({ id: s.id, name: s.name })) : (sites.data?.sites ?? []).map((s) => ({ id: s.id, name: s.name }))), [refBody, earth.sites, sites.data]);

  const markers: MarkerDatum[] = useMemo(() => {
    if (viewedBody === "earth") {
      const byId = new Map(rankData?.candidates.map((c) => [c.location.id, c]) ?? []);
      return earth.sites.map((s) => {
        const c = byId.get(s.id);
        return { id: s.id, name: s.name, region: s.region, lat: s.lat, lonEast: s.lonEast, mode: "analog" as const, score: null, rank: c?.rank ?? null, status: null, similarity: c?.similarity ?? null, unrankableReason: c?.unrankable_reason ?? (c ? null : referenceId ? null : "no reference selected"), appearance: analogMarkerAppearance(c?.rank_color_position ?? null, rankPalette) };
      });
    }
    if (analog) {
      const byId = new Map(rankData?.candidates.map((c) => [c.location.id, c]) ?? []);
      return (sites.data?.sites ?? []).map((s) => {
        const c = byId.get(s.id);
        return { id: s.id, name: s.name, region: s.region, lat: s.lat, lonEast: s.lon_east, mode: "analog" as const, score: null, rank: c?.rank ?? null, status: null, similarity: c?.similarity ?? null, unrankableReason: c?.unrankable_reason ?? null, appearance: analogMarkerAppearance(c?.rank_color_position ?? null, rankPalette) };
      });
    }
    const byId = new Map(evaluation.data?.results.map((r) => [r.site_id, r]) ?? []);
    return (sites.data?.sites ?? []).map((s) => {
      const r = byId.get(s.id);
      return { id: s.id, name: s.name, region: s.region, lat: s.lat, lonEast: s.lon_east, mode: "landing" as const, score: r?.score ?? null, rank: r?.rank ?? null, status: r?.status ?? null, similarity: null, unrankableReason: null, appearance: markerAppearance(r?.status, r?.score) };
    });
  }, [viewedBody, analog, sites.data, evaluation.data, earth.sites, rankData, rankPalette, referenceId]);

  // One-time best-match hint: only when a reference (a known selected site on
  // the other body) exists and the visible body has no selection yet. Shown as
  // "Suggested reference"; never applied to the selection.
  useEffect(() => {
    if (!analog || !rankData || selectedId || !referenceId) return;
    const top = rankData.candidates.find((c) => c.rank === 1);
    if (!top) return;
    if (suggested && suggested.body === viewedBody && suggested.forReferenceId === referenceId) return;
    setSuggestedSelection({ body: viewedBody, id: top.location.id, name: top.location.name, forReferenceId: referenceId });
  }, [analog, rankData, selectedId, referenceId, viewedBody, suggested, setSuggestedSelection]);

  // Rank movements between the last settled ranking and this one, for the
  // same direction and reference: the deterministic explanation under the
  // analog preference sliders is computed from these two responses only.
  const settled = useRef<{ ctx: string; shares: Record<string, number>; response: AnalogRankResponse } | null>(null);
  const [change, setChange] = useState<{ rankChanges: RankChange[]; previousShares: Record<string, number> } | null>(null);
  // a display filter on the candidate list; it never changes colours, which come from positions over the full pool
  const [listFilter, setListFilter] = useState("");
  useEffect(() => {
    if (!rankData) return;
    const ctx = `${viewedBody}:${referenceId}`;
    const shares = toAnalogShares(analogWeights);
    const prev = settled.current;
    if (prev && prev.ctx === ctx && !sharesEqual(prev.shares, shares)) {
      const before = new Map(prev.response.candidates.map((c) => [c.location.id, c]));
      setChange({ previousShares: prev.shares, rankChanges: rankData.candidates.map((c) => ({ id: c.location.id, name: c.location.name, previousRank: before.get(c.location.id)?.rank ?? null, newRank: c.rank ?? null })) });
    } else if (!prev || prev.ctx !== ctx) {
      setChange(null);
    }
    settled.current = { ctx, shares, response: rankData };
  }, [rankData, viewedBody, referenceId, analogWeights]);

  const rankedCount = rankData?.ranked_count ?? null;
  const statusLine = viewedBody === "earth"
    ? earth.isPending ? "Loading Earth locations…" : earth.error ? "Earth locations unavailable" : `${markers.length} Earth analog candidates · ${referenceName ? `${rankedCount ?? 0} ranked against ${referenceName}` : "no Mars reference selected"}`
    : analog
      ? `${markers.length} Mars sites · ${referenceName ? `${rankedCount ?? 0} ranked against ${referenceName}` : "no Earth reference selected"}`
      : sites.isPending
        ? "Loading sites…"
        : sites.error
          ? "Sites unavailable"
          : `${markers.length} candidate sites · ${evaluation.data ? `${evaluation.data.results.filter((r) => r.status === "ok").length} ranked` : evaluation.isPending ? "scoring…" : "not scored"}`;

  const legendHeading = analog ? `${BODY_NAME[viewedBody]} matches to ${referenceName ?? "(no reference)"}` : undefined;
  const onSelectVisible = (id: string) => selectLocation(viewedBody, id);

  const globe = (
    <div className="relative h-full">
      <PlanetViewer
        key="planet-viewer"
        config={config}
        markers={markers}
        selectedId={selectedId}
        focusToken={focusToken}
        onSelect={onSelectVisible}
        autoRotate={autoRotate}
        onAutoRotateChange={setAutoRotate}
        resetToken={cameraResetToken}
        onRequestReset={requestCameraReset}
        statusLine={statusLine}
        mode={analog ? "analog" : "landing"}
        palette={rankPalette}
        onPaletteChange={setRankPalette}
        legendHeading={legendHeading}
        rankedCount={rankedCount}
      />
      {viewedBody === "mars" && sites.error && (
        <div className="absolute left-3 top-14 max-w-sm">
          <ErrorNote error={sites.error} context="sites" />
        </div>
      )}
      {viewedBody === "earth" && earth.error && (
        <div className="absolute left-3 top-14 max-w-sm">
          <ErrorNote error={earth.error} context="comparison/catalog" />
        </div>
      )}
    </div>
  );

  const unavailable: Record<string, string> = useMemo(() => Object.fromEntries((rankData?.excluded_features ?? []).filter((e) => !/weight is 0/.test(e.reason)).map((e) => [e.feature_id, e.reason])), [rankData]);
  const analogContext: ExploreAnalogContext | undefined = analog
    ? { referenceId, referenceName, referenceOptions, onReferenceChange: (id) => selectLocation(refBody, id), rankedCount, unavailable, rankChanges: change?.rankChanges ?? null, previousShares: change?.previousShares ?? null, isPending: rank.isPending }
    : undefined;

  const imagerySubject = viewedBody === "earth"
    ? (() => { const e = earth.sites.find((s) => s.id === selectedId); return e ? { id: e.id, name: e.name, lat: e.lat, lon_east: e.lonEast } : undefined; })()
    : sites.data?.sites.find((s) => s.id === selectedId);
  const earthLocation = viewedBody === "earth" ? earth.data?.locations.find((l) => l.body === "earth" && l.id === selectedId) ?? null : null;

  const centre = activeTab === "explore"
    ? <ExploreView globe={globe} site={imagerySubject} analog={analogContext} />
    : activeTab === "analyze"
      ? <AnalyzeView sites={sites.data?.sites} evaluation={evaluation.data} selectedId={selectedMarsId} onSelect={selectSite} />
      : activeTab === "compare"
        ? <CompareView sites={sites.data?.sites} selectedId={selectedMarsId} onSelect={selectSite} />
        : <ResearchView sites={sites.data?.sites} selectedId={selectedMarsId} onSelect={selectSite} mission={evaluation.mission} />;

  // Candidate pane for the visible body (Analyze always shows the Mars landing ranking).
  const exploreAnalog = activeTab === "explore" && analog;
  const referenceSelector = (
    <div className="space-y-2">
      <EmptyNote>No {BODY_NAME[refBody]} reference is selected. Pick one to rank the {BODY_NAME[viewedBody]} candidates against it.</EmptyNote>
      <label className="block text-xs text-fg-muted">
        Reference on {BODY_NAME[refBody]}
        <select value="" onChange={(e) => e.target.value && selectLocation(refBody, e.target.value)} className="mt-1 w-full rounded border border-line-strong bg-bg px-2 py-1.5 text-xs text-fg" aria-label={`Choose a reference location on ${BODY_NAME[refBody]}`}>
          <option value="" disabled>{referenceOptions.length ? "Choose a reference…" : "Loading…"}</option>
          {referenceOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      {markers.length > 0 && (
        <ol className="space-y-1" aria-label={`${BODY_NAME[viewedBody]} candidates (not ranked)`}>
          {markers.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onSelectVisible(m.id)} aria-pressed={m.id === selectedId} className={`w-full rounded border px-2 py-1.5 text-left text-xs ${m.id === selectedId ? "border-copper bg-copper/10" : "border-transparent hover:border-line-strong"}`}>
                <span className="block truncate text-fg">{m.name}</span>
                <span className="block text-[10.5px] text-fg-muted">Not ranked · {m.region}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
  const candidatePane = exploreAnalog ? (
    <AnalogRankedList
      candidates={rankData?.candidates}
      bodyName={BODY_NAME[viewedBody]}
      referenceName={referenceName}
      selectedId={selectedId}
      onSelect={onSelectVisible}
      isPending={rank.isPending && !!referenceId}
      error={rank.error instanceof Error && rank.error.name !== "StaleRankResponse" ? rank.error : null}
      palette={rankPalette}
      suggestedId={suggested && suggested.body === viewedBody && suggested.forReferenceId === referenceId && !selectedId ? suggested.id : null}
      emptyReference={referenceSelector}
      filter={listFilter}
      onFilterChange={setListFilter}
    />
  ) : (
    <>
      {evaluation.error && <div className="p-3"><ErrorNote error={evaluation.error} context="scoring/evaluate" /></div>}
      <RankedList results={evaluation.data?.results} selectedId={selectedMarsId} onSelect={selectSite} isPending={evaluation.isPending} warnings={evaluation.data?.warnings} />
    </>
  );

  // Narrow screens: one reachable selector for the visible body's candidates.
  const mobileOptions = exploreAnalog
    ? (rankData?.candidates.map((c) => ({ id: c.location.id, label: `${c.rank ?? "—"}. ${c.location.name} · ${c.similarity != null ? `similarity ${c.similarity.toFixed(1)}` : "not ranked"}` })) ?? markers.map((m) => ({ id: m.id, label: `${m.name} · not ranked` })))
    : (evaluation.data?.results.map((r) => ({ id: r.site_id, label: `${r.rank ?? "—"}. ${r.site_name} · ${r.score?.toFixed(1) ?? r.status.replace(/_/g, " ")}` })) ?? []);
  const mobileSelected = exploreAnalog ? selectedId : selectedMarsId;

  return (
    <div className="flex h-full flex-col">
      <div className="absolute left-4 top-0 z-50 flex gap-2">
        <a className="sr-only rounded bg-bg-elev p-3 text-sm focus:not-sr-only" href="#workspace">Skip to workspace</a>
      </div>
      <TopNav active={activeTab} onChange={setActiveTab} right={<HealthChip />} />
      <StatusBanner />
      {(activeTab === "explore" || activeTab === "analyze") && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-bg-elev px-4 py-2 lg:hidden">
          <label htmlFor="mobile-candidate" className="text-sm text-fg-muted">{exploreAnalog ? `${BODY_NAME[viewedBody]} candidate` : "Candidate"}</label>
          <select id="mobile-candidate" value={mobileSelected ?? ""} onChange={e => (exploreAnalog ? onSelectVisible(e.target.value) : selectSite(e.target.value))} className="min-w-0 flex-1 rounded border border-line-strong bg-bg p-2 text-sm text-fg"><option value="" disabled>{exploreAnalog ? "Select a candidate" : "Select a ranked site"}</option>{mobileOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          {exploreAnalog && (
            <>
              <label htmlFor="mobile-reference" className="text-sm text-fg-muted">Reference</label>
              <select id="mobile-reference" value={referenceId ?? ""} onChange={e => e.target.value && selectLocation(refBody, e.target.value)} className="min-w-0 flex-1 rounded border border-line-strong bg-bg p-2 text-sm text-fg"><option value="" disabled>Choose a {BODY_NAME[refBody]} reference</option>{referenceOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
            </>
          )}
        </div>
      )}
      <main id="workspace" tabIndex={-1} className="min-h-0 flex-1">
        {/* Mission Design stays mounted (only hidden) on other tabs, as the old
            drawer did, so a draft objective and the excluded-factor sync survive
            switching tabs. */}
        <div hidden={activeTab !== "mission"} className="scroll-thin h-full overflow-y-auto border-b border-line bg-bg-elev">
          <LeftSidebar defaults={defaults.data} defaultsError={defaults.error} evaluation={evaluation.data} evaluationError={evaluation.error} />
        </div>
        {activeTab === "mission" ? null : activeTab === "compare" || activeTab === "research" ? (
          <div className="h-full">{centre}</div>
        ) : (
          // Candidates scroll independently of mission settings and reasoning.
          <div className={`grid h-full grid-cols-1 overflow-y-auto lg:overflow-hidden ${activeTab === "analyze" ? "lg:grid-cols-[280px_minmax(0,1fr)]" : "lg:grid-cols-[280px_minmax(0,1fr)_380px] xl:grid-cols-[280px_minmax(0,1fr)_400px]"}`}>
            <aside id="ranked-candidates" tabIndex={-1} aria-label="Candidate ranking" className="scroll-thin order-2 hidden min-h-0 overflow-y-auto border-r border-line bg-bg-elev lg:order-1 lg:block">
              {candidatePane}
            </aside>
            <div className={`order-1 min-h-[320px] lg:order-2 lg:h-full ${activeTab === "analyze" ? "h-[75vh]" : "h-[62vh]"}`}>{centre}</div>
            {activeTab === "explore" && <div className="order-3 min-h-0 border-t border-line lg:border-l lg:border-t-0">
              <RightSidebar
                body={viewedBody}
                selectedId={selectedId}
                evaluation={evaluation.data}
                evaluationPending={evaluation.isPending}
                mission={evaluation.mission}
                earthLocation={earthLocation}
                earthPending={earth.isPending}
                analog={analog ? { response: rankData, referenceName, palette: rankPalette } : null}
              />
            </div>}
          </div>
        )}
      </main>
    </div>
  );
}
