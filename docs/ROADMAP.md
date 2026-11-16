# Roadmap

Version 1 is the hackathon weekend build: Mars only, mission phase 1
(Landing) only, seven curated Earth analog candidates. This page records what
V1 must do to be accepted, what Version 2 adds and which existing interfaces
each addition extends, and the near-term data improvements that would fill the
features V1 marks as missing.

Status key: **done** (in the repository and tested), **verified locally** (rendered in headless Chrome on 2026-11-14; screenshots in `docs/screenshots/`)
(in the repository, passes its suite, not yet seen running in a browser),
**in progress** (owned, not merged), **not started**.

## 1. Version 1 acceptance criteria

The brief frames acceptance as ten steps a judge walks through. The list
below is the brief's own wording. Status is as of 2026-11-14. "Exists" means
the code is in the repository and passes `tsc`, `vite build` and vitest;
nothing in the frontend has yet been **seen running in a browser** (no
screenshot or run log is in the repository), and nothing is deployed.

| # | Judge step (brief wording) | What must be true | Status |
|---|---|---|---|
| 1 | Open the deployed application | Static frontend served from a public URL; `GET /api/v1/health` on the deployed backend returns `status: ok`, `services.data: ok`, `services.retrieval: ok` | **Not done.** Backend and frontend both build and pass their suites locally (244 pytest, 29 vitest); no host configuration exists and nothing is deployed |
| 2 | Explore the interactive Mars globe | React Three Fiber sphere textured with the Viking MDIM 2.1 mosaic, orbit controls, 8 site markers placed with the documented formula; Olympus Mons and Hellas visually correct | **Verified locally.** `PlanetViewer`, `MarsSphere`, `SiteMarkers`, `GlobeLegend`; the marker formula is pinned by `geo.test.ts`. jsdom cannot mount WebGL, so the rendered globe and the landmark check have no test and no screenshot |
| 3 | Select a real candidate site | Clicking a marker or a ranked row sets the selected site in the store and opens its profile | **Verified locally** in a browser (`SiteMarkers`, `RankedList`, `useAppStore`; `App.test.tsx` renders the selected site's profile with mocked `fetch`) |
| 4 | Inspect sourced environmental measurements | `GET /sites/{id}`: 17 measurements with unit, `source_id` resolved to its `Provenance`, footprint, `spatial_resolution`, `quality_flag`; missing features shown as missing, never 0 | **Backend done; panel exists and is unit-tested** (`EnvironmentalProfilePanel.test.tsx`, `MeasurementValue` renders `null` as "No data", `ProvenancePopover`, `QualityBadge`) |
| 5 | See a deterministic, explainable suitability score | `POST /scoring/evaluate` with the default mission: 8 `ok` results, ranks 1-8, `factor_scores` whose contributions sum to the score, `warnings` naming the excluded thermal criterion; spec `landing-v1.1` | **Backend done** (Chryse 98.72 ... Gale 64.14 in `api_examples.json`); `SuitabilityPanel` and `FactorBreakdownChart` verified locally on 2026-11-14 (`docs/screenshots/site-selected.jpg`, `analyze.jpg`) |
| 6 | Adjust mission priorities | Sliders for the five criteria and editable hard constraints; 150 ms debounce; `client_request_id` echoed; stale responses dropped | **Backend done; frontend exists and tested in jsdom** (`PrioritySliders`, `HardConstraints`, `useEvaluation`, `staleGuard.test.ts`; `App.test.tsx` asserts one re-evaluation after a burst of changes). Network throttling on the real app not done |
| 7 | Watch rankings and markers update | Ranked list, marker colours and charts all redraw from one evaluate response | **Verified locally.** `RankedList`, `SiteMarkers` + `colors.ts` (unit-tested colour mapping), `RankedSitesChart`; marker recolouring on a live response has not been watched |
| 8 | Inspect scientific charts | Factor breakdown, ranked sites, environmental comparison across sites (missing sites listed, not plotted), analog factor distances, completeness | **Verified locally** (`components/charts/`, five Recharts views) |
| 9 | Read a citation-backed RAG explanation | `POST /research/explain`: sections populated; `generated_by` shown; `supporting_evidence` non-empty; every citation maps to retrieved evidence; works with no API key | **Backend done** on the deterministic path: 36-document / 311-chunk corpus, BM25 retrieval `ok`, Jezero example carries 6 evidence chunks and 6 citations. `ExplanationPanel` verified locally. **The live LLM path has not been exercised** (tests mock the model; no key has been set) |
| 10 | Compare the site with at least one Earth analog candidate | `POST /analogs/match`: ranked matches with `feature_distances`, `shared_characteristics`, `important_differences`, `noncomparable_variables`, `planetary_differences`; weights adjustable | **Backend done** (Jezero: Atacama 63.03, MDRS 61.53, McMurdo 61.32 in `api_examples.json`, on the rebuilt Earth profiles); `CompareView`, `AnalogComparison`, `AnalogFactorChart` verified locally on 2026-11-14 (`docs/screenshots/compare.jpg`) |

Two cross-cutting checks the brief implies and the backend already meets:
every measurement's `source_id` resolves and DATA_SOURCES.md documents every
dataset (traceability); `regional_scale_only` flags, `limitations` on every
result and match, `completeness` listing missing features, and the five
planetary differences on every comparison (limitations stated, not hidden).
Both still need to be *shown* in the UI and checked in a browser.

Backend acceptance is complete: `cd backend && .venv/bin/python -m pytest -q`
reports **244 passed** over the committed data (2026-11-14),
`scripts/validate_profiles.py` reports "15 profiles checked (8 Mars,
7 Earth); 0 failure(s)", and `docs/api_examples.json` captures every
endpoint's real response under spec `landing-v1.1`. The frontend compiles,
builds and passes 29 tests. **The open half of every row is the same two
things: seeing it run in a browser, and deploying it.**

