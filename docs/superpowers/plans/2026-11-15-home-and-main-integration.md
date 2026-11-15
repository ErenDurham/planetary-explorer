# Home and main integration

Goal: introduce the product and provide useful entry points without another mandatory onboarding step.

## Updated assessment
Main 7247cfa already consolidates Discover under Explore, reduces navigation to Mission Design / Explore / Research, adds evidence-first candidate detail and session drafts, introduces research-brief export, and updates the catalog from the Lesser-Known Mars Sites workbook. These improvements supersede our older standalone Discover layout. Retain the run-scoped three-candidate shortlist and clearer export labels, plus responsive navigation, visible research modes, and pending-save draft protection.

The previous comparison remains relevant for first-run explanation and readable information hierarchy, but no longer for disconnected discovery/research navigation or missing brief output. Moon coverage and broader global matching are still outside this build; Home must not imply those exist.

## References inspected before implementation
- NASA Eyes: https://science.nasa.gov/eyes/ — actionable exploration examples instead of a list of technical features.
- Global Nature Watch: https://globalnaturewatch.org/ — leads with purpose and task-specific entry points.
- Zooniverse: https://www.zooniverse.org/ — concise purpose followed by a concrete route into research.
- Earth Analogs: https://earth-analogs.vercel.app/explore/moon and /calculations — progressive disclosure and explicit Earth/planet relationship.

## Design
Use the existing warm atlas palette and typography. Home is the initial tab; the product title returns Home. Existing three-stage navigation and Advanced tools remain. One primary action opens Mission Design without overwriting any objective. Secondary exploration routes open established regions or the fixed Jezero discovery pilot. A restrained Earth–Mars visual uses the existing attributed reference mosaics, with no invented scientific measurements or landmarks. A short three-step explanation connects mission → explore → research and states the actual output. A compact disclosure explains deterministic scores, AI explanations and the limits of analog matching. Returning users see their applied objective and can reopen their current notebook. Home requires neither backend nor AI access to render; no modal, new dependency, autoplay or new scientific model.

## Implementation and validation
- [x] Preserve local work in backup branch/stash; merge main, preferring its integrated architecture.
- [x] Preserve shortlist and exports; run integrated baseline tests/build.
- [x] Add failing Home navigation/state-preservation and save-race tests.
- [x] Add Home component, scoped styling, initial view and accessible Home navigation; preserve mounted objective and Astro state.
- [x] Reapply small local usability improvements to latest components; no duplicate draft store.
- [x] Verify frontend suite/typecheck/build and backend suite for merged changes.
- [x] Exercise real navigation, pilot → research, keyboard, phone/tablet layout, reduced motion, missing services, and visual hierarchy in the browser. Iterate as needed.

Work stays on jasmine/discover-workbench. Do not push or deploy.

## Results
- Merged origin/main at 7247cfa into the existing feature branch in 038c0c4. Original branch and pre-merge local edits remain recoverable in a backup branch and stash. No push.
- Restored shortlist functionality in the new evidence pane rather than reviving the standalone Discover tab. Main already includes navigation-persistent drafts; retained that implementation and added immutable save snapshots to protect edits made during pending saves.
- Browser: entry routes, mission-draft retention, shortlisted-candidate comparison, research handoff and notebook restoration, offline-service entry, reduced motion, and 320–1440 px layouts.
- Frontend test runner on Node 25 needs NODE_OPTIONS=--no-experimental-webstorage to use jsdom's Storage implementation rather than Node's incompatible global stub.
- Final verification: 315 frontend tests passed; 580 backend tests passed, 27 skipped; TypeScript and production build passed; git diff --check clean. Existing Three.js bundle-size warning remains.
