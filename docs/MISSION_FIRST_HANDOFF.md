# Mission-first flow and visual presentation: handoff

Branch `mission-first-flow`, built on `main` at 1112224 (the merged discovery usability journey),
0234c81 (the shared theme) and 87636d8 (the first-run Mission Design prompt, which this replaces).
No scoring, dataset, API contract or scientific threshold changed.

## What changed

**Mission Design is the first primary pane.** `TopNav` shows three numbered steps, Mission Design →
Explore → Research, with Analyze and Compare behind Advanced. A fresh session opens on Mission Design
(`useAppStore` initial `activeTab`). The first-run `MissionGate` modal and its click interception are
gone; nothing interrupts the user.

**One focused composer** (`components/mission/MissionObjective.tsx`, styled in `theme/panes.css`): a
two-sentence lede, the objective box as the instrument of the page with a copper focus ring, three
example objectives that fill the box (one per supported workflow; `EXAMPLE_OBJECTIVES`), Apply
objective / Apply changes / "Reading your mission…", and an explicit draft state ("Draft · not applied
until you apply it") when an applied objective is being edited. The applied objective sits in a card
with its task reading and Edit Mission. The sliders, pie and Earth/Mars focus now live under a
"Scoring priorities and mission focus" disclosure whose summary names the top two priorities, so the
page is not a wall of controls.

**The next step is chosen honestly** (`lib/missionRoute.ts`, `components/mission/MissionNextStep.tsx`).
From the applied task, reference and focus body plus whether a discovery survey is installed:

| reading | route | CTA |
|---|---|---|
| analog selection, Jezero reference, asks for new regions, survey installed, not Mars-focused | discovery | Explore candidates → Find Earth Analogs |
| analog selection, any other reference or no survey | established analogs, with a notice that discovery exists only for Jezero | Explore established analogs |
| landing screening | Mars sites | Explore Mars sites |
| no task reading | choose a supported task; the discovery choice is disabled when no survey is installed | three buttons |

The card states the pilot's bounds in the same breath ("a bounded set of surveyed Earth footprints …
not a global search, and a terrain match is not geological equivalence"). It is disabled while a
draft edit is unapplied, so Explore never opens on priorities that belong to an older objective, and
Jezero's discovery results are never shown for an objective that did not ask for them. Explore's
stage shows the applied objective's context line.

**The globe** (`components/globe/`): ACES tone mapping with per-body exposure; a hemisphere light plus
a key light that rides with the camera (`KeyLight`), so a focused site is never on the night side (a
world-fixed light left Jezero in darkness after the camera flew there); a Fresnel atmosphere shell
(`Atmosphere.tsx`) whose glow is thickest against the limb and fades outward, blue on Earth, a faint
dusty rim on Mars; a radial canvas background behind a dimmer, slower starfield; higher-segment
spheres with per-body roughness; a readable label beside the selected marker; `dpr={[1, 1.5]}`;
`prefers-reduced-motion` stops auto-rotate, the star drift and the marker pulse; and a flat
equirectangular fallback with clickable markers (`GlobeFallback.tsx`) when WebGL is unavailable or the
scene throws (`GlobeErrorBoundary`). Footprints, bounds, sampling centres, catalog markers and the
legend are untouched; the overlay code was not changed.

## Verification

- `npm run typecheck` clean; `npx vitest run` 65 files, 288 tests passing (headless, jsdom).
- `npm run build` and the Pages build (`VITE_PAGES_PYTHON`, base `/planetary-explorer/`) both succeed.
- Headless-Chrome walk on the dev server against the local API (`tmp/drive/mission_walk.mjs`): fresh
  session lands on Mission Design; example → Apply → route `discovery` → Explore candidates opens Find
  Earth Analogs with the first result selected; research notes typed, Mission Design edited and
  re-applied, notes intact in Research; an Elysium new-regions ask routes to `established_analogs` with
  the honest notice; a landing objective typed by keyboard alone routes to `landing_screening`; 390 px
  and 360 px have no horizontal overflow; tab order is skip link → three steps → Advanced → box →
  examples; zero console errors.
- Pages build walk (`tmp/drive/pages_walk.mjs`, served under the base path): the Pyodide worker boots,
  the offline reading of the default example routes to discovery, four candidates render, notes save
  to `planetary-explorer.pages-research.v1`, and after a reload (which lands on Mission Design again,
  by design) the same walk restores the saved status and notes. 45 s end to end on this machine.
- Globe walk (`tmp/drive/globe_look.mjs`): Earth with footprints and the selected label, Mars reached
  through View Mars with Jezero lit and labelled, ~29 rAF/s under SwiftShader (software GL; relative
  only). Screenshots: `docs/screenshots/mission-{design,applied,unsupported,phone}.jpg`,
  `docs/screenshots/globe-{earth,mars}.jpg`.
- New tests: `lib/missionRoute.test.ts` (6), `components/globe/GlobeFallback.test.tsx` (2), and in
  `MissionObjective.test.tsx` the examples, the supported route, the unsupported route, the choose
  case and return-to-edit keeping notes and the discovery selection; `App.test.tsx` covers the fresh
  session and the choose-a-task handoff.

## Limitations and open items

- Frame pacing was measured under SwiftShader only; GPU performance on a real laptop and phone has not
  been measured. The DPR cap and the reduced-motion path are the mitigations in place.
- The interpretation's task reading comes from the backend (or the offline rule-based reading for the
  default example). An objective the backend reads as analog selection without a reference is routed
  to the established analogs; a reading with no task asks the user to choose. Neither invents a task.
- The composer's lede and the next-step detail are the mission wording; both avoid promising more than
  the bounded pilot does. If the pilot's scope changes, `lib/missionRoute.ts` carries the sentence.
- `frontend/dist-pages/` is a build output and is not committed.
