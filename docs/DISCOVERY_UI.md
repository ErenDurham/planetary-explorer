# Find Earth Analogs: UI integration

**Explore** has two modes, joined by one segmented control at the top of the page:

- **Browse Regions**: the featured Mars and Earth regions, including the established analogs
  (the existing globe, candidate list and detail panel).
- **Find Earth Analogs**: the discovery-v1 interface (`frontend/src/features/discovery/`), built
  against the backend-owned contract in [`DISCOVERY_CONTRACT.md`](../DISCOVERY_CONTRACT.md).

There is no separate Discover tab. Find Earth Analogs keeps its own run-scoped store, its own
two-feature terrain index, and never writes to the curated selection. It is reached from the switch,
from a Mars region's detail panel ("Find Earth analogs", enabled for the service's reference region),
from the Earth analog bar in Browse Regions, and from the Research page's candidate panel.

## Layout

Find Earth Analogs uses the same three-column workspace as Browse Regions, drawn by
`DiscoveryView` (the plan is in [`DISCOVERY_EXPLORE_LAYOUT_PLAN.md`](DISCOVERY_EXPLORE_LAYOUT_PLAN.md)):

| column | component | role |
|---|---|---|
| left, 250px | `DiscoveryCandidateList` | one compact row per presented candidate (rank badge in its rank colour, coordinates, the server name, the index, the catalog-relation and research chips), then `WeightControls` and `ExportPanel` |
| centre | `DiscoveryStage` | the Explore chrome (mode switch, heading, lede, the four headline counts, a **Globe / Survey map** toggle, Edit mission), a facts bar (`SurveyPicker`, "Earth was not searched globally", the reference, the established-analogs link, a caption for the current view), then `DiscoveryGlobe` or `SurveyMap` |
| right, resizable | `DiscoveryPanel` inside `SitePanelShell` ("Candidate details") | `DiscoverySurveyPanel` until a candidate is chosen, then `CandidateDetail`; scrolls to the top and flashes on each new selection |

Selection lives in `useDiscoveryStore` (per-run `selectedCandidateId` plus a `selectionRevision`
the globe reads as its focus token) and never touches `selectedEarthId`. A click in the list, on a
globe marker or footprint, or on a map footprint highlights the row, flies the camera and refills
the panel. On narrow screens the list is replaced by a candidate `<select>` in the stage header and
the three cells stack. The shared panel width is passed down from `App` so resizing here and in
Browse Regions is one setting.

### The globe

`DiscoveryGlobe` draws, through `PlanetViewer`'s `overlays` prop and `components/globe/SurfaceOverlays`,
what the schematic map draws: the surveyed bounds as a dashed ring, every sampling centre as a dot,
and each candidate's `footprint_geojson` as a filled ring in its rank colour (clickable). The specs
are built by the pure `lib/globeOverlays.ts` from server coordinates only. Selecting flies the
camera to `FOOTPRINT_FOCUS_DISTANCE` (1.1 radii), close enough to frame a 60 km footprint with the
whole surveyed area in view; `PlanetViewer`'s near plane is 0.02 so the surface is not clipped there.

## Workflow

Explore → Find Earth Analogs → (ranking of the installed survey starts on its own) → select a
candidate from the list, the globe or the map → read its evidence in the right panel →
**Research this candidate** / **Open in Research Prospects** (with the reference region kept as the
selected Mars site). Weights and export are in the left column; the formula, screening funnel,
sources and limitations are in the panel's survey overview before anything is selected.

The stage opens with what a reader needs in five seconds: the reference region, the area of Earth
that was actually searched (label, bounds, approximate size, "Earth was not searched globally"),
and that the results are candidates needing validation. Four headline numbers (locations
evaluated, candidates presented, footprint size, analysis resolution) are read from the rank
response and omitted when the service does not provide them.

### What the evidence panel shows, and where each item comes from

`CandidateDetail` is laid out to let someone decide whether a candidate is worth a field visit
without reading it as a confirmed analog. Scores and factor values come from the **rank response**
(the detail endpoint returns the immutable row with those null); inputs and grid provenance from
the **detail** endpoint; the research dossier is fetched lazily.

| section | fields |
|---|---|
| Identity and status | `display_rank` of `returned_count`, `lat`/`lon_east`, `name`, the fixed proposed-candidate label, `research_status`, `novelty.review_status`, `terrain_valid_fraction` |
| Match to the reference | `similarity_index`, `effective_weights`, `similarityReasons`, and a factor table from `feature_distances` (here / reference / weight / share of the contributions, with scale and distance), then "D = … ; index = 100 / (1 + D)" so the score can be recomputed |
| How it was measured | `profile.measurements`, `profile.grid` (`shape`, `cell_m`, `footprint_m`, `aggregation`, `projection_limit`, support), `terrain_valid_fraction`, `gradient_valid_fraction`, `survey.grid_specification.no_nodata_fill`, `screening_reasons` |
| Relation to known analogs | `novelty.*` worded by `noveltyRelation`, the `buffer_rule` verbatim, the nearest site opened among the established analogs when it is in the Earth catalog |
| What was not compared | `context.climate` as context (scope, resolution, centre, period, source), `context.land_cover`, `geology_status`, then the missing-evidence list |
| Sources and provenance | `source_manifest` grouped by title and institution with tile counts, observation period, retrieval date, licence, hash; `survey.dataset_versions` |
| Limitations and next steps | `limitations` in full, `proposed_field_validation`, and the dossier's `record.status`, question and search counts and `retrieval_status` with a button into Research Prospects |

