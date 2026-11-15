# Expedition Planner contract

Engine `expedition-v1`, independent of mission suitability and analog rankings.
No UI work is included. The existing Fable adapter paths are retained.

## Public API

- `GET /api/v1/expedition/capabilities`: objectives, region availability, example rover.
- `GET /api/v1/expedition/terrain?body=mars&site_id=jezero_crater`: terrain metadata,
  routing bounds, catalog starting coordinate, verified targets (currently empty).
- `POST /api/v1/expedition/plan`: typed `PlanRequest` → `PlanResponse`.
- Pydantic definitions: `backend/app/models/expedition.py`; OpenAPI `/openapi.json`.
- Frontend generated types and standalone service: `src/services/expeditionEngine.ts`.

## Request

```json
{"body":"mars","site_id":"jezero_crater","objective":"terrain_survey",
 "start":{"lat":18.4447,"lon_east":77.4508},
 "waypoints":[{"lat":18.65,"lon_east":77.65}],"target_ids":[],
 "user_targets":[],"optimization":"balanced","client_request_id":"ui-42",
 "rover":{"profile_id":null,"mass_kg":100,"max_slope_deg":15,
 "nominal_speed_m_s":0.05,"battery_capacity_wh":10000,"drive_hours_per_sol":4}}
```

Objectives: `terrain_survey`, `geological_sampling`, `research_traverse`.
Optimization: `shortest_distance`, `lowest_energy`, `lowest_risk`, `balanced`.
User targets: `{target_id,name,lat,lon_east}`; these are user-designated hypotheses,
not verified observations. Visit order: waypoints, then target_ids, then user_targets.
No automatic science-value ranking or target placement. A plan needs at least one stop.

## Verified response example

The request above was run against the installed MOLA product. Full request and
response: `docs/expedition-example.json`. Selected response fields:

```json
{"status":"ok","data_status":"limited","body":"mars","site_id":"jezero_crater",
 "metrics":{"total_distance_m":15313.337973917027,"energy_wh":4699.992078611396,
 "elevation_gain_m":67.0,"elevation_loss_m":0.0,"slope_max_deg":1.3762954249923363,
 "traverse_time_hours":85.07500814367822,"driving_sols":22.0},
 "feasibility":{"verdict":"undetermined"},"client_request_id":"ui-42"}
```

This excerpt omits other response fields. Values are model outputs at regional
resolution, not observations of an actual rover expedition.

## Response and UI integration

Existing adapter fields are retained: `plan_id`, `client_request_id`, `status`
(`ok|partial|infeasible`), `objective`, `route`, `metrics`, `feasibility`, `warnings`,
`interpretation`, `assumptions`, `limitations`, `datasets`, `engine_version`, `computed_at`.
Additive fields: `body`, `site_id`, `data_status` (`limited|unavailable`),
`terrain`, `constraints`, `stops` (requested and snapped positions), `visited_targets`.
Unavailable terrain returns HTTP 200, status `partial`, empty route, null metrics,
undetermined feasibility; never interpret missing metrics as zero.
Malformed inputs/unknown region/target return the existing structured HTTP 422 envelope.

Claude: call the three existing adapter URLs. Widen `ExpeditionBody` to include
`moon` when the UI supports it (`earth` is accepted but unavailable). Add optional
`user_targets` and rover model parameters below. Read `data_status` and display
terrain limitations even when `status=ok`. Bind route `polyline` as returned; do
not draw an invented connector to the requested point. Show snapping offsets.
Restart the backend process once to load the new router (or use uvicorn --reload).
Discard plans when body/site/input changes; use echoed client_request_id to ignore
stale responses. `targets_reached` means a grid cell was reached, not a sample collected.
Keep UI adapter ownership with Fable; engine implementation does not edit its files.

Invocation using the generated service:

```ts
import { expeditionEngine } from "@/services/expeditionEngine";
const terrain = await expeditionEngine.terrain("mars", "jezero_crater", signal);
const report = await expeditionEngine.plan(request, signal);
```

The existing Fable adapter can instead keep its current HTTP implementation;
its three endpoint paths already match. Do not run both services for one action.
Only shared-file changes are the router registration and exporting the existing
frontend fetch helper. No Research UI, global styles, store, or rankings changed.

## Coordinates, terrain and units

Planetocentric latitude [-90,90], east-positive longitude accepted [-180,360],
normalized in outputs to [-180,180). Never feed west-positive coordinates.
Route geometry is arrays of `{lat,lon_east}` (not GeoJSON lon/lat arrays).
Distances in m, elevations in m relative to MOLA's GMM3 areoid, slope in degrees,
energy Wh, drive time hours. Great-circle distances use the MOLA sphere 3396 km;
Moon distance utility uses NASA mean radius 1737.4 km (no lunar routing installed).

Installed Mars source: MOLA MEGDR 16 ppd `MEGT90N000EB.IMG`, 2880x5760 signed
big-endian int16, rows north→south, columns 0→360E, pixel centers offset by half
cell. Reuses installed raw grid, label, checksum and pipeline constants. Routes
stay within each site's existing ±0.5° regional footprint. Grid coverage bounds
are explicit; missing or out-of-range cells block traversal. No interpolation or
upsampling. All requested stops snap to a valid containing cell center, with
reported offsets. Two stops in one coarse cell do not resolve a traverse.
MOLA contains interpolated bins: this is regional topography, NOT rover hazards.
Current Moon regions Apollo 11 and Apollo 15 have no usable DEM: unavailable.
Earth is outside this engine's terrain support. No external downloads at request time.

## Computation and limits

8-neighbor A*, no diagonal corner cutting; both local gradient and along-edge
slope must meet max_slope_deg. Local gradient reuses `scripts.geo.slope_deg`.
Risk is a slope-utilization proxy only; rocks, traction, dust, lighting, thermal,
communications and sampling feasibility are unknown.

Energy per edge: `(mass*g*Crr*horizontal_m + mass*g*positive_gain_m)/efficiency/3600
+ hotel_power_w*drive_time_hours`. Drive time uses 3D segment length/speed.
No regenerative descent and no solar recharge. Defaults Crr=.08, efficiency=.30,
hotel power=50 W are editable engineering assumptions, not measured rover values.
Mars g=3.73 m/s² from existing body catalog. Battery is a one-charge budget.
`drive_hours_per_sol` only estimates driving sols; it does not recharge the battery.

A* costs: distance=d; energy=E; risk=d*(1+9*u²); balanced=d*(1+u²)+E/Eflat,
where u=max(local slope, edge slope)/slope limit and Eflat is flat Wh/m under the
same rover. Risk penalty is heuristic, not probability. All heuristics are lower
bounds on these nonnegative edge costs. Slope mean and p95 are distance-weighted along-edge grades; max slope also
includes the largest local DEM gradient encountered.
Reported total distance is surface horizontal arc length; elevation gain/loss sums
the grid-center path. Feasibility is `undetermined` for a route within modeled
constraints because regional data cannot establish operational feasibility;
`infeasible` if grid/battery constraints fail. Stop on first blocked leg and report
partial metrics only for completed legs. Template objective describes purpose;
user optimization explicitly controls costs. No inferred target value.

## Deployment and regeneration

MOLA binary is intentionally gitignored. On a new backend, run the existing
`python scripts/fetch_mola.py` from `backend/`; without it capabilities advertise
unavailable terrain. Requests never download terrain. Product checksum is verified
on file changes. Lunar imagery and catalog summaries are not elevation data.
The generated `frontend/src/types/expedition-api.ts` uses only expedition routes
from backend OpenAPI; unrelated generated application types are left untouched.
