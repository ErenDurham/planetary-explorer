# Find Unresearched Analogs: UI integration

**Explore** has two modes, joined by one segmented control at the top of the page:

- **Browse Regions**: the featured Mars and Earth regions, including the established analogs
  (the existing globe, candidate list and detail panel).
- **Find Unresearched Analogs**: the discovery-v1 interface (`frontend/src/features/discovery/`), built
  against the backend-owned contract in [`DISCOVERY_CONTRACT.md`](../DISCOVERY_CONTRACT.md).

There is no separate Discover tab. Find Unresearched Analogs keeps its own run-scoped store, its own
two-feature terrain index, and never writes to the curated selection. It is reached from the switch,
from a Mars region's detail panel ("Find Earth analogs", enabled for the service's reference region),
from the Earth analog bar in Browse Regions, and from the Research page's candidate panel.

## The journey (as of 2026-11-15)

A fresh session opens on **Mission Design**, the first of three primary panes (Mission Design →
Explore → Research, with Analyze and Compare behind **Advanced**). The pane is one composer: a
two-sentence account of what the app does with the objective, the objective box as the instrument
of the page, and three example objectives that fill the box, one per supported workflow (new Earth
terrain resembling Jezero through the discovery pilot, the established analogs, Mars landing
screening). Nothing is applied until **Apply objective**; the button says "Reading your mission…"
while the backend reads it, and an unapplied edit is marked "Draft · not applied until you apply it".

Once applied, `MissionNextStep` (`lib/missionRoute.ts`) names the one Explore action the reading
supports and its limits in the same breath: a new-regions objective around Jezero leads to **Explore
candidates** (Find Unresearched Analogs, "a bounded set of surveyed Earth footprints … not a global search");
a new-regions objective around any other reference says plainly that discovery exists only for
Jezero and routes to the established analogs; a landing objective routes to the Mars sites; a reading
with no task asks the user to choose a supported workflow rather than guessing. Jezero's discovery
results are never shown for an objective that did not ask for them. The scoring priorities and the
Earth/Mars mission focus sit under a **Scoring priorities and mission focus** disclosure. Returning to
Mission Design and re-applying keeps research notes and the discovery selection; the next-step card
is disabled while a draft edit is unapplied, so Explore never opens on priorities that belong to an
older objective. There is no first-run modal.

