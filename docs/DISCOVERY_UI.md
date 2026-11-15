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

## Workflow

Explore → Find Earth Analogs → (ranking of the installed survey starts on its own) → inspect a
candidate → **Research this candidate** (Research Prospects, with the reference region kept as the
selected Mars site) → Method & Data for weights, formula, screening audit, sources and export.

The page opens with what a reader needs in five seconds: the reference region, the area of Earth
that was actually searched (label, bounds, approximate size, "Earth was not searched globally"),
what was compared, and that the results are candidates needing validation. Four headline numbers
(locations evaluated, candidates presented, footprint size, analysis resolution) are read from the
rank response and omitted when the service does not provide them.

Surveys are preprocessed offline from cached Copernicus GLO-90 and MOLA terrain and installed as
immutable artifacts. The UI says so and never animates a live search. Ranking is a server-side
re-ordering of that fixed pool; the number of candidates is whatever the service returns after its
diversification rule.

## Where things live

| Path | Role |
|---|---|
| `adapter/` | Aliases of the generated `types/discovery-api.ts`; `HttpDiscoveryService` wraps the backend-owned `services/discoveryEngine.ts` and maps its errors to **unavailable** (network / 503 / 501), **not found** (404) and **rejected** (422 and others, shown verbatim). `setDiscoveryService()` is test-only |
| `hooks/` | `useDiscoveryCapabilities`, `useDiscoveryRank` (query key = engine · run · reference · weights · top_k; stale guard on the echoed `client_request_id`; abort through the query signal), `useDiscoveryCandidate` |
| `store/useDiscoveryStore.ts` | Run id, weight shares, top_k, map/globe view, per-run `ranked` flag and selected candidate |
| `components/` | `SurveyPicker`, `SurveyMap` (schematic SVG: boundary, exact sampling centres, server footprints, established catalog sites in view), `DiscoveryGlobe` (candidate centres on the existing Earth globe), `SurveyFunnel` (counts, exclusion reasons, grid/footprint spec, dataset versions, source period), `WeightControls`, `CandidateList`, `CandidateDetail`, `ExportPanel` |

Navigation: `exploreMode` (`browse` | `find_analogs`) in the app store with `openFindAnalogs()`,
`ExploreModeSwitch` rendered by both Explore experiences, routing in `App.tsx`, `FindAnalogsEntry`
in the Mars detail panel, and the cue on the Earth analog bar. The Astro assistant is hidden while
Find Earth Analogs is shown.

## What is shown and what is not

- Every number is the service's: similarity index, distance, factor contributions, terrain-valid
  fraction, counts. The map draws server coordinates only and carries no imagery.
- Each result is labelled **Proposed terrain analog candidate; field validation required.** Each card
  explains its index in a sentence ("Terrain similarity: 68.5/100. This reflects how closely … under
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
