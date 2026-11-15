# Shared region analysis and comparison

Discovered footprints now have **Analyze region** and **Compare region** actions
in their evidence panel. They open a shared raw-measurement workspace instead of
putting discovery IDs into curated selection fields or Mars mission evaluations.

The workspace also accepts catalog Earth/Mars regions. Normal Advanced → Compare
navigation carries the current Explore discovery selection (including its run),
even after an earlier catalog comparison. With no selection, the Compare entry
shows a grouped chooser of found survey footprints and catalog regions; it never
silently substitutes the first established site. Existing Analyze and catalog
imagery tools also have explicit entry actions into the shared workspace. The original mission-fit analysis
and imagery comparison remain available through “Use established mission tools.”

## Shared modules

- `features/regions/RegionActions.tsx`: the same Analyze/Compare entry buttons in
  discovered and existing Earth/Mars detail panels.
- `features/regions/model.ts`: normalizes catalog and discovered measured profiles;
  namespaces identities by source/run; preserves missing values; computes signed
  descriptive differences only for regional slope and relief with compatible
  units and a shared processing baseline. Unit conversion occurs before rounding.
- `features/regions/RegionMeasurements.tsx`: one measurement table for all sources.
- `features/regions/RegionWorkspace.tsx`: shared selection, profile retrieval,
  comparison, sources/method disclosures, research navigation and JSON download.
- `features/regions/store.ts`: explicit region target; independent of curated IDs,
  discovery ranking state and notebook drafts.

Uses existing typed endpoints and transport. No API changes, source dataset
acquisition, new model scores or new backend dependencies. It works in local API
mode and through the GitHub Pages Python worker.

## What is supported

- Analyze a discovered footprint's measured inputs, coverage and provenance.
- Compare with the run's physically processed Jezero reference.
- Compare two eligible, measured footprints within that same run.
- View discovered and catalog Earth/Mars profiles side by side.
- Switch the selected region between catalog and discovered sources while
  retaining the survey context; jump to the discovered candidate's research.
- Download the displayed measured context and limitations as JSON.

The survey picker includes eligible audit footprints, not just the spatially
separated shortlist; it does not assign them new ranks. Screening exclusions
are not promoted into candidates.

## Scientific limits

Discovery/catalog processing baselines differ. Their values may be inspected
side by side, but the UI suppresses deltas and does not create a combined index.
Elevation differences are suppressed because datums differ. Missing measurements
remain unavailable. Catalog origin does not certify geological equivalence.

This is measured terrain analysis, not new landing-safety/mission-fit scoring for
Earth footprints, mineral inference, route planning or field validation. A future
methodological project could reprocess catalog footprints on the exact discovery
physical grid to permit more direct numerical comparison; that is not silently
assumed here. Existing scientific scores and artifacts are unchanged.

## Verification

Frontend tests cover run-scoped identity, missing values, compatible/incompatible
units, baseline mismatch, real-profile adapters, candidate Analyze/Compare actions,
shared catalog/discovery table behavior and missing-artifact errors.

A headless browser exercised Explore → Analyze → Compare with the real installed
Morocco candidate and processed Jezero profile through a local API. It also
switched to a catalog Earth region and verified the baseline warning. At 390px,
the document width remained 390px; wide measurement tables scroll internally.
This is software verification, not scientific or field validation.

Regression coverage includes the actual App Advanced → Compare navigation and
the no-selection chooser, not only the candidate-panel action. A real-data
headless browser check exercised the same ordinary menu path.

## Original Compare atlas restored

Compare always renders the original `CompareView` / `CompareAtlasHeader` /
`AtlasPairSelectors` / imagery panels and numbered field-note sections. Found
footprints appear in the existing Earth selector under “Found survey regions.”
`useAtlasDiscovery` and `atlasAdapter` supply measured survey data to that shared
layout without adding discovered IDs to the curated catalog or scoring API.

A found footprint uses its survey-processed Jezero reference for the discovery
index and physical-grid deltas. Other Mars choices retain raw contextual
measurements and explicitly suppress incompatible scores/differences. Verified
Earth imagery is unavailable until an actual manifest is installed; no catalog
photographs are borrowed. Mars imagery, column swap, image zoom, planetary
context, sources and research navigation retain the original page components.

The former simplified Compare replacement/chooser is no longer a route.
Regression tests cover the original atlas with a selected discovered footprint,
switching between found/catalog regions, missing imagery, disabling curated API
scoring for found IDs, and choosing an unsupported discovery reference.

## Analyze restored and navigation consolidated

The simplified RegionWorkspace page has been removed. Applicable catalog mission
evaluations use the existing AnalyzeView or MissionAssessmentDetail. Found regions
use the same analysis heading and card structure: decision summary, measured
factor contributions, same-survey alternatives, live terrain-weight sensitivity,
evidence gaps and sources. They are never presented as landing-suitability scores.

Research status in artifact-backed views uses the saved candidate notebook status
when available, rather than treating every immutable survey row as unresearched.

Redundant navigation removed across the interface:
- Discovery and Browse headers rely on the shared mode switch.
- Candidate evidence has one Research action, rather than a second “Open in Research.”
- Analyze has no self-link to another measurements page or redundant Explore link.
- The Research cover no longer repeats links to sections and expedition controls
  already present below it; the actual evidence and expedition actions remain.
- The Explore toolbar no longer duplicates the candidate's Compare action.
- Contextual next-stage actions, per-location globe actions, source citations,
  exports and recovery actions remain available.
