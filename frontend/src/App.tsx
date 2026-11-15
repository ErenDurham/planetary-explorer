// App shell. The store separates the MISSION (task, destination, selections on
// each body) from the VIEW (which globe is shown, which map mode colours it).
// This component turns server data into one marker list for the visible body:
// Mars sites coloured by the landing evaluation in landing mode, or either
// body's candidates coloured by their analog match rank against the selected
// location on the other body. Earth markers only ever render on the Earth
// texture and Mars markers on the Mars texture, and an Earth location never
// carries a landing score.
import { MissionAssessmentList, MissionAssessmentDetail } from "@/components/mission/MissionAssessmentView";
import { missionRankPosition } from "@/lib/rankColor";
import { useMissionAssessment } from "@/hooks/useMissionAssessment";
import { ExploreView, type ExploreAnalogContext } from "@/components/layout/ExploreView";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TopNav } from "@/components/layout/TopNav";
import { StatusBanner } from "@/components/layout/StatusBanner";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import type { OverlayBounds } from "@/lib/overlay";
import { AstroPanel } from "@/components/astro/AstroPanel";
import { SitePanelShell } from "@/components/layout/SitePanelShell";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { AnalyzeView } from "@/components/layout/AnalyzeView";
import { ResearchView } from "@/components/layout/ResearchView";
import { CompareView } from "@/components/layout/CompareView";
import { DiscoveryView } from "@/features/discovery";
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
  const [sitePanelWidth,setSitePanelWidth]=useState(380);
  const [exploreOverlayMaxHeight,setExploreOverlayMaxHeight]=useState<number|undefined>(undefined);
  const [astroBounds,setAstroBounds]=useState<OverlayBounds|null>(null);
  const updateAstroBounds=useCallback((bounds:OverlayBounds)=>setAstroBounds(previous=>previous && previous.left===bounds.left && previous.right===bounds.right && previous.top===bounds.top && previous.bottom===bounds.bottom ? previous : bounds),[]);
  const missionType = useAppStore(s => s.missionType);
  const assessment = useMissionAssessment();
  const navigateExplore = useAppStore(s => s.navigateExplore);
  const missionBody = useAppStore(s => s.selectionBody);
  const appliedObjective = useAppStore(s => s.appliedObjective);
  const missionDesigned = useAppStore((s) => s.missionDesigned);
  const draftDirty = useAppStore(s => s.missionDraftDirty);
  const exploreRevision = useAppStore(s => s.exploreRevision);
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
  const earthMission = viewedBody === "earth" && mode === "mission_browse";
  const taskMissionView = missionType !== "landing" && mode === "mission_browse";
  const missionSelectedId = missionBody === "earth" ? selectedEarthId : selectedMarsId;
  const missionLocation = earth.data?.locations.find(l => l.body === missionBody && l.id === missionSelectedId);
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
    if (taskMissionView) {
      const byId = new Map(assessment.data?.results.map(r=>[r.site_id,r])??[]);
      return (earth.data?.locations.filter(l=>l.body===viewedBody)??[]).map(l=>{
        const r=byId.get(l.id);const scored=r?.score!=null;
        return {id:l.id,name:l.name,region:l.region,lat:l.lat,lonEast:l.lon_east,mode:scored?"mission" as const:"browse" as const,
          score:r?.score??null,rank:r?.rank??null,status:scored?"ok" as const:"insufficient_data" as const,similarity:null,unrankableReason:null,
          appearance:scored?analogMarkerAppearance(missionRankPosition(r?.rank,assessment.data?.results.map(r=>r.rank)??[]),rankPalette):markerAppearance("insufficient_data",null)};
      });
    }
    if (viewedBody === "earth") {
      const byId = new Map(rankData?.candidates.map((c) => [c.location.id, c]) ?? []);
      return earth.sites.map((s) => {
        const c = byId.get(s.id);
        return { id: s.id, name: s.name, region: s.region, lat: s.lat, lonEast: s.lonEast, mode: earthMission ? "browse" as const : "analog" as const, score: null, rank: earthMission ? null : c?.rank ?? null, status: null, similarity: earthMission ? null : c?.similarity ?? null, unrankableReason: null, appearance: analogMarkerAppearance(earthMission ? null : c?.rank_color_position ?? null, rankPalette) };
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
      return { id: s.id, name: s.name, region: s.region, lat: s.lat, lonEast: s.lon_east, mode: "landing" as const, score: r?.score ?? null, rank: r?.rank ?? null, status: r?.status ?? null, similarity: null, unrankableReason: null, appearance: r?.status === "ok" ? analogMarkerAppearance(missionRankPosition(r.rank,evaluation.data?.results.map(r=>r.rank)??[]),rankPalette) : markerAppearance(r?.status, r?.score) };
    });
  }, [viewedBody, analog, sites.data, evaluation.data, earth.sites, rankData, rankPalette, referenceId, earthMission, taskMissionView, assessment.data, earth.data]);

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
  const statusLine = taskMissionView ? `${markers.length} mission sites · ${assessment.data?.profile_label ?? "calculating task fit"}` : viewedBody === "earth"
    ? earth.isPending ? "Loading Earth locations…" : earth.error ? "Earth locations unavailable" : earthMission ? `${markers.length} Earth mission locations · select a site` : `${markers.length} Earth analog candidates · ${referenceName ? `${rankedCount ?? 0} ranked against ${referenceName}` : "no Mars reference selected"}`
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
        overlayBounds={activeTab === "explore" ? astroBounds : null}
        onOverlayMaxHeightChange={setExploreOverlayMaxHeight}
        config={config}
        markers={markers}
        selectedId={selectedId}
        focusToken={focusToken}
        onSelect={onSelectVisible}
        onDeselect={() => selectLocation(viewedBody, null)}
        autoRotate={autoRotate}
        onAutoRotateChange={setAutoRotate}
        resetToken={cameraResetToken}
        onRequestReset={requestCameraReset}
        statusLine={statusLine}
        mode={taskMissionView ? assessment.data?.results.some(r=>r.score!=null)?"mission":"browse" : earthMission ? "browse" : analog ? "analog" : "landing"}
        palette={rankPalette}
        onPaletteChange={setRankPalette}
        legendHeading={legendHeading}
        rankedCount={analog?rankedCount:taskMissionView?Math.max(0,...(assessment.data?.results.map(r=>r.rank??0)??[])):Math.max(0,...(evaluation.data?.results.map(r=>r.rank??0)??[]))}
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

  const initialMissionId = missionType !== "landing" ? assessment.data?.results.find(r=>r.rank===1)?.site_id ?? earth.data?.locations.find(l=>l.body===missionBody)?.id : missionBody === "mars"
    ? evaluation.data?.results.find(r => r.rank === 1)?.site_id ?? sites.data?.sites[0]?.id
    : (rankData?.candidate_body === "earth" ? rankData.candidates.find(c => c.rank === 1)?.location.id : undefined) ?? earth.sites[0]?.id;

  useEffect(() => { setListFilter(""); }, [exploreRevision, viewedBody]);
  const centre = activeTab === "explore"
    ? <ExploreView key={exploreRevision} initialMissionId={initialMissionId} globe={globe} site={imagerySubject} analog={analogContext} />
    : activeTab === "analyze"
      ? missionType !== "landing" ? <MissionAssessmentDetail data={assessment.data} result={assessment.data?.results.find(r=>r.site_id===missionSelectedId)} location={missionLocation} pending={assessment.isPending} showSensitivity/> : <AnalyzeView sites={sites.data?.sites} evaluation={evaluation.data} selectedId={selectedMarsId} onSelect={selectSite} />
      : activeTab === "compare"
        ? <CompareView sites={sites.data?.sites} selectedId={selectedMarsId} onSelect={selectSite} />
        : activeTab === "discover"
        ? <DiscoveryView />
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
  const taskCandidates = missionType !== "landing" && (activeTab === "analyze" || taskMissionView);
  const candidatePane = taskCandidates ? <MissionAssessmentList data={assessment.data} pending={assessment.isPending} error={assessment.error} selectedId={missionSelectedId} onSelect={id=>selectLocation(missionBody,id)}/> : exploreAnalog ? (
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
  const mobileOptions = taskCandidates ? (assessment.data?.results.map(r=>({id:r.site_id,label:`${r.rank??"—"}. ${r.site_name} · ${r.score?.toFixed(1)??"not scored"}`}))??[]) : exploreAnalog
    ? (rankData?.candidates.map((c) => ({ id: c.location.id, label: `${c.rank ?? "—"}. ${c.location.name} · ${c.similarity != null ? `${c.similarity.toFixed(1)}% match` : "not ranked"}` })) ?? markers.map((m) => ({ id: m.id, label: `${m.name} · not ranked` })))
    : (evaluation.data?.results.map((r) => ({ id: r.site_id, label: `${r.rank ?? "—"}. ${r.site_name} · ${r.score?.toFixed(1) ?? r.status.replace(/_/g, " ")}` })) ?? []);
  const mobileSelected = taskCandidates ? missionSelectedId : exploreAnalog ? selectedId : selectedMarsId;

  return (
    <div className="flex h-full flex-col">
      <div className="absolute left-4 top-0 z-50 flex gap-2">
        <a className="sr-only rounded bg-bg-elev p-3 text-sm focus:not-sr-only" href="#workspace">Skip to workspace</a>
      </div>
      <TopNav active={activeTab} onChange={setActiveTab} />
      <StatusBanner />
      {(activeTab === "explore" || activeTab === "analyze") && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-bg-elev px-4 py-2 lg:hidden">
          <label htmlFor="mobile-candidate" className="text-sm text-fg-muted">{exploreAnalog ? `${BODY_NAME[viewedBody]} candidate` : "Candidate"}</label>
          <select id="mobile-candidate" value={mobileSelected ?? ""} onChange={e => (taskCandidates ? selectLocation(missionBody,e.target.value || null) : exploreAnalog ? selectLocation(viewedBody,e.target.value || null) : selectSite(e.target.value || null))} className="min-w-0 flex-1 rounded border border-line-strong bg-bg p-2 text-sm text-fg"><option value="">No location selected</option>{mobileOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          {exploreAnalog && (
            <>
              <label htmlFor="mobile-reference" className="text-sm text-fg-muted">Reference</label>
              <select id="mobile-reference" value={referenceId ?? ""} onChange={e => e.target.value && selectLocation(refBody, e.target.value)} className="min-w-0 flex-1 rounded border border-line-strong bg-bg p-2 text-sm text-fg"><option value="" disabled>Choose a {BODY_NAME[refBody]} reference</option>{referenceOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
            </>
          )}
        </div>
      )}
      <div className="flex min-h-0 flex-1"><main style={{"--site-panel-width":`${sitePanelWidth}px`} as React.CSSProperties} id="workspace" tabIndex={-1} className="relative min-w-0 min-h-0 flex-1">
        {/* Mission Design stays mounted (only hidden) on other tabs, as the old
            drawer did, so a draft objective and the excluded-factor sync survive
            switching tabs. */}
        <div className={`${activeTab === "mission" ? "flex" : "hidden"} h-full flex-col bg-bg-elev`}>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto"><LeftSidebar defaults={defaults.data} defaultsError={defaults.error} evaluation={evaluation.data} evaluationError={evaluation.error} /></div>
{/* shown once a mission is saved: the tab opens on the chat box alone */}
          {missionDesigned && <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-bg-elev px-5 py-4">
            <p className="max-w-2xl text-sm text-fg-muted">{draftDirty ? "Review and apply your edited objective before exploring." : `Next: explore ${BODY_NAME[missionBody]} sites for your applied mission objective.`}</p>
            <button type="button" disabled={!appliedObjective || draftDirty || !initialMissionId || (missionType === "landing" ? evaluation.isPending : assessment.isPending)} onClick={() => navigateExplore("mission", initialMissionId)} className="ml-auto rounded-lg border border-copper bg-copper px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Head to explore mission →</button>
          </footer>}
        </div>
        {activeTab === "mission" ? null : activeTab === "compare" || activeTab === "research" || activeTab === "discover" ? (
          <div className="h-full">{centre}</div>
        ) : (
          // Candidates scroll independently of mission settings and reasoning.
          <div className={`grid h-full grid-cols-1 overflow-y-auto lg:overflow-hidden ${activeTab === "analyze" ? "lg:grid-cols-[280px_minmax(0,1fr)]" : "lg:grid-cols-[250px_minmax(0,1fr)_var(--site-panel-width)]"}`}>
            <aside id="ranked-candidates" tabIndex={-1} aria-label="Candidate ranking" className="order-2 hidden h-full min-h-0 overflow-hidden border-r border-line bg-bg-elev lg:order-1 lg:block">
              {candidatePane}
            </aside>
            <div className={`relative order-1 min-h-[320px] lg:order-2 lg:h-full ${activeTab === "analyze" ? "h-[75vh]" : "h-[72vh]"}`}>
              <div className="h-full">{centre}</div>
            </div>
            {activeTab === "explore" && <div className="order-3 min-h-0 border-t border-line bg-bg-elev lg:border-l lg:border-t-0">
                <SitePanelShell width={sitePanelWidth} onWidthChange={setSitePanelWidth}>{taskMissionView ? <MissionAssessmentDetail data={assessment.data} result={assessment.data?.results.find(r=>r.site_id===selectedId)} location={missionLocation} pending={assessment.isPending}/> : <RightSidebar body={viewedBody} selectedId={selectedId} evaluation={evaluation.data} evaluationPending={evaluation.isPending} mission={evaluation.mission} earthLocation={earthLocation} earthPending={earth.isPending} analog={analog ? { response: rankData, referenceName, palette: rankPalette } : null} />}</SitePanelShell>
            </div>}
          </div>
        )}
        {/* Astro stays mounted (its conversation survives) but is hidden on Mission Design until a mission is saved: that tab opens on the chat box alone */}
        <div className={`pointer-events-none absolute inset-0 z-[60] ${(activeTab === "mission" && !missionDesigned) || activeTab === "discover" ? "hidden " : ""}${activeTab === "explore" ? "lg:left-[250px] lg:right-[var(--site-panel-width)]" : activeTab === "analyze" ? "lg:left-[280px]" : ""}`}><AstroPanel onBoundsChange={updateAstroBounds} maxOverlayHeight={activeTab === "explore" ? exploreOverlayMaxHeight : undefined} /></div>
      </main></div>
    </div>
  );
}