Explore then opens on the routed mode. In **Find Unresearched Analogs** the stage heading is "Find Earth
terrain resembling Jezero." with a one-sentence scope line bound to the run and the response
(footprints sampled, area and size, reference, the two features compared, results shown; "a bounded
pilot, not a global search"), and a line tying it to the applied objective. Browse Regions is the
labelled secondary mode for the established analogs and mission scoring. The first result is
selected once when the first ranking arrives, never over an explicit or cleared selection and never
again on re-ranking (`useDiscoveryStore.autoSelectFirst`).

`TopNav` numbers the three primary steps and names whichever Advanced tool is open; Compare stays
contextual in Explore. On phones the discovery workspace orders the stage header, the candidate
list, then the evidence panel, with the globe or map behind a **Show map** toggle; the whole journey
works with keyboard alone (list rows are buttons; the globe is never required).

Research (`CandidateResearchPanel`) opens with **Back to this candidate in Explore** and the
ranking context the candidate arrived with (rank of returned count, index, weights, from this
session's cached ranking), then the notebook, the research checklist and prepared searches, the
downloadable brief, and only then the background passages. Drafts live in
`useCandidateResearchTarget` keyed by run and candidate, so leaving the tab or re-ranking never
loses them; an unsaved draft is marked, can be discarded, warns before unload, and a failed save
keeps it and says nothing was saved. Each status is explained in `RESEARCH_STATUS_MEANING`; status
changes only on an explicit save under the backend's rule.

**Download research brief** (`lib/researchBrief.ts`) writes one Markdown file from responses
already loaded: candidate, reference and run, ranking settings and measurements, the factor table,
the catalog-relative statement, what was not compared, notes, cited findings with contradictions
listed separately, open questions, sources, background passages labelled as such, and limitations.
Unsaved edits are included and the file is marked DRAFT. The JSON audit export is unchanged;
neither path calls save.

Screenshots: `docs/screenshots/mission-{design,applied,unsupported,phone}.jpg`, `globe-{earth,mars}.jpg` and
`docs/screenshots/discovery-journey-{explore,research,phone,pages-restored}.jpg`
(the last one is the GitHub Pages build after a reload, with saved notes restored from browser
storage). `features/discovery/journey.test.tsx` covers default results → selection → research →
save → return with status → export, re-ranking with an explicit selection, a draft surviving the
round trip, a listed survey whose artifacts are missing, a failed save, and the Advanced menu.
`components/mission/MissionObjective.test.tsx` and `App.test.tsx` cover the fresh session opening on
Mission Design, a supported objective leading to Explore candidates, the honest route for an
unsupported reference, the choose-a-task case, and a return to edit keeping research notes.

## Dropped pin (score any point)

Beneath the ranked candidates sits **Score a dropped pin** (`components/PinProbePanel.tsx`). A click on
empty survey map or on the globe surface places a pin (`SurveyMap` pointer gestures with a 4 px drag
threshold; `PlanetViewer`'s new `onPickSurface`, which ignores an orbit drag); dragging the pin on the
map moves it; the panel's latitude/longitude form is the keyboard route. The pin lives in the discovery
store per run (`setPin`, kept to four decimals so the query key is stable) and never touches the curated
selection or the ranked list.

`hooks/useDiscoveryProbe.ts` calls `POST /discovery/probe` with the run, the pin and the SAME weights
the ranking uses, re-scores when the pin or a weight changes, and keeps the previous result on screen
only while the same pin is re-weighted. The service measures a 60 km footprint at the pin with the
survey's own terrain pipeline and scores it with the ranking's formula (DISCOVERY_CONTRACT.md,
"Dropped-pin probe"). The panel shows exactly what came back: the index, where the pin would sit among
the surveyed candidates under the current weights (context, not a rank), whether it is inside the
surveyed area, the catalog relationship, the measured features against the reference, and the
limitations; when the service could not score it (`terrain_unavailable`, `insufficient_terrain_coverage`,
`features_unavailable`) the service's reasons are shown and no number is. The map draws the measured
footprint dashed in the pin colour; the globe draws the pin as its own marker and footprint ring, never
pickable as a candidate.

By default the API reads terrain from its verified tile cache only, so pins inside or near the surveyed
regions score and others report terrain unavailable; `DISCOVERY_PROBE_FETCH=true` on a local API enables
on-demand tile fetching. On the GitHub Pages build (no raster libraries) the panel shows "Pin scoring is
not available here" and the ranking is unaffected. Tests: `PinProbePanel.test.tsx`, the two pin cases in
`DiscoveryView.test.tsx`, `store/useDiscoveryStore.test.ts` (per-run pin), `lib/geo.test.ts` (`unproject`),
`components/globe/geo.test.ts` (`vector3ToLatLon`), and `backend/tests/test_discovery_probe.py`. Screenshots against the
live local API: `docs/screenshots/discovery-pin-{map,globe}.jpg`.

## Layout

Find Unresearched Analogs uses the same three-column workspace as Browse Regions, drawn by
`DiscoveryView` (the plan is in [`DISCOVERY_EXPLORE_LAYOUT_PLAN.md`](DISCOVERY_EXPLORE_LAYOUT_PLAN.md)):

| column | component | role |
|---|---|---|
| left, 250px | `DiscoveryCandidateList` | one compact row per presented candidate (rank badge in its rank colour, coordinates, the server name, the index, the catalog-relation and research chips), then `WeightControls` and `ExportPanel` |
| centre | `DiscoveryStage` | the Explore chrome (mode switch, heading, lede, the four headline counts, a **Globe / Survey map** toggle, Edit mission), a facts bar (`SurveyPicker`, "Earth was not searched globally", the reference, the established-analogs link, a caption for the current view), then `DiscoveryGlobe` or `SurveyMap` |
| right, resizable | `DiscoveryPanel` inside `SitePanelShell` ("Candidate details") | `DiscoverySurveyPanel` when nothing is selected, otherwise `CandidateDetail`: What matches, What differs, What we still need to investigate, then Methods and data disclosures; scrolls to the top and flashes on each new selection |

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

Explore → Find Unresearched Analogs → (ranking of the installed survey starts on its own) → select a
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
over Find Unresearched Analogs with the same insets as Browse Regions.

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

The mode label refers to research status recorded in this app, not scientific
novelty. The shared mode switch is the only cross-view navigation in the survey
header; a short map key lives beside the candidate list instead of above the
globe. Candidate research badges remain authoritative for each footprint.
