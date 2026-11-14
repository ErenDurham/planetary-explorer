import { useMemo } from "react";
import { TopNav } from "@/components/layout/TopNav";
import { StatusBanner } from "@/components/layout/StatusBanner";
import { HealthChip } from "@/components/layout/HealthChip";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { AnalyzeView } from "@/components/layout/AnalyzeView";
import { CompareView } from "@/components/layout/CompareView";
import { PlanetViewer, MARS_CONFIG, markerAppearance, type MarkerDatum } from "@/components/globe";
import { useSites } from "@/hooks/useSites";
import { useDefaultMission } from "@/hooks/useDefaultMission";
import { useEvaluation } from "@/hooks/useEvaluation";
import { useAppStore } from "@/store/useAppStore";
import { ErrorNote } from "@/components/ui/ErrorNote";

export default function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
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

  const centre = activeTab === "explore" ? globe : activeTab === "analyze" ? <AnalyzeView sites={sites.data?.sites} evaluation={evaluation.data} selectedId={selectedId} onSelect={selectSite} /> : <CompareView sites={sites.data?.sites} selectedId={selectedId} onSelect={selectSite} />;

  return (
    <div className="flex h-full flex-col">
      <TopNav active={activeTab} onChange={setActiveTab} right={<HealthChip />} />
      <StatusBanner />
      <main className="min-h-0 flex-1">
        {activeTab === "compare" ? (
          <div className="h-full">{centre}</div>
        ) : (
          // Desktop: three columns. Narrow screens: globe first, then the two sidebars stacked.
          <div className="grid h-full grid-cols-1 overflow-y-auto lg:grid-cols-[320px_minmax(0,1fr)_380px] lg:overflow-hidden xl:grid-cols-[340px_minmax(0,1fr)_420px]">
            <div className="order-2 min-h-0 border-t border-line lg:order-1 lg:border-r lg:border-t-0">
              <LeftSidebar defaults={defaults.data} defaultsError={defaults.error} evaluation={evaluation.data} evaluationPending={evaluation.isPending} evaluationError={evaluation.error} selectedId={selectedId} onSelect={selectSite} />
            </div>
            <div className="order-1 h-[52vh] min-h-[320px] lg:order-2 lg:h-full">{centre}</div>
            <div className="order-3 min-h-0 border-t border-line lg:border-l lg:border-t-0">
              <RightSidebar selectedId={selectedId} evaluation={evaluation.data} evaluationPending={evaluation.isPending} mission={evaluation.mission} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
