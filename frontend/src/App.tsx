import { ExploreView } from "@/components/layout/ExploreView";
import { useMemo } from "react";
import { TopNav } from "@/components/layout/TopNav";
import { StatusBanner } from "@/components/layout/StatusBanner";
import { HealthChip } from "@/components/layout/HealthChip";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { AnalyzeView } from "@/components/layout/AnalyzeView";
import { ResearchView } from "@/components/layout/ResearchView";
import { CompareView } from "@/components/layout/CompareView";
import { PlanetViewer, MARS_CONFIG, markerAppearance, type MarkerDatum } from "@/components/globe";
import { useSites } from "@/hooks/useSites";
import { useDefaultMission } from "@/hooks/useDefaultMission";
import { useEvaluation } from "@/hooks/useEvaluation";
import { useAppStore } from "@/store/useAppStore";
import { RankedList } from "@/components/mission/RankedList";
import { ErrorNote } from "@/components/ui/ErrorNote";

export default function App() {
  const appliedObjective = useAppStore(s => s.appliedObjective);
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const focusToken = useAppStore((s) => s.selectionRevision);
  const selectedId = useAppStore((s) => s.selectedSiteId);
  const selectSite = useAppStore((s) => s.selectSite);
  const autoRotate = useAppStore((s) => s.autoRotate);
  const setAutoRotate = useAppStore((s) => s.setAutoRotate);
  const cameraResetToken = useAppStore((s) => s.cameraResetToken);
  const requestCameraReset = useAppStore((s) => s.requestCameraReset);

  const sites = useSites();
  const defaults = useDefaultMission();
  const evaluation = useEvaluation();

  const markers: MarkerDatum[] = useMemo(() => {
    const byId = new Map(evaluation.data?.results.map((r) => [r.site_id, r]) ?? []);
    return (sites.data?.sites ?? []).map((s) => {
      const r = byId.get(s.id);
      return {
        id: s.id,
        name: s.name,
        region: s.region,
        lat: s.lat,
        lonEast: s.lon_east,
        score: r?.score ?? null,
        rank: r?.rank ?? null,
        status: r?.status ?? null,
        appearance: markerAppearance(r?.status, r?.score),
      };
    });
  }, [sites.data, evaluation.data]);

  const statusLine = sites.isPending
    ? "Loading sites…"
    : sites.error
      ? "Sites unavailable"
      : `${markers.length} candidate sites · ${evaluation.data ? `${evaluation.data.results.filter((r) => r.status === "ok").length} ranked` : evaluation.isPending ? "scoring…" : "not scored"}`;

  const globe = (
    <div className="relative h-full">
      <PlanetViewer
        config={MARS_CONFIG}
        markers={markers}
        selectedId={selectedId}
        focusToken={focusToken}
        onSelect={selectSite}
        autoRotate={autoRotate}
        onAutoRotateChange={setAutoRotate}
        resetToken={cameraResetToken}
        onRequestReset={requestCameraReset}
        statusLine={statusLine}
      />
      {sites.error && (
        <div className="absolute left-3 top-14 max-w-sm">
          <ErrorNote error={sites.error} context="sites" />
        </div>
      )}
    </div>
  );

  const centre = activeTab === "explore" ? <ExploreView globe={globe} site={sites.data?.sites.find(s=>s.id===selectedId)} /> : activeTab === "analyze" ? <AnalyzeView sites={sites.data?.sites} evaluation={evaluation.data} selectedId={selectedId} onSelect={selectSite} /> : activeTab === "compare" ? <CompareView sites={sites.data?.sites} selectedId={selectedId} onSelect={selectSite} /> : <ResearchView sites={sites.data?.sites} selectedId={selectedId} onSelect={selectSite} mission={evaluation.mission} />;

  return (
    <div className="flex h-full flex-col">
      <div className="absolute left-4 top-0 z-50 flex gap-2">
        <a className="sr-only rounded bg-bg-elev p-3 text-sm focus:not-sr-only" href="#workspace">Skip to workspace</a>
      </div>
      <TopNav active={activeTab} onChange={setActiveTab} right={<HealthChip />} />
      <StatusBanner />
      {(activeTab === "explore" || activeTab === "analyze") && <>
        <details className="shrink-0 border-b border-line bg-bg-elev">
          <summary className="cursor-pointer px-4 py-3 text-sm text-fg"><span className="font-semibold text-copper-bright">Edit mission</span><span className="ml-3 text-fg-muted">{appliedObjective || "Loading mission…"}</span></summary>
          <div className="scroll-thin max-h-[40vh] overflow-y-auto"><LeftSidebar defaults={defaults.data} defaultsError={defaults.error} evaluation={evaluation.data} evaluationError={evaluation.error} /></div>
        </details>
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-bg-elev px-4 py-2 lg:hidden">
          <label htmlFor="mobile-candidate" className="text-sm text-fg-muted">Candidate</label>
          <select id="mobile-candidate" value={selectedId ?? ""} onChange={e => selectSite(e.target.value)} className="min-w-0 flex-1 rounded border border-line-strong bg-bg p-2 text-sm text-fg"><option value="" disabled>Select a ranked site</option>{evaluation.data?.results.map(r => <option key={r.site_id} value={r.site_id}>{r.rank ?? "—"}. {r.site_name} · {r.score?.toFixed(1) ?? r.status.replace(/_/g, " ")}</option>)}</select>
        </div>
      </>}
      <main id="workspace" tabIndex={-1} className="min-h-0 flex-1">
        {activeTab === "compare" || activeTab === "research" ? (
          <div className="h-full">{centre}</div>
        ) : (
          // Candidates scroll independently of mission settings and reasoning.
          <div className={`grid h-full grid-cols-1 overflow-y-auto lg:overflow-hidden ${activeTab === "analyze" ? "lg:grid-cols-[280px_minmax(0,1fr)]" : "lg:grid-cols-[280px_minmax(0,1fr)_380px] xl:grid-cols-[280px_minmax(0,1fr)_400px]"}`}>
            <aside id="ranked-candidates" tabIndex={-1} aria-label="Candidate ranking" className="scroll-thin order-2 hidden min-h-0 overflow-y-auto border-r border-line bg-bg-elev lg:order-1 lg:block">
              {evaluation.error && <div className="p-3"><ErrorNote error={evaluation.error} context="scoring/evaluate" /></div>}
              <RankedList results={evaluation.data?.results} selectedId={selectedId} onSelect={selectSite} isPending={evaluation.isPending} warnings={evaluation.data?.warnings} />
            </aside>
            <div className={`order-1 min-h-[320px] lg:order-2 lg:h-full ${activeTab === "analyze" ? "h-[75vh]" : "h-[62vh]"}`}>{centre}</div>
            {activeTab === "explore" && <div className="order-3 min-h-0 border-t border-line lg:border-l lg:border-t-0">
              <RightSidebar selectedId={selectedId} evaluation={evaluation.data} evaluationPending={evaluation.isPending} mission={evaluation.mission} />
            </div>}
          </div>
        )}
      </main>
    </div>
  );
}