## 2. Version 2 (do not implement during the weekend)

These items are recorded so that V1 decisions leave room for them. Any pull
request implementing one of them before V1 is accepted should be closed with
a pointer to this section.

### 2.1 Planet switching: a Moon globe and a secondary preview

| | |
|---|---|
| What | A planet selector; a lunar globe (LRO-derived texture and LOLA topography) with its own candidate sites; a small secondary preview of the non-active body |
| Extends | **Frontend:** the brief's `PlanetViewer` component takes a `PlanetConfig` (texture, radius, coordinate frame, site list) instead of Mars constants; neither exists in the repo yet, so E1 should build the V1 globe with that seam even though only Mars is configured. **Backend:** `Planet = Literal["mars", "earth"]` in `app/models/common.py` gains `"moon"`; `GET /sites?planet=` already validates the planet and returns `422 unsupported_planet` for anything but Mars, which is the hook. `EvaluateRequest.planet` is `Literal["mars"]` today |
| Data | A `data/moon/sites.json` and `site_profiles.v1.json` produced by a `build_moon_profiles.py` that reuses `geo.terrain_stats()` at a stated baseline. Lunar coordinates are also planetocentric east-positive, so `GeographicFootprint` needs only a new `crs` string |

### 2.2 Lunar profiles: illumination, thermal, water ice

| | |
|---|---|
| What | Features the Moon needs that Mars does not: illumination fraction and permanent-shadow flags near the poles, Diviner-derived surface temperature extremes, and water-ice evidence (LEND, LAMP, M3) |
| Extends | `EnvironmentalMeasurement` and `EnvironmentalProfile` unchanged (new `feature_id`s and `source_id`s); `MeasurementCategory` already has `light`, `atmosphere_thermal` and `water_ice`. The insolation model in `geo.py` needs a lunar entry in `ORBITS` or, better, a separate illumination model, since the latitude-only annual mean is a poor proxy at the lunar poles |
| Scoring | A `landing` spec for the Moon (`scoring_spec.moon.json`) with its own knees; `thermal_conditions` becomes scoreable |

### 2.3 Earth-Moon analogs and broader terrestrial discovery

