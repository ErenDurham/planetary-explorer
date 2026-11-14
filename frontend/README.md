# Planetary Explorer — frontend

React + TypeScript + Vite single-page app: a React Three Fiber Mars globe,
mission-priority sliders that re-score eight candidate landing sites through the
backend, an environmental profile panel with provenance on every metric,
Recharts charts, an Earth-analog comparison view and a citation-backed AI
explanation panel. All numbers come from the FastAPI backend in `../backend`;
nothing is computed or imputed in the browser.

## Run

```bash
npm install
cp .env.example .env            # optional: VITE_API_BASE_URL (default http://localhost:8000)
npm run dev                     # http://localhost:5173
```

The backend must be running for site data, scoring, analogs and explanations
(`cd ../backend && uvicorn app.main:app --port 8000`). Without it the globe
still renders from the bundled texture and a banner says the API is unreachable.

## Scripts

| script | what it does |
|---|---|
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | `tsc --noEmit` then `vite build` → `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test -- --run` | vitest (jsdom), 6 files / 27 tests |
| `npm run gen:types` | `openapi-typescript http://localhost:8000/openapi.json -o src/types/api.ts` — regenerate whenever a backend model changes, and commit the result (CI has no backend) |

## Environment

`VITE_API_BASE_URL` — backend origin, no trailing slash. See `.env.example`.

## Where things live

```
src/
  main.tsx, App.tsx          entry; QueryClientProvider; three-column layout + tabs
  index.css                  Tailwind v4 theme tokens (dark blue-grey base, copper accent)
  types/api.ts               GENERATED from the backend OpenAPI document — never hand-edit
  types/index.ts             friendly aliases (Site, EnvironmentalProfile, SuitabilityResult, …)
                             plus the one hand-written type, DefaultMissionResponse (see below)
  services/api.ts            typed fetch wrapper; parses {error:{code,message,details}} into ApiError;
                             network failure -> ApiError code "unavailable"
  store/useAppStore.ts       Zustand: active tab, selected site, slider weights, analog weights, UI prefs
  hooks/                     TanStack Query: sites, profile(s), default mission, evaluation, analogs, explanation
    useEvaluation.ts         150 ms debounce + stale-response guard around POST /scoring/evaluate
    useExplanation.ts        cached per site+mission; fetched only on "Explain" or site change
  lib/
    staleGuard.ts            client_request_id issue/accept (unit tested)
    mission.ts               slider state -> MissionProfile, cache key
    format.ts                numbers, units, lat/lon
  components/
    globe/                   PlanetViewer (R3F Canvas, OrbitControls, Stars), MarsSphere, SiteMarkers,
                             GlobeLegend, PlanetConfig (Mars only), geo.ts (latLonToVector3), colors.ts
    layout/                  TopNav, StatusBanner, LeftSidebar, RightSidebar, AnalyzeView, CompareView
    mission/                 PrioritySliders, HardConstraints, RankedList, SuitabilityPanel
    sites/                   EnvironmentalProfilePanel, MeasurementValue, QualityBadge, ProvenancePopover, SourcesList
    charts/                  FactorBreakdown, RankedSites, EnvironmentalComparison, AnalogFactor, Completeness
    intelligence/            AnalogComparison (Compare tab), ExplanationPanel
    ui/                      Badge, Section, Spinner, ErrorNote, InfoTip
  test/                      vitest setup (jsdom shims) and fixtures copied from docs/api_examples.json
```

## Conventions worth knowing

- **Marker placement**: `x = R cos(lat) cos(lon)`, `y = R sin(lat)`, `z = -R cos(lat) sin(lon)`,
  east-positive longitude in −180..180. The reason this lines up with Three.js'
  default sphere UVs (u=0 at −x) is documented in `components/globe/geo.ts` and
  pinned by `geo.test.ts`.
- **Missing data is never 0.** `MeasurementValue` renders `is_missing`/`null` as
  "No data" plus the backend's `notes`; the comparison chart lists missing sites
  under the chart instead of plotting them.
- **Environment vs suitability vs similarity.** The profile panel (what a site
  *is*), the suitability panel (what it *scores* under one mission) and the
  analog view (how *similar* an Earth site is) are separate sections and never
  share an axis or a number. Scores are labelled "relative suitability index".
- **Stale responses.** Every evaluate request carries a fresh `client_request_id`;
  a response whose id is not the latest issued is dropped (`lib/staleGuard.ts`).
- **Tests do not mount WebGL.** jsdom has no WebGL, so the Canvas is not rendered
  in tests; the globe's pure functions (coordinates, colours) are unit tested and
  the panels are rendered with fixtures. `fetch` is mocked; nothing hits the network.
- **`DefaultMissionResponse` is hand-typed** because `GET /scoring/default-mission`
  has an empty response schema in the OpenAPI document. Reported to the backend
  owners; once a Pydantic model exists, regenerate and delete the hand-written type.

## Attribution

Globe texture: Viking MDIM 2.1 colour mosaic via NASA Solar System Treks,
credit NASA/JPL/USGS (`public/textures/mars_viking_4k.ATTRIBUTION.txt`), shown in
the globe legend.
