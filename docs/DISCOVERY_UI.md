# Discover Earth regions: UI integration

The **Discover** tab is the discovery-v1 interface (`frontend/src/features/discovery/`), built
against the backend-owned contract in [`DISCOVERY_CONTRACT.md`](../DISCOVERY_CONTRACT.md). It is
deliberately separate from the **Established analogs** (the curated Earth sites ranked in Explore):
its own run-scoped store, its own two-feature terrain index, and no write to the curated selection.

## Workflow

Load capabilities → choose an installed survey → **Rank surveyed regions** → inspect a candidate's
evidence → adjust the two terrain weights (the server re-ranks the fixed pool) → export.

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

Navigation: a **Discover** tab in `TopNav`, routing in `App.tsx`, a cue on the Explore page's Earth
analog bar (“These are the established analogs · Discover Earth regions beyond them”), and a
`Tab` union entry in the store. The Astro assistant is hidden on the Discover tab and reports the
nearest contract tab for its context.

## What is shown and what is not

- Every number is the service's: similarity index, distance, factor contributions, terrain-valid
  fraction, counts. The map draws server coordinates only and carries no imagery.
- Each result is labelled **Proposed terrain analog candidate; field validation required.**
- Catalog relationship (outside/within the versioned buffer, nearest listed site, review status) is
  shown as a catalog fact and explicitly not as scientific novelty.
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
