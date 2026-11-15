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
