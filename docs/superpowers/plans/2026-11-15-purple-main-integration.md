# Preserve the purple design while integrating main

Requested: merge the latest remote main functionality into jasmine/discover-workbench without replacing the current design.

## Safety and scope
- Saved all current Home, purple-theme, Astro, navigation and responsive refinements in local commit 6322c17 before integration.
- Backup branch: jasmine/backup-purple-before-main-20261115.
- Integrated origin/main at 3a4f66b. No force reset, push or deployment.

## Integration
- Kept the current layout/breakpoints, purple theme, Home globe fitting/drag/wheel/rail, Home-only motion toggle, spherical Astro and active Analyze/Compare indicator.
- Added main's global survey: 144 footprints in 16 regions, six scored features across terrain, illumination and water, per-dimension candidate/evidence displays, unscored context/land-cover review, mission-reading improvements, and color-blind palette propagation.
- Resolved the discovery list with main's new functional row content using the existing custom row style; retained the local shortlist and export feature.
- Updated the shortlist to enumerate the survey's supplied feature measurements instead of assuming slope/relief only. Updated Home scope wording accordingly.
- Bound discovery controls to the selected run's own criteria/defaults, and reset incompatible weights when changing feature bases. Switching between the six-feature global survey and the two-feature Morocco pilot now sends compatible requests.
- Corrected a response metadata mismatch in discovery_engine.rank: basis_features used the old two-feature constant even when the engine calculated all six features. It now reports the run's positively weighted features; calculations and scores are unchanged. Added regression coverage for full-basis and precipitation-only cases.

## Verification
- 332 frontend tests pass; TypeScript and Vite production build pass.
- 599 backend tests pass; 27 skipped.
- git diff --check and staged diff checks pass.
- Real browser: purple theme and Home controls, global six-feature controls/dimension bars, saved shortlist including precipitation, two-feature legacy pilot, return to global survey with shortlist retained, Research handoff, color-blind control, Browse default, active Analyze indication, and narrow Home layout. No runtime errors or failed ranking requests.
- Existing Three.js chunk-size warning remains unchanged.
