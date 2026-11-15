# Cosmos-inspired redesign

Goal: preserve the complete scientific workflow while giving the product a coherent, original visual and motion language.

## References actually inspected
All ten collection pins opened individually, not only thumbnails. Collection: https://www.cosmos.so/jasmine198/planetary-explorer-inspo
- https://www.cosmos.so/e/33180778 — NASA-topped motion reference. Played full 54.01667 seconds at real time and examined captures through the entire sequence: orbit traces and planet overview, pullback, typography and contextual breakdown, schematic view, quiet interlude, limb close-up, return to overview. Borrow scale continuity and staged information; do not reproduce debris metrics, NASA branding, or decorative graphs.
- https://www.cosmos.so/e/125102971 — Etienne Jacob generative animation. Played full 9-second loop and reviewed formation, dispersal, and reformation. Build original procedural point geometry and state-dependent movement; do not download or embed the artwork.
- https://www.cosmos.so/e/1026772577 — COSMO field interface, controlled overlays and clear hierarchy.
- https://www.cosmos.so/e/573248760 — technical console, precise divisions and compact labels; reject excessive fictional telemetry.
- https://www.cosmos.so/e/979618069 — restrained globe controls and point geometry.
- https://www.cosmos.so/e/1035024055 — type/visual split and quiet controls.
The remaining window, sphere and dotted-globe pins inform depth and contrast, not fabricated science.

## Design and architecture
- Centralize graphite / ivory / muted signal accent tokens. Preserve scientific rank/role/body palettes.
- Rework Home into an open editorial launch surface with an actual 3D Earth/Mars preview, concise tasks and retained mission/research entry points. No giant card collection or invented data.
- Rebuild navigation styling around stable-width stage links, branded Home control and an accessible global motion toggle; no layout shifts when tools change.
- Give the explorer an instrument-like frame, readable full candidate names, quiet controls, contextual planet identity and an explicit travel indicator. Keep selected sites, body-specific camera memory, ranking and data flows intact.
- Stage camera withdrawal, texture handoff and arrival so the map does not visibly change before camera departure. Markers and source-specific overlays remain hidden in transit; accessibility announces destination. OS reduced motion and the manual pause switch use instant transitions.
- Create a procedural 2D-canvas Astro particle presence (no dependency). Bounded particle count, capped frame rate/DPR; pause offscreen/hidden and for reduced motion. Status text is authoritative. No fake streaming or listening state.
- Reorganize Astro empty state, header and composer; keep free text placeholder suggestions, all resizing handles, retry, sources, old-context warning and conversation retention.
- Apply consistent typography, controls, disclosure and editorial surface conventions across Mission, Explore, Research, Analyze and Compare. Preserve scientific content, errors and provenance.

## Steps
- [x] Save source backup; inspect references, full videos and app architecture.
- [x] Add behavior tests for motion preference, stateful particles and retained UI interactions.
- [x] Implement motion preference, particle presence and new navigation.
- [x] Rebuild Home presentation and explorer instruments/transitions.
- [x] Restyle and reorganize Astro and remaining panels.
- [x] Run functional suites/typecheck/build; visual review all major views, real transition frame sequence, narrow screens, no WebGL and reduced motion; iterate.

Keep work local on jasmine/discover-workbench. No backend algorithm/provider changes, no Moon controls (Moon exploration remains deferred), no new dependencies, no push/deployment.

## Implemented and reviewed
- Original procedural Astro shell: 160 points in the launcher/header, 480 in the empty-state visualization; 24 fps cap and DPR <=1.5. Ready/reviewing/response-ready/error reflect actual request state. Visibility, OS preference and manual motion pause stop animation. No artwork assets embedded.
- Home now has a lazily loaded 3D body preview with shared NASA textures, alternate-body preview buttons independent of application selections, no-WebGL fallback and offscreen pause.
- Stable navigation, shared visual tokens, framed exploration tools, readable candidate names, tighter legends, survey disclosure and a stacked tablet layout below 1280 px. Mission, Research, Analyze, Compare and expedition controls use the same presentation conventions.
- Kept camera memory and selection behavior. Deferred incoming location coordinates during a planet handoff so an asynchronous rank response cannot cancel the travel during a mixed-material frame. Actual browser captures reviewed before, during and after travel, including a deliberately delayed rank response.
- Preserved conversation, source disclosures, retry, old-context warning, resizing and the placeholder-only suggestion. UI state review used an intercepted response; this is not a claim of a live-model quality/performance benchmark.
- Visual iterations covered 320, 390, 768, 1024, 1280, 1440 and 1600 px; checked standard and OS/manual reduced motion, native phone dialog/Escape, fallback map, primary mission application, research handoff, comparisons and shortlist access.
- Final checks: 321 frontend tests pass; 580 backend tests pass with 27 skipped; TypeScript + Vite production build pass; git diff --check clean. Existing large Three.js chunk warning remains. No dependencies, backend calculations or provider configuration changed.
- Source backup before this redesign: /tmp/planetary-before-redesign-20261115.tar.gz. Work remains local and unpushed.

## Remaining limits
Moon navigation remains deferred by the current application. This redesign provides Earth/Mars transitions rather than a decorative, nonfunctional Moon route. GPU behavior was reviewed in headless Chrome with software WebGL; device-specific GPU performance still merits testing on target hardware.

## Purple-theme refinement
- Interface surfaces and interaction accents are now purple. Rank scales, status colors, body imagery, role colors, known factor palettes and measured-contribution bars remain independent; dedicated data-contribution tokens retain their previous green values.
- Home alone displays the motion toggle. Its manual pause now affects the Home preview only; system reduced-motion preferences still apply everywhere.
- The Home globe uses aspect-aware fitting (including atmosphere), bounded OrbitControls drag/wheel interaction, keyboard rotation/zoom, and a vertical right rail with a sliding thumb. Earth/Mars handoff uses a short, camera-relative slide, swaps texture only at the invisible midpoint, and honors reduced motion. Preview interactions do not change mission selections.
- Astro particles stay on an exact unit sphere across all states and times; state changes affect speed and emphasis rather than geometry.
- Browse Regions is first and the fresh-session default. Explicit pilot and research return paths still open Find Unresearched Analogs.
- The analysis dropdown visibly reads Analyze or Compare when that tool is open, with aria-current and a fixed-width slot to avoid navigation shifts.
- Verified 327 frontend tests, TypeScript/build, browser drag/wheel, slide navigation, responsive previews at 320–1440px, active analysis indicators, absence of motion control off Home, isolated Home pause, and explicit discovery access. No backend/provider changes; no push.
