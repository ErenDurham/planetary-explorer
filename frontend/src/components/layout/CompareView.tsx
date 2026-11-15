import { useAtlasDiscovery } from "@/features/regions/useAtlasDiscovery";
import { useDiscoveryStore } from "@/features/discovery/store/useDiscoveryStore";
import { useCandidateResearchTarget } from "@/features/discovery/store/useCandidateResearchTarget";
import { useDiscoveryRank } from "@/features/discovery/hooks/useDiscoveryRank";
import { RegionMeasurements } from "@/features/regions/RegionMeasurements";
import { catalogRegion } from "@/features/regions/model";
import { downloadJson } from "@/features/discovery/lib/download";
import { StageButton } from "@/components/ui/StageButton";
import { useRegionTarget } from "@/features/regions/store";
// Compare: two linked location columns, Earth and Mars, for one hand-selected
// pair. Order follows the applied objective (selection body first, reference
// body second); a swap button reorders the display only. The page leads with
// the pair, the reference context line and the side-by-side visual field views,
// then the pair's similarity index from POST /analogs/rank, then aligned
// measurements, planetary context (never folded into the index), what the pair
// can help test, and the provenance / method / limitation disclosures. The Moon
// catalogue data and helpers are kept but not offered in this release.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/services/api";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { Spinner } from "@/components/ui/Spinner";
import type { PairColumnData } from "@/components/compare/PairSelectors";
import { AtlasSurface, AtlasSection } from "@/components/atlas/AtlasSurface";
import atlasStyles from "@/components/atlas/atlas.module.css";
import { CompareAtlasHeader, AtlasPairSelectors as PairSelectors } from "@/components/atlas/CompareAtlas";
import { AnalogPreferencesSlot } from "@/components/compare/AnalogPreferencesSlot";
import { SimilarityCard } from "@/components/compare/SimilarityCard";
import { PairMetricsTable } from "@/components/compare/PairMetricsTable";
import { PairConditionsTable } from "@/components/compare/PairConditionsTable";
import { PlanetaryContext } from "@/components/compare/PlanetaryContext";
import { PairStudies } from "@/components/compare/PairStudies";
import { ProvenanceDisclosures } from "@/components/compare/ProvenanceDisclosures";
import { ImagePane, VIEW_LABEL, entriesFor, type PaneLocation, type PaneView } from "@/components/imagery/ImagePane";
import { usePairImagery, type PaneImagery } from "@/hooks/usePairImagery";
import { usePairMatch } from "@/hooks/usePairMatch";
import { canMatchScale, emphasisSummary, footprintHalfWidthDeg, linkedZoom, metresPerPixel, pairColumns } from "@/lib/comparison";
import { BODY_NAME, defaultAnalogShares, otherBody, toAnalogShares, type Body } from "@/lib/analogFeatures";
import { sharesEqual } from "@/lib/allocation";
import type { ComparisonLocation, ImageryEntry, Site } from "@/types";

const DEFAULT_HALF_WIDTH: Record<Body, number> = { earth: 0.25, mars: 0.5 };

function pick(locations: ComparisonLocation[], ...candidates: (string | null | undefined)[]): ComparisonLocation | null {
  for (const id of candidates) { const hit = id ? locations.find(l => l.id === id) : undefined; if (hit) return hit; }
  return locations[0] ?? null;
}

export function currentEntry(imagery: PaneImagery, view: PaneView, choice: string | undefined): ImageryEntry | null {
  const entries = entriesFor(imagery.data, view);
  return entries.find(e => e.entry_id === choice) ?? entries[0] ?? null;
}