Deliberately absent: any Earth imagery for a candidate (the contract has none), any probability or
confidence wording, any comparison with the curated five-feature scores, and anything not in the
contract (place names, elevation distributions, access notes).

Surveys are preprocessed offline from cached Copernicus GLO-90 and MOLA terrain and installed as
immutable artifacts. The UI says so and never animates a live search. Ranking is a server-side
re-ordering of that fixed pool; the number of candidates is whatever the service returns after its
diversification rule.

## Where things live

| Path | Role |
|---|---|
| `adapter/` | Aliases of the generated `types/discovery-api.ts`; `HttpDiscoveryService` wraps the backend-owned `services/discoveryEngine.ts` and maps its errors to **unavailable** (network / 503 / 501), **not found** (404) and **rejected** (422 and others, shown verbatim). `setDiscoveryService()` is test-only |
| `hooks/` | `useDiscoveryCapabilities`, `useDiscoveryRank` (query key = engine · run · reference · weights · top_k; stale guard on the echoed `client_request_id`; abort through the query signal), `useDiscoveryCandidate` |
| `store/useDiscoveryStore.ts` | Run id, weight shares, top_k, globe/map view, selection revision, per-run `ranked` flag and selected candidate |
| `lib/globeOverlays.ts` | Pure builder of the globe overlay specs (bounds ring, sampling dots, footprint rings) from server coordinates |
| `components/` | `DiscoveryView` (the workspace), `DiscoveryCandidateList`, `DiscoveryStage`, `DiscoveryPanel`, `DiscoverySurveyPanel`, `CandidateDetail`, `ReferenceCard`, `SurveyPicker`, `SurveyMap` (schematic SVG: boundary, exact sampling centres, server footprints, established catalog sites in view), `DiscoveryGlobe` (centres, footprints, bounds and sampling dots on the existing Earth globe), `SurveyFunnel`, `WeightControls`, `ExportPanel` |

Navigation: `exploreMode` (`browse` | `find_analogs`) in the app store with `openFindAnalogs()`,
`ExploreModeSwitch` rendered by both Explore experiences, routing in `App.tsx`, `FindAnalogsEntry`
in the Mars detail panel, and the cue on the Earth analog bar. The Astro assistant stays available
over Find Earth Analogs with the same insets as Browse Regions.

## What is shown and what is not

- Every number is the service's: similarity index, distance, factor contributions, terrain-valid
  fraction, counts. The map draws server coordinates only and carries no imagery.
- Each result is labelled **Proposed terrain analog candidate; field validation required.** The
  evidence panel explains its index in a sentence ("Terrain similarity: 68.5/100. This reflects how closely … under
  the selected weighting … It is not a probability of scientific suitability."), says why the terrain
  reads as similar and where it differs, lists what was not compared, and carries the research status.
- Catalog relationship is worded plainly ("Not near a location in our current reference catalog …
  The catalog is incomplete, so this is not a claim of novelty"), never as novelty.
- Climate and land cover are context, not scored; geology is reported as not assessed; absent context
  is listed under “Missing evidence”, never filled in.
- Unavailable service, no installed survey, zero eligible regions, a listed run whose artifacts are
  missing, a rejected request and a stale response each have their own state.

## Verification

`npm run typecheck`, `npx vitest run` (discovery tests under `features/discovery/**`), `npm run build`,
and a headless-Chrome walkthrough against the live backend (screenshots in `docs/screenshots/discovery-*.jpg`).

## Candidate deep research

Results and evidence cards now show **Unresearched**, **Research in progress**, or
**Literature reviewed**. A limited desktop check never implies literature review.
**Research this candidate** opens the Research pane on that run/candidate, independent
of curated Earth/Mars selections. Mars site research and the expedition planner remain
available through **Mars site research**.

The candidate workspace contains measured inputs, an investigation brief, targeted
external literature/map/access searches, question-driven local RAG background passages,
and a persistent cited-findings notebook. It does not claim to autonomously browse the
web. Retrieved background is labelled as such; opening/retrieving never advances status.
Only explicitly saving notes changes status. Review completion requires a substantive
summary and a direct or contradictory source finding, still labelled analyst supplied.
Notes persist on the backend and are included in discovery exports; use durable storage
for hosted deployments. Geology, access and field validation remain separate evidence gaps.

Browser verification used isolated data: Discover → ranked candidate → Research dossier → save in-progress notes → return to Discover with updated tag. Real candidate notebooks were not modified. Unsaved notes survive evidence queries; the Mars-context assistant is hidden in the candidate research workspace.