| | |
|---|---|
| What | Match lunar sites to Earth candidates (regolith simulant sites, lava tubes, polar highlands); and move from **curating** 7 candidates to **discovering** them over continuous Earth data: EMIT L2B mineral identification for composition, SRTM GL1 30 m for finer topography, HLS L30 for vegetation and bare-ground screening. This is the challenge's explicit ask for **new** analogs ([CHALLENGE.md](CHALLENGE.md#4-the-honest-gap)) |
| Extends | `AnalogMatch` and `MatchRequest` unchanged except `mars_site_id` generalising to a `site_id` plus planet; `analog_spec.json` gains measured-mineralogy features alongside or replacing the literature tags; `EarthCandidate` gains a `discovered_by` provenance. All three datasets require an Earthdata Login (see [DATA_SOURCES.md](DATA_SOURCES.md#8-not-used-in-v1-and-why)) |
| Method | The harmonised-baseline rule stays: whatever Earth grid is used is block-averaged to the target body's cell size before terrain statistics are compared |

### 2.4 Mission phases 2 to 4

| | |
|---|---|
| What | `base_establishment`, `resource_utilization`, `habitation` as mission phases with their own criteria (for example water-ice access, regolith suitability, dust, thermal stability, communication geometry) |
| Extends | `MissionPhase = Literal["landing"]` in `app/models/mission.py` already carries the comment "V2 adds base_establishment, resource_utilization, habitation". `MissionProfile`, `SuitabilityResult` and `FactorScore` need no change; `scoring_engine.load_spec()` becomes keyed by phase. Each new criterion needs a feature the profiles actually carry, which ties these phases to section 3 below |

## 3. Near-term data improvements

These are the improvements that would let V1's own placeholders be scored.
Each maps to a `feature_id` that every Mars profile currently reports as
missing (`completeness.missing_feature_ids`).

| Improvement | Source (as named in the profiles and SCIENTIFIC_METHOD.md) | Fills `feature_id` | Unblocks |
|---|---|---|---|
| THEMIS / TES thermal products: surface temperature or thermal inertia, gridded and sampled over the footprint | THEMIS/TES (ASU, PDS); Mars Climate Database as an alternative | `surface_temperature_mean_c` | The `thermal_conditions` criterion (weight 10 by default), excluded on every evaluation today |
| Rock abundance maps | IRTM/TES rock abundance (Christensen 1986; Nowicki & Christensen 2007) | `rock_abundance_pct` | A hazard criterion that the regional MOLA relief cannot stand in for |
| Dust Cover Index | TES Dust Cover Index (Ruff & Christensen 2002) | `dust_cover_index` | A dust / solar-power-degradation criterion |
| Surface pressure by site and season | Lander records (Viking, InSight, Curiosity, Perseverance) or the Mars Climate Database | `atmospheric_pressure_pa` | EDL-relevant pressure instead of elevation as a proxy; makes the pressure disclosure in analog matching quantitative |
| HiRISE / CTX stereo DTM sampling over the landing ellipse | HiRISE (UA) and CTX (MSSS) DTMs via PDS; CTX via Mars Trek `CTX_beta01_uncontrolled_5m_Caltech` | New `slope_local_*` and `roughness_local_m` features at a stated metre-scale baseline (not a replacement for the regional ones) | Terrain criteria that can speak to lander-scale hazards; retires the `regional_scale_only` caveat for sites with DTM coverage. Already named in every explanation's `future_investigation` |
| CRISM MTRDR mineral parameters | PDS Geosciences ODE | A measured-composition feature beside `mineralogy_tags` | Data-driven composition matching in the analog engine |
| ~~Earth: fix the Copernicus longitude-spacing assumption~~ | `build_earth_profiles.py`, `geo.block_average_xy` | **Done 2026-11-14**, within v1: per-axis block factors, profiles rebuilt (Haughton harmonised slope 0.567 deg, McMurdo 1.955, Holuhraun 1.628) | Trustworthy slopes at high latitude (SCIENTIFIC_METHOD.md section 2) |
| Earth: record the POWER climatology period | NASA POWER API header | `observation_period` in the `nasa_power` provenance | Complete provenance |

Rules that carry forward from V1 into all of this: missing stays `null`,
every new feature gets a `Provenance`, every new threshold is labelled an
assumption, a changed pipeline writes a new profile version rather than
overwriting v1, and the harmonised baseline is stated on every terrain metric.

## 4. Related documents

- [CHALLENGE.md](CHALLENGE.md): what the challenge asks and where V1 falls short.
- [TEAM_WORKSTREAMS.md](TEAM_WORKSTREAMS.md): ownership, checkpoints, deployment.
- [SCIENTIFIC_METHOD.md](SCIENTIFIC_METHOD.md): formulas, assumptions, known limitations.
- [DATA_SOURCES.md](DATA_SOURCES.md): provenance for every dataset.

## Earth–Mars release (2026-11-14, in progress)

| Area | Status |
|---|---|
| Typed mission/view state (task, destination, selection body, viewed body, per-body selection, analog preferences separate from landing priorities) | frontend, in progress |
| Real Earth globe (NASA Blue Marble NG via GIBS, same texture convention as Mars; verified by landmark pixels) | texture built; viewer generalisation in progress |
| Bidirectional analog ranking on a common feature basis (`POST /analogs/rank`) | done, tested (pair similarity identical in both directions) |
| Objective task reading (landing vs analog, focus vs destination, named references, ambiguity → direction options, analog-preference proposal) | done, tested; proposal review UI in progress |
| ROYGBIV rank palette over the full ranked pool, unrankable excluded | frontend, in progress |
| Compare: two linked Earth/Mars columns with side-by-side orbital/field imagery, scale linking only for georeferenced orbital pairs | frontend, in progress |
| Earth imagery manifest (GIBS Landsat WELD/MODIS orbital context with exact bounds; NASA-library and Commons field photographs with recorded licences) | built; Atacama has no verifiable field photo |
| Moon | deferred; catalogue data isolated, removed from Compare navigation |

## Lesser-known Mars sites (2026-11-15)

| Area | Status |
|---|---|
| 17 Mars sites and 17 paired Earth locations; project roles and notes; approximate-coordinate flags | done (`data/sites/site_conditions.v1.json`) |
| Condition texts quoted from approved sources only (else "Could not be found in sources") | done; shown in the site panels and Compare, never scored |
| Site labels and descriptions from approved sources only | done |
| Approved sources in the Mission Design assistant's corpus | done; Plattner's NASA ECCA report is a PDF and needs `pypdf` |
| Find Earth Analogs discovery page | removed; Explore's single mode is named Find Earth Analogs |
| Owner approval of the measured datasets (MOLA, Copernicus DEM, NASA POWER) and of the site coordinates | open |
