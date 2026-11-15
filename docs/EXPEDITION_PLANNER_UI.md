# Expedition Planner: UI integration

The Expedition Planner is the interactive rover-expedition planning experience
inside the **Research** page. It is a frontend feature (`frontend/src/features/expedition/`)
built against the shared expedition-planning service described in
[`EXPEDITION_PLANNER_CONTRACT.md`](../EXPEDITION_PLANNER_CONTRACT.md) (engine `expedition-v1`).
The UI never computes a distance, slope, energy figure or feasibility verdict: every
number it shows is a field of the service's `PlanResponse`, and a missing metric is
shown as "No data", never as 0.

## Where it lives

| Path | Role |
|---|---|
| `components/layout/ResearchView.tsx` | Hosts the **Plan an Expedition** card (`PlanEntryCard`) and swaps in the planner for the selected site, keeping the site selector so the region can be changed without leaving the planner |
| `features/expedition/adapter/` | The typed adapter. `types.ts` aliases the backend-generated schema (`types/expedition-api.ts`); `httpService.ts` wraps `services/expeditionEngine.ts` and translates its errors into two UI states: **unavailable** (404 / 501 / 503 / network) and **rejected** (any other error, shown verbatim). Tests inject fakes with `setExpeditionService()` |
| `features/expedition/store/useExpeditionStore.ts` | Interaction state only: stage, per-region workspaces (objective, waypoints, selected targets, rover inputs, optimisation, basemap, session runs) |
| `features/expedition/hooks/` | `useExpeditionCapabilities` (service availability and its rover profiles / regions), `useBasemaps` (georeferenced orbital mosaics from the existing verified-imagery endpoint), `useTerrainContext` (service start point, DEM coverage, research targets), `usePlanRoute` (one request in flight, abort on recalculate, echoed `client_request_id` stale guard) |
| `features/expedition/components/` | `PlannerIntro` → `ObjectiveCards` → `Workspace` (`TerrainMap`, `ConfigPanel`, `WaypointList`, `MetricsPanel`, `RouteWarnings`) → `MissionReport` |

## The map is georeferenced, not decorative

`TerrainMap` draws on an orbital mosaic whose extent comes from the imagery manifest's
tile grid (CTX on Mars; Landsat WELD / MODIS on Earth). A coordinate is placed by linear
mapping inside those bounds (`lib/geo.ts`, the same mapping as the Compare footprints), and a
click is converted back into a coordinate the same way, so what the user points at is what the
service receives. Where a region has no georeferenced mosaic the map refuses to draw and says so.
The regional (62 km) mosaic is the default because the engine's MOLA grid cells are ~3.7 km.

What the map shows, and what it does not:

- the start point, numbered draggable waypoints, research targets with coordinates (only inside the basemap), and a faint dashed **stop-order** line labelled as not a route;
- the service's route **polylines** coloured by its risk class, revealed with a short animation (disabled under `prefers-reduced-motion`). A leg whose two stops fall in one grid cell has no geometry and is not drawn: no connector is invented;
- hollow dashed rings at the grid-cell centres the service **snapped** each stop to, with the offset in the stops list and in the report;
- a scale bar from the bounds and the rendered height, the basemap credit and its relationship to the site.

## States the UI distinguishes

| Service state | Behaviour |
|---|---|
| not deployed / unreachable (404, 501, 503, network) | "Service not connected" badge; the basemap, waypoints and objective still work; Calculate is disabled with the reason listed; the metrics panel shows an empty state and no number |
| connected, region without terrain (`dem.available=false`, e.g. Earth) | Calculate is disabled naming the service's note |
| request rejected (422 etc.) | the service's code and message are shown under the metrics header |
| plan returned | metrics, feasibility, warnings (hover highlights the leg), `data_status` banner with the DEM note and cell size, snapped stops |

`data_status` is shown whenever a plan exists, even with `status=ok`: on Mars it is always
`limited` (regional MOLA, interpolated bins, no hazard layer).

## Session comparison

Each calculation is recorded as a run for the current region. The report shows the active
run and lets the user set any other run's service metrics beside it; differences are arithmetic
between two service results and are labelled as carrying no uncertainty of their own.

## Verification

`frontend`: `npm run typecheck`, `npx vitest run` (feature tests under `features/expedition/**`:
geometry round-trips, adapter error mapping, store, map alignment and click-to-coordinate,
full flow with a fake connected service and with an unavailable one), `npm run build`.
Headless-Chrome screenshots of the real flow against the live engine are in `docs/screenshots/expedition-*.jpg`.