export function CompareView({ sites, selectedId }: { sites: Site[] | undefined; selectedId: string | null; onSelect?: (id: string) => void }) {
  const openRegion = useRegionTarget(s=>s.open);
  const discovery=useAtlasDiscovery();
  const discoveryStore=useDiscoveryStore();
  const openResearch=useCandidateResearchTarget(s=>s.open);
  const q = useQuery({ queryKey: ["comparison-catalog"], queryFn: api.comparisonCatalog, staleTime: Infinity });
  const selectionBody = useAppStore(s => s.selectionBody);
  const appliedReference = useAppStore(s => s.appliedReference);
  const selectedEarthId = useAppStore(s => s.selectedEarthId);
  const selectedMarsId = useAppStore(s => s.selectedMarsId);
  const legacyEarthId = useAppStore(s => s.comparison.earthId);
  const selectLocation = useAppStore(s => s.selectLocation);
  const showOnGlobe = useAppStore(s => s.showOnGlobe);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const analogWeights = useAppStore(s => s.analogWeights);
  const recommendedAnalogWeights = useAppStore(s => s.recommendedAnalogWeights);

  const [swapped, setSwapped] = useState(false);
  const [sharedView, setSharedView] = useState<PaneView>("orbital");
  const [overrides, setOverrides] = useState<Partial<Record<Body, PaneView | null>>>({});
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [zooms, setZooms] = useState<Record<string, number>>({});
  const [linked, setLinked] = useState(false);
  const [fitHeights, setFitHeights] = useState<Record<Body, number | null>>({ earth: null, mars: null });

  const data = q.data;
  const bodies = data?.bodies ?? [];
  const earthLocs = [...(data?.locations.filter(l=>l.body==="earth") ?? []),...discovery.regions.map(r=>r.location)];
  const baseMarsLocs = useMemo(() => data?.locations.filter(l => l.body === "mars") ?? [], [data]);
  const marsLocs = discovery.referenceLocation && !baseMarsLocs.some(l=>l.id==="jezero_crater") ? [...baseMarsLocs,discovery.referenceLocation] : baseMarsLocs;
  const discoveredSelection=discovery.target?.kind==="discovered";
  const selectedFound=discoveredSelection ? discovery.regions.find(r=>r.candidateId===discovery.target?.id) : undefined;
  const earth = discoveredSelection ? selectedFound?.location ?? null : pick(earthLocs, discovery.target?.kind==="catalog" ? discovery.target.id : null, selectedEarthId, appliedReference?.body === "earth" ? appliedReference.id : null, legacyEarthId);
  const catalogMars = pick(marsLocs, discovery.target?.kind==="catalog" ? discovery.target.id : null, discoveredSelection ? "jezero_crater" : null, selectedMarsId, selectedId, appliedReference?.body === "mars" ? appliedReference.id : null);
  const [discoveryMarsId,setDiscoveryMarsId]=useState<string|null>(null);
  const chosenMars=discoveredSelection ? (marsLocs.find(l=>l.id===(discoveryMarsId ?? "jezero_crater")) ?? null) : catalogMars;
  const mars=discoveredSelection && chosenMars?.id==="jezero_crater" && discovery.referenceLocation ? discovery.referenceLocation : chosenMars;
  const comparisonFocus=discoveredSelection ? "earth" : selectionBody;
  const ranked=useDiscoveryRank(discovery.runId ?? null,discoveryStore.weights,discoveryStore.topK,discoveredSelection && mars?.id==="jezero_crater");
  const foundRank=ranked.data?.candidates.find(c=>c.id===selectedFound?.candidateId);
  const byBody: Record<Body, { location: ComparisonLocation | null; locations: ComparisonLocation[] }> = { earth: { location: earth, locations: earthLocs }, mars: { location: mars, locations: marsLocs } };
  const setComparisonPair = useAppStore(s => s.setComparisonPair);
  useEffect(() => {
    setComparisonPair({earthId: discoveredSelection ? null : earth?.id ?? null, marsId: mars?.id ?? null});
  }, [earth?.id, mars?.id, discoveredSelection, setComparisonPair]);
  useEffect(() => () => setComparisonPair(null), [setComparisonPair]);
  const columns = pairColumns(comparisonFocus, swapped).map(c => ({ ...c, ...byBody[c.body] })) as [PairColumnData, PairColumnData];
  const selectedCol = columns.find(c => c.role === "selected")!;
  const referenceCol = columns.find(c => c.role === "reference")!;

  const pair = usePairMatch({ enabled:!discoveredSelection, referenceBody: referenceCol.body, referenceId: referenceCol.location?.id ?? null, candidateId: selectedCol.location?.id ?? null, marsId: mars?.id ?? null, earthId: earth?.id ?? null });
  const catalogImagery = usePairImagery({earth:discoveredSelection ? null : earth?.id ?? null,mars:mars?.id ?? null});
  const imagery={...catalogImagery,earth:discoveredSelection ? {...catalogImagery.earth,id:earth?.id ?? null,status:"unavailable" as const,canRetry:false,reason:"No verified orbital imagery or field photographs are installed for this survey footprint.",refetch:()=>{}} : catalogImagery.earth};
  const measuredReference=selectedFound && mars?.id==="jezero_crater" ? discovery.reference : mars ? catalogRegion(mars) : null;
  const selectPairLocation=(body:Body,id:string)=>{
    const found=discovery.regions.find(r=>r.location.id===id);
    if(body==="earth" && found){openRegion({kind:"discovered",id:found.candidateId,runId:discovery.runId});if(discovery.runId){discoveryStore.setRun(discovery.runId);useDiscoveryStore.getState().selectCandidate(found.candidateId);}setDiscoveryMarsId(null);}
    else if(body==="earth"){openRegion({kind:"catalog",id});selectLocation(body,id);}
    else if(discoveredSelection){setDiscoveryMarsId(id);}
    else {selectLocation(body,id);if(discovery.target?.kind==="catalog" && marsLocs.some(l=>l.id===discovery.target?.id))openRegion({kind:"catalog",id});}
  };
  const showPairOnGlobe=(body:Body,id:string)=>{
    const found=discovery.regions.find(r=>r.location.id===id);
    if(body==="earth" && found && discovery.runId){discoveryStore.setRun(discovery.runId);discoveryStore.selectCandidate(found.candidateId);useAppStore.getState().openFindAnalogs();}
    else showOnGlobe(body,id);
  };

  const paneLocation = (body: Body): PaneLocation | null => {
    const loc = byBody[body].location; if (!loc) return null;
    const halfWidthDeg = body === "mars" ? (sites?.find(s => s.id === loc.id)?.footprint.half_width_deg ?? footprintHalfWidthDeg(loc, DEFAULT_HALF_WIDTH.mars)) : footprintHalfWidthDeg(loc, DEFAULT_HALF_WIDTH.earth);
    return { body, id: loc.id, name: loc.name, lat: loc.lat, lonEast: loc.lon_east, halfWidthDeg };
  };
  const viewFor = (body: Body): PaneView => overrides[body] ?? sharedView;
  const keyFor = (body: Body) => `${byBody[body].location?.id ?? "none"}:${viewFor(body)}`;
  const entryFor = (body: Body) => currentEntry(imagery[body], viewFor(body), choices[keyFor(body)]);
  const zoomFor = (body: Body) => zooms[keyFor(body)] ?? 1;
  const canLink = canMatchScale(entryFor(columns[0].body), entryFor(columns[1].body));
  const linkedActive = linked && canLink;
  const mppFit = (body: Body) => metresPerPixel(entryFor(body)?.bounds, fitHeights[body], body);

  const setZoom = useCallback((body: Body, z: number, follow: boolean) => {
    setZooms(prev => {
      const next = { ...prev, [keyFor(body)]: z };
      if (follow) {
        const other = otherBody(body);
        const link = linkedZoom(z, mppFit(body), mppFit(other));
        if (link) next[keyFor(other)] = link.zoom;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choices, overrides, sharedView, earth?.id, mars?.id, fitHeights, imagery.earth.data, imagery.mars.data]);

  const toggleLink = (on: boolean) => {
    setLinked(on);
    if (on && canLink) setZoom(columns[0].body, zoomFor(columns[0].body), true);
  };
  const changeSharedView = (v: PaneView) => { setSharedView(v); setOverrides({}); };
  const onFitHeight = useCallback((body: Body) => (h: number | null) => setFitHeights(prev => (prev[body] === h ? prev : { ...prev, [body]: h })), []);
  const fitEarth = useMemo(() => onFitHeight("earth"), [onFitHeight]);
  const fitMars = useMemo(() => onFitHeight("mars"), [onFitHeight]);

  const shares = toAnalogShares(analogWeights);
  const baseline = recommendedAnalogWeights ? toAnalogShares(recommendedAnalogWeights) : defaultAnalogShares();
  const customised = !sharesEqual(shares, baseline);
  const referenceName = referenceCol.location?.name ?? `a ${BODY_NAME[referenceCol.body]} location`;
  const linkNote = linkedActive ? "Scale linked: both panes show the same ground metres per screen pixel." : null;
  const linkDisabledReason = canLink ? null : sharedView === "surface" || viewFor("earth") === "surface" || viewFor("mars") === "surface"
    ? "Field photographs have no map scale, so their zoom cannot be linked."
    : "Both panes need georeferenced orbital imagery (image bounds) before scales can be linked.";

  return <AtlasSurface label="Earth and Mars pair comparison">
    <div className={atlasStyles.content}>
      <CompareAtlasHeader focusBody={comparisonFocus} />
      {q.isPending && <Spinner label="Loading comparison locations" />}
      {q.error && <div className="mb-4"><ErrorNote error={q.error} context="comparison/catalog" /><button className="mt-3 text-sm text-copper-bright underline" onClick={() => q.refetch()}>Retry comparison</button></div>}
      {discovery.artifact.isFetching && <p role="status" className="mb-3 text-sm text-fg-muted">Loading found survey regions…</p>}
      {discovery.artifact.error && <ErrorNote error={discovery.artifact.error} context="found survey regions"/>}
      {discovery.capabilities.error && <p className="mb-3 text-sm text-fg-muted">Found survey regions are unavailable. Established catalog regions remain available.</p>}
      {data && <div className="space-y-4">
        <PairSelectors columns={columns} swapped={swapped} onSwap={() => setSwapped(s => !s)} onSelect={selectPairLocation} onShowOnGlobe={showPairOnGlobe} />

        <AtlasSection number="01" title="Read the landscape" description="Orbital views show regional context. Field photos offer a view from the ground.">
        <section aria-label="Side-by-side visual field views" className={atlasStyles.imagery}>
          <div className={atlasStyles.imageryToolbar}>
            <div className="flex flex-wrap gap-1 rounded border border-line p-1" role="group" aria-label="Imagery view for both panes">
              {(["orbital", "surface"] as const).map(v => <button key={v} type="button" aria-pressed={sharedView === v} onClick={() => changeSharedView(v)} className={`rounded px-3 py-1.5 text-sm ${sharedView === v ? "bg-copper/15 text-copper-bright" : "text-fg-muted hover:bg-bg-elev-2"}`}>{VIEW_LABEL[v]}</button>)}
            </div>
            <div className="flex flex-col items-end gap-0.5 text-xs">
              <label className={`flex items-center gap-2 ${canLink ? "text-fg" : "text-fg-faint"}`}>
                <input type="checkbox" checked={linkedActive} disabled={!canLink} onChange={e => toggleLink(e.target.checked)} aria-describedby="match-scale-note" />Match scale (link metres per screen pixel)
              </label>
              <span id="match-scale-note" className="text-fg-faint">{linkDisabledReason ?? "Default is independent zoom; linking keeps both panes at one ground scale."}</span>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2" data-testid="panes">
            {columns.map(c => {
              const body = c.body;
              return <ImagePane key={`${body}:${c.location?.id ?? "none"}`} roleLabel={c.label} location={paneLocation(body)} imagery={imagery[body]} view={viewFor(body)} sharedView={sharedView} onOverrideView={v => setOverrides(o => ({ ...o, [body]: v }))} entryId={choices[keyFor(body)] ?? null} onEntryChange={id => setChoices(ch => ({ ...ch, [keyFor(body)]: id }))} zoom={zoomFor(body)} onZoomChange={z => setZoom(body, z, linkedActive)} onFitHeight={body === "earth" ? fitEarth : fitMars} linkNote={linkNote} />;
            })}
          </div>
        </section>
        </AtlasSection>

        <section aria-label="Reference context" className={atlasStyles.reference}>
          <p className="text-sm text-fg" data-testid="context-line">
            <span className="text-fg-muted">Reference:</span> <span className="font-medium">{referenceName}</span> on {BODY_NAME[referenceCol.body]}
            {!discoveredSelection && <><span className="text-fg-muted"> · analog preferences: </span><span className="num">{emphasisSummary(shares)}</span> <span className="text-fg-faint">({customised ? "customised" : recommendedAnalogWeights ? "objective's suggestion" : "spec defaults"})</span></>}
          </p>
          {appliedReference && appliedReference.id !== (byBody[appliedReference.body].location?.id ?? null) && <p className="mt-1 text-xs text-fg-muted">The applied objective named {appliedReference.name} on {BODY_NAME[appliedReference.body]}; the {BODY_NAME[appliedReference.body]} selector now shows {byBody[appliedReference.body].location?.name ?? "nothing"}. The objective itself is unchanged.</p>}
          {discoveredSelection ? <p className="mt-2 text-sm text-fg-muted">Discovery uses regional slope and relief on the survey's physical grid. Change terrain weights in Explore. Curated five-feature scores are separate. Mars imagery is catalog context; its dashed overlay shows the catalog footprint, not the discovery grid.</p> : <details className="mt-2 text-sm"><summary className="cursor-pointer text-fg-muted">Adjust analog preferences</summary><div className="mt-3 max-w-2xl"><AnalogPreferencesSlot /></div></details>}
        </section>

        <AtlasSection number="02" title="Understand the match" description={discoveredSelection ? "Regional terrain similarity under the discovery weights." : "A similarity index for this pair under your current analog preferences."}>
        {discoveredSelection ? <section className="rounded border border-line p-4" aria-label="Discovery terrain match"><h2 className="font-semibold">Terrain similarity to {mars?.name ?? "Mars reference"}</h2>{foundRank && mars?.id==="jezero_crater" ? <><p className="num mt-2 text-3xl text-copper-bright">{foundRank.similarity_index?.toFixed(1)} / 100</p><p className="mt-2 text-sm text-fg-muted">Discovery similarity index over the survey's declared features · not a probability.</p></> : <p className="mt-2 text-sm text-fg-muted">{mars?.id!=="jezero_crater" ? "Discovery scoring supports the processed Jezero reference only. This pair is a measurement comparison." : ranked.isFetching ? "Loading this candidate's terrain comparison…" : "This footprint is not in the current diversified ranking. Its measured profile remains available below."}</p>}{ranked.error && <ErrorNote error={ranked.error} context="discovery comparison"/>}</section> : <div className={atlasStyles.evidence}><SimilarityCard rank={pair.rank} candidate={pair.candidate} candidateBody={selectedCol.body} candidateName={selectedCol.location?.name ?? BODY_NAME[selectedCol.body]} referenceName={referenceName} /></div>}
        </AtlasSection>

        <AtlasSection number="03" title="Compare the measurements" description="Raw values stay in their original units. Unavailable measurements remain explicit.">
        {discoveredSelection ? selectedFound ? <><RegionMeasurements atlas region={selectedFound.region} other={measuredReference ?? undefined}/>{measuredReference && selectedFound.region.baseline!==measuredReference.baseline && <p className="mt-2 text-sm text-warn">Different processing baselines: values are contextual; numerical differences and combined scores are unavailable.</p>}<button className="mt-3 text-info underline" onClick={()=>downloadJson("region-comparison.json",{selected:selectedFound.region,comparison:measuredReference,run_id:discovery.runId,ranking:foundRank ?? null})}>Download measured comparison</button></> : <p role="status">The selected survey footprint is loading or unavailable. No catalog region has been substituted.</p> : <PairMetricsTable columns={columns} candidate={pair.candidate} rankExcluded={pair.rank.data?.excluded_features ?? []} />}
        </AtlasSection>

        <AtlasSection number="03b" title="Reported conditions" description="What the cited literature reports for each location, side by side. Text only; not part of the index.">
        <PairConditionsTable columns={columns} />
        </AtlasSection>

        <AtlasSection number="04" title="Take the research further">
        {discoveredSelection ? <section className="rounded border border-line p-4"><p className="mb-3 text-sm text-fg-muted">Review prior studies, geology and contradictory evidence for this footprint. Terrain similarity does not establish a validated analog.</p><StageButton disabled={!selectedFound} onClick={()=>{if(discovery.runId && selectedFound){openResearch(discovery.runId,selectedFound.candidateId);setActiveTab("research");}}}>Research this candidate</StageButton></section> : <div className={atlasStyles.evidence}><PairStudies pairMatch={pair.pairMatch} earthName={earth?.name ?? "the Earth location"} marsName={mars?.name ?? "the Mars site"} pending={pair.match.isPending} onOpenResearch={() => setActiveTab("research")} /></div>}
        </AtlasSection>
        {pair.match.error && <ErrorNote error={pair.match.error} context="analogs/match" />}

        <AtlasSection number="05" title="Context and sources" description="Review planetary differences, data provenance, and limits before drawing conclusions.">
        <PlanetaryContext differences={pair.rank.data?.planetary_differences ?? pair.match.data?.planetary_differences} bodies={bodies} />

        <ProvenanceDisclosures columns={columns} bodies={bodies} rank={pair.rank.data} pairMatch={pair.pairMatch} imagery={[imagery.earth.data, imagery.mars.data]} discovery={discoveredSelection} />
        </AtlasSection>
      </div>}
    </div>
  </AtlasSurface>;
}
