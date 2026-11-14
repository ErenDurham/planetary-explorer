# Scientific method

How every number in Planetary Explorer is produced, from a coordinate to a
score. Each section names the file that implements it. Where a threshold is a
choice rather than a measurement, it is labelled **assumption**, exactly as
the spec files label it.

Contents

1. [Coordinate conventions](#1-coordinate-conventions)
2. [Footprints and the harmonised baseline](#2-footprints-and-the-harmonised-baseline)
3. [Derived terrain statistics](#3-derived-terrain-statistics)
4. [Insolation model](#insolation)
5. [Landing suitability scoring](#5-landing-suitability-scoring)
6. [Earth analog matching](#6-earth-analog-matching)
7. [Retrieval and AI integrity](#7-retrieval-and-ai-integrity)
8. [Validation performed](#8-validation-performed)
9. [Known limitations](#9-known-limitations)

---

## 1. Coordinate conventions

| Body | Latitude | Longitude | Reference | CRS string in data |
|---|---|---|---|---|
| Mars | Planetocentric, degrees | East-positive, stored as **-180..180** | IAU2000 (the MOLA MEGDR convention) | `IAU2000:49900` |
| Earth | Geodetic (WGS84), degrees | East-positive, **-180..180** | WGS84 | `EPSG:4326` |

Both planets store longitude in -180..180 so the frontend uses one marker
formula (`GeographicFootprint.longitude_convention = "east_-180_180"`,
`backend/app/models/common.py`).

Two grids, two column origins:

- The **MOLA grid** (`megt90n000eb.img`) has column 0 at **0 E** and row 0 at
  90 N. `build_mars_profiles.py` indexes it as
  `row = (90 - lat) * 16`, `col = (lon mod 360) * 16`.
- The **globe texture** (`frontend/public/textures/mars_viking_4k.jpg`) is
  stitched with column 0 at **180 W** and row 0 at 90 N, so
  `u = (lon_east + 180) / 360`, `v = (90 - lat) / 180`.

Marker placement on a Three.js `SphereGeometry` of radius R
([ARCHITECTURE.md](ARCHITECTURE.md#coordinate-convention)):

```
x =  R cos(lat) cos(lon_east)
y =  R sin(lat)
z = -R cos(lat) sin(lon_east)
```

Check points: Olympus Mons (18.65 N, 226.2 E = -133.8 E) must sit on the
texture's largest volcano; Hellas (-42.4, 70.5 E) on the large southern basin.

Mars site positions are rover/lander touchdown points or the published centre
of the selected landing ellipse (`backend/data/mars/sites.json`,
`coordinate_convention`). Sign errors are the most likely coordinate bug: a
west-positive longitude pasted from an older paper, or a 0..360 value, will
place a marker on the wrong hemisphere while every number still looks
plausible.

## 2. Footprints and the harmonised baseline

A site is a **footprint**, not a point. Every measurement carries the
`GeographicFootprint` it summarises.

| | Mars | Earth |
|---|---|---|
| Shape | Square in degrees, centred on the site | Square in degrees, centred on the site |
| Half-width | **0.5 deg** (1.0 deg square) | **0.25 deg** (0.5 deg square) |
| Grid sampled | MOLA MEGDR 16 ppd | Copernicus GLO-90, 3 arc-second (92.66 m) |
| Cells in footprint | **289** (17 x 17: `window()` uses floor/ceil edges, and `sites.json` and every footprint `description` say so) | 600 x 600 pixels (360,000) below 50 deg latitude; 600 x 300 at Holuhraun (64.85 N); 600 x 200 at Haughton (75.38 N) and McMurdo (77.86 S), because GLO-90 tiles sample longitude 2x and 3x more coarsely there |
| Width on the ground | 59.27 km x cos(lat) E-W, 59.27 km N-S (Jezero 56.2 km, Utopia 39.9 km) | 55.6 km x cos(lat) E-W, 55.6 km N-S (Atacama 50.8 km, McMurdo 11.7 km) |
| Why this size | Large enough to hold enough MOLA cells for slope and roughness statistics; **far larger than any landing ellipse** | Earth analog field sites are typically a few tens of km across |

(`candidates.json`'s `footprint_definition` gives the full widths, "about
56 km N-S full width, 56*cos(lat) km E-W", matching the `approx_width_km`
values.)

### Why harmonise the baseline

Slope and roughness depend on the length over which they are measured. A 90 m
DEM resolves gullies and boulder fields that a 3.7 km grid averages away, so
computing slope on each planet's native grid and then comparing the two
numbers would compare two different physical quantities and would make every
Earth site look rougher than every Mars site regardless of the terrain.

The pipeline therefore **block-averages the Earth DEM to the MOLA cell size
before computing slope and roughness** (`block_average_xy()` in
`backend/scripts/geo.py`). The factor is computed **separately for each
axis** from the tile's true pixel sizes: N-S `fy = round(3705 m / 92.66 m)
= 40` everywhere, E-W `fx = round(3705 m / (E-W pixel in metres))`, where the
E-W pixel is the tile's longitude spacing (`ds.res[0]`, 1.5x to 3x coarser
than latitude above 50 degrees) times cos(latitude). So Atacama is averaged
40x44, Death Valley 40x50, Holuhraun 40x47, Haughton 40x53, McMurdo 40x63
(rows x cols, recorded in each profile's `pipeline` string), and the
harmonised cell is ~3.7 km in **both** directions at every latitude, which
every harmonised `spatial_resolution` string states. Both planets then pass
through the same `terrain_stats()` function at the same ~3.7 km baseline. The Earth profiles still carry the fine-scale statistics
(`elevation_*` on the 90 m grid, `slope_fine_median_deg`) labelled
"information only: Mars has no counterpart at this baseline in v1".

### What harmonising cannot fix

- It makes the two terrain measurements **commensurable**; it does not make
  them **meaningful at landing scale**. Both are regional, and every such
  value carries `quality_flag: regional_scale_only`.
- The MOLA grid is a **median of shots with interpolation** where shots are
  absent (about 45% of equatorial cells); the Copernicus grid is a complete
  radar DSM. Averaging the DSM does not reproduce MOLA's sampling pattern.
- The vertical datums differ (GMM3 areoid versus EGM2008 geoid), so absolute
  elevations are shown side by side but **never differenced** across planets.
- At high latitude the harmonised footprint holds few cells: McMurdo and
  Haughton have **45** harmonised cells against 195 at Atacama and 289 on
  every Mars site, so their regional slope and relief percentiles rest on a
  small sample. The per-axis block factors make the cells the right size;
  they cannot make a 12-14 km wide footprint hold more of them.

## 3. Derived terrain statistics

All in `backend/scripts/geo.py`, applied by `build_mars_profiles.py` and
`build_earth_profiles.py`. `z` is the footprint's elevation grid in metres.

| `feature_id` | Formula | Notes |
|---|---|---|
| `elevation_median_m` | median(z) | `measured`: a statistic of measured cells |
| `elevation_p10_m`, `elevation_p90_m` | 10th and 90th percentiles of z (`numpy.percentile`, linear interpolation) | `measured` |
| `elevation_std_m` | population standard deviation of z (`numpy.std`, ddof = 0) | `derived`; includes the regional tilt |
| `roughness_regional_m` | **detrended std**: fit the plane z = a·col + b·row + c by least squares (`numpy.linalg.lstsq`), then std of the residuals | `derived`; relief inside the footprint with the regional tilt removed. Not a proxy for rock abundance or decimetre-scale roughness |
| `slope_regional_median_deg` | slope = atan(sqrt(gx² + gy²)) in degrees, with (gy, gx) = `numpy.gradient(z, dy, dx)`: **central differences** on interior cells, one-sided at the edges; median over the grid | `derived` |
| `slope_regional_p90_deg` | 90th percentile of the same slope grid | `derived` |
| `cells` | number of cells in the grid | reported in `spatial_resolution` |

Cell spacing used in the gradient:

- Mars: dy = 2π · 3396 km / 360 / 16 = **3704.46 m** (`MARS_CELL_KM`; the
  label's `MAP_SCALE` is 3.705 km); dx = dy · cos(lat).
- Earth, fine: dy = 92.66 m (`ds.res[1]`); dx = `ds.res[0]` in metres ·
  cos(lat), which is 92.66 · cos(lat) below 50 deg and 1.5x, 2x or 3x that
  where the tile's longitude spacing is coarser. Coarse: dy · fy and dx · fx
  with the per-axis block factors of section 2.

Rounding in the stored profiles: elevations and roughness to 0.1 m, slopes to
0.001 deg, latitude to 0.0001 deg, insolation to 0.1 W/m2.

Non-numeric features in the profiles are `literature` tags
(`terrain_morphology`, `mineralogy_tags`, `water_ice_evidence`) copied from
`sites.json` / `candidates.json` with their cited source. Mars
`precipitation_mm_day` is the physical fact 0.0 (no liquid precipitation),
typed `literature`/`qualitative`, used only by the analog aridity feature.

Current Mars values (`site_profiles.v1.json`, generated 2026-11-14T16:19:15Z):

| Site | lat, lon_east | Elev. median (m) | Slope median (deg) | Slope p90 (deg) | Detrended relief (m) | TOA insolation (W/m2) |
|---|---|---|---|---|---|---|
| Jezero Crater | 18.4447, 77.4508 | -2129.0 | 1.077 | 3.233 | 194.4 | 170.4 |
| Gale Crater | -4.5895, 137.4417 | -3745.0 | 4.806 | 11.969 | 1139.2 | 178.1 |
| Elysium Planitia | 4.5024, 135.6234 | -2647.0 | 0.159 | 0.361 | 31.1 | 178.1 |
| Oxia Planum | 18.275, -24.632 | -3069.0 | 0.336 | 0.933 | 52.3 | 170.6 |
| Utopia Planitia | 47.67, 134.28 | -4498.0 | 0.232 | 0.492 | 22.3 | 127.8 |
| Chryse Planitia | 22.27, -47.95 | -3624.0 | 0.144 | 0.372 | 19.5 | 166.7 |
| Meridiani Planum | -1.9462, -5.5266 | -1434.0 | 0.242 | 1.606 | 84.1 | 178.5 |
| Gusev Crater | -14.5684, 175.4726 | -1907.0 | 0.167 | 0.692 | 36.7 | 173.5 |

Current Earth values (`candidate_profiles.v1.json`, generated
2026-11-14T16:19:15Z, rebuilt with the per-axis block factors; harmonised
slope and relief, fine slope for reference):

| Candidate | lat | Block factor (rows x cols) | Harmonised cells | Elev. median (m, EGM2008) | Slope median ~3.7 km (deg) | Slope p90 ~3.7 km (deg) | Relief ~3.7 km (m) | Fine slope (deg) | T2M annual (degC) | Precip. (mm/day) | Surface SW (W/m2) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Atacama - Yungay | -24.08 | 40x44 | 195 | 1153.9 | 1.166 | 3.047 | 126.5 | 2.743 | 17.07 | 0.02 | 300.2 |
| McMurdo Dry Valleys - University Valley | -77.86 | 40x63 | 45 | 1717.9 | 1.955 | 4.972 | 176.2 | 2.18 | -33.67 | 0.39 | 125.0 |
| Haughton impact structure | 75.38 | 40x53 | 45 | 248.4 | 0.567 | 1.184 | 44.6 | 3.438 | -14.42 | 0.85 | 96.5 |
| Death Valley - central basin | 36.46 | 40x50 | 180 | 615.4 | 3.542 | 9.279 | 589.2 | 5.874 | 19.1 | 0.34 | 237.6 |
| Holuhraun lava field | 64.85 | 40x47 | 90 | 927.8 | 1.628 | 3.413 | 227.3 | 1.878 | -2.84 | 2.36 | 124.2 |
| San Rafael Swell - MDRS | 38.41 | 40x51 | 165 | 1493.6 | 0.923 | 2.533 | 129.6 | 3.03 | 11.75 | 0.66 | 220.3 |
| Mauna Kea (summit-centred) | 19.82 | 40x42 | 210 | 1579.2 | 4.501 | 8.935 | 637.1 | 5.065 | 20.9 | 4.41 | 220.0 |

The fine slope is computed on the native grid with its true per-axis spacing
(93 m N-S; 85, 58, 70, 75, 79, 73 and 87 m E-W in the order above), so it is
not at one common baseline across candidates; its `notes` say "Information
only: Mars has no counterpart at this baseline in v1". Elevation statistics
are unchanged by the rebuild because they do not use the pixel size.

<a id="insolation"></a>
## 4. Insolation model

`feature_id`: `insolation_toa_annual_mean_wm2`, `source_id`:
`derived_toa_insolation`, function `toa_annual_mean_insolation_wm2(lat, planet)`
in `backend/scripts/geo.py`.

**What it is:** the annual mean of the daily-mean **top-of-atmosphere**
insolation at a given latitude, computed analytically from the planet's
orbital elements. It is a model output, not a measurement.

Daily-mean insolation at solar longitude Ls:

```
Q(Ls) = (S0 / pi) * (1 / r^2) * [ H sin(phi) sin(delta) + cos(phi) cos(delta) sin(H) ]
```

with

- S0 = **1361 W/m2** (solar constant at 1 AU),
- phi = latitude,
- delta = solar declination, `sin(delta) = sin(eps) sin(Ls)`, eps = obliquity,
- H = half-day arc, `cos(H) = -tan(phi) tan(delta)`, clipped to [-1, 1] so
  H = 0 is polar night and H = pi is polar day,
- r = heliocentric distance in AU, `r = a (1 - e^2) / (1 + e cos(nu))`, with
  true anomaly `nu = Ls - Ls_perihelion`.

Annual mean: Ls is sampled at 720 equal steps over 0..2pi and each sample is
weighted by its **dwell time**, proportional to r² (conservation of angular
momentum):

```
Q_annual = sum(Q(Ls) * r^2) / sum(r^2)
```

Orbital parameters (`ORBITS` in `geo.py`):

| Planet | a (AU) | e | obliquity (deg) | Ls of perihelion (deg) |
|---|---|---|---|---|
| Mars | 1.52368 | 0.0934 | 25.19 | 251.0 |
| Earth | 1.00000 | 0.0167 | 23.44 | 283.0 |

Checks (`backend/tests/test_pipeline_geo.py` and a direct run on 2026-11-14):

| Case | Model | Reference |
|---|---|---|
| Earth, equator | **415.6 W/m2** | textbook ~417 W/m2 (test tolerance 2%); S0/pi = 433.2 without obliquity |
| Mars, equator | 178.6 W/m2 | S_Mars/pi = 186.6 without obliquity (S_Mars = 1361/1.52368² = 586.2 W/m2) |
| Mars, 47.67 N (Utopia) | 127.8 W/m2 | |
| Mars, 89.9 N | 79.8 W/m2 | |
| Mars, 30 N vs 30 S | differ by < 8 W/m2 | eccentricity asymmetry only |

**Limits.** No atmosphere (Mars dust opacity can cut surface flux by tens of
percent), no clouds, no local horizon, no slope or aspect, no season exposed.
Across planets the value is dominated by heliocentric distance, not by site
character, which is why the analog spec gives this feature **weight 0** and
discloses it instead of matching on it. Within Mars it is a latitude-driven
proxy for solar-power availability and nothing more.

## 5. Landing suitability scoring

`backend/app/config/scoring_spec.json` (version **`landing-v1.1`**) and
`backend/app/services/scoring_engine.py`. Pure functions: no I/O, no
randomness, no language model.

Changelog, from the spec's `notes`: "landing-v1.1 (2026-11-14):
solar_illumination `full` knee moved from 185 to 178 W/m2 so that q = 1 is
attainable (see that criterion's rationale). Default weights, every other knee
and both default hard constraints are unchanged from landing-v1.0."
`EvaluateResponse.scoring_spec_version` and `/api/v1/health` both report
`landing-v1.1`.

### 5.1 Suitability functions

Every criterion maps a feature value x to a suitability q in [0, 1] by a
**piecewise-linear** function with two knees, `full` and `zero`:

```
lower_is_better:  q = 1 if x <= full;  q = 0 if x >= zero;  else q = (zero - x) / (zero - full)
higher_is_better: q = 1 if x >= full;  q = 0 if x <= zero;  else q = (x - zero) / (full - zero)
```

The knees are **documented assumptions** chosen for regional screening at the
~3.7 km MOLA baseline; the spec says in its `notes` that "none is an
established universal landing requirement".

| `criterion_id` | Feature | Direction | full (q=1) | zero (q=0) | Default weight | Rationale (from the spec, condensed) |
|---|---|---|---|---|---|---|
| `terrain_safety` | `slope_regional_median_deg` | lower is better | 2.0 deg | 10.0 deg | 35 | The 2 deg knee echoes the km-scale slope constraint reported for MER site selection (Golombek et al., 2003); the 10 deg cut-off is an **assumption** for coarse screening. Regional slopes cannot reveal lander-scale hazards |
| `elevation_suitability` | `elevation_median_m` | lower is better | -3000 m | +2000 m | 25 | Lower elevation means more atmosphere for EDL. Historical limits ranged from below -1.3 km (MER) to about +1 km or lower for guided-entry missions (MSL, Mars 2020); the knees are an **assumption** spanning that range |
| `surface_roughness` | `roughness_regional_m` | lower is better | 20 m | 300 m | 20 | Detrended std of MOLA elevation. Knees are **assumptions** tuned so smooth plains score near 1 and crater-wall-dominated footprints near 0. Not a proxy for rock abundance |
| `thermal_conditions` | `surface_temperature_mean_c` | higher is better | -40 degC | -100 degC | 10 | **Placeholder**: no Mars site carries this feature in v1, so the criterion is excluded and reported, never scored |
| `solar_illumination` | `insolation_toa_annual_mean_wm2` | higher is better | 178 W/m2 | 80 W/m2 | 10 | Latitude-driven proxy (section 4). The knees are the physical range of the feature under the pipeline's own model: equatorial annual mean 178.6 W/m2, polar 79.8 W/m2, so `full = 178` makes an equatorial site fully suitable and `zero = 80` a polar site unsuitable. The spec records that the earlier 185 W/m2 knee was S_Mars/pi = 186.6 W/m2 without obliquity, "a value no latitude attains", corrected 2026-11-14. Ignores dust and horizon |

Default weights sum to 100. Weights are accepted in 0..100 per criterion and
only their ratios matter.

### 5.2 Score

Over the **valid** criteria for a site (in the spec, weight > 0, feature
present as a finite number, not excluded by the missing-data policy):

```
q(s,i)   = f_i( x(s,i) )
Score(s) = 100 * sum_i( w_i * q(s,i) ) / sum_i( w_i )
```

Each reported `FactorScore` carries `normalized_weight = w_i / sum(w)` over the
valid set and `weighted_contribution = 100 * normalized_weight * q`, so the
contributions add up to the score. Scores are rounded to 0.01.

Worked example, Chryse Planitia under the default mission
(`docs/api_examples.json`, spec `landing-v1.1`): thermal is excluded, so the
valid weights are 35 + 25 + 20 + 10 = 90 and the normalised weights are
0.3889, 0.2778, 0.2222 and 0.1111. Slope 0.144 deg, elevation -3624 m and
relief 19.5 m all give q = 1 (contributions 38.89, 27.78 and 22.22);
insolation 166.7 W/m2 gives q = (166.7 - 80) / (178 - 80) = 0.8847
(contribution 9.83). Score = 100 x (35 + 25 + 20 + 10 x 0.8847) / 90 =
**98.72**, which is the value in the example. `completeness` reads
`criteria_requested 5, criteria_supported 4, fraction 0.8,
excluded_criteria ["thermal_conditions"]`.

### 5.3 Missing-data policy

A missing feature is `null` and is **never** treated as zero or imputed.

| Policy | Behaviour | Reported as |
|---|---|---|
| `common_feature_set` (default) | A criterion whose feature is missing on **any** evaluated site is dropped for **all** sites, so every ranked score is built from the same feature set. Weights are renormalised over the remaining criteria | one entry in `EvaluateResponse.warnings` per dropped criterion; `completeness.excluded_criteria` on every result; `FactorScore.excluded_reason` |
| `per_site_exclusion` | A criterion is dropped only for the sites that lack it | a response-level warning that "scores may be built from different feature sets and are not strictly comparable"; and, **per site**, the gaps are reported in that site's `completeness.excluded_criteria`, in its `limitations` ("Excluded criterion '...' for this site: feature ... missing (per_site_exclusion)") and in a response warning naming the site and the criteria |

If fewer than **two** valid criteria remain for a site, its `status` is
`insufficient_data` and `score` is `null`. A criterion with weight 0 or an
unknown `criterion_id` is dropped with the reason recorded.

Three further rules, from the rewritten engine (`scoring_engine.py`
docstring):

- **Completeness counts only criteria the user asked for.**
  `CriteriaCompleteness.criteria_requested` counts criteria with
  **weight > 0**: a slider set to zero is a choice, not a data gap, so it never
  lowers the completeness fraction.
- **Only a finite real number is a value.** A measurement whose `value` is
  `NaN`, `+/-inf` or a boolean is treated exactly like a missing one: not
  scored, not used to evaluate a hard constraint (`passed: null`, unevaluated),
  and reported as missing (`_is_finite_number()`).
- **A site with no profile is `insufficient_data`**, with a response warning
  ("site '...' has no environmental profile; reported as insufficient_data"),
  and it does not drag the other sites down: under `common_feature_set` the
  common set is computed over the sites that have profiles.

In v1, `thermal_conditions` is dropped on every evaluation because
`surface_temperature_mean_c` is missing on 8/8 Mars sites.

### 5.4 Hard constraints

A site failing any hard constraint is `ineligible` whatever its score. Each
constraint is `feature_id operator threshold` with operators `<=`, `>=`, `<`,
`>`, `abs<=`. When the feature is missing the constraint is **unevaluated**
(`passed: null`), listed under `eligibility.unevaluated_constraints` and in
`limitations`; it does not make the site ineligible.

Defaults (`default_hard_constraints`), both flagged `is_assumption: true`:

| `constraint_id` | Rule | Rationale (from the spec) |
|---|---|---|
| `max_elevation` | `elevation_median_m <= 2000` m | **Assumption**: footprints above +2 km leave too little atmosphere for current EDL architectures. Historical limits were lower; this is a permissive screening bound |
| `latitude_band` | `latitude_abs_deg <= 50` deg | **Assumption**: the 2015 NASA First Landing Site / Exploration Zone Workshop for human missions screened zones to within 50 degrees of the equator for solar power and thermal reasons. Applied as a documented default, not a rule for robotic landers |

All 8 v1 sites pass both defaults (highest latitude: Utopia at 47.67 deg;
highest median elevation: Meridiani at -1434 m). The user may add, remove or
change constraints in the request; they are echoed back with the results.

### 5.5 Status and ranking

`status` is `ineligible` if any constraint failed; otherwise `ok` if a score
exists; otherwise `insufficient_data`. `ranking_engine.rank()` orders by
(status: ok, insufficient_data, ineligible), then score descending, then
`site_id` ascending for determinism. Only `ok` rows receive a `rank`.

Text summaries: `favorable` lists criteria with q >= 0.75, `risks` those with
q < 0.4. (The explanation engine uses a different split, q >= 0.6, for its
favorable/unfavorable sections.)

Default-mission ranking on the committed v1 data (`api_examples.json`, spec
`landing-v1.1`): Chryse 98.72, Elysium 97.16, Oxia 96.60, Utopia 94.13,
Gusev 92.09, Meridiani 86.21, Jezero 80.46, Gale 64.14. The order is the same
as under `landing-v1.0`; every score rose because the insolation knee is now
attainable.

### 5.6 What the score is not

- Not a probability of landing success.
- Not a landing-safety certification: the terrain inputs are regional
  (~3.7 km) and cannot see metre-scale hazards.
- Not comparable across different missions or policies: it is **relative**
  to the criteria, weights and constraints in the request, which are echoed
  with the result together with `scoring_spec_version` so it can be
  reproduced.
- Not an input to the analog similarity, and the similarity is not an input
  to it. The two are independent by design.

## 6. Earth analog matching

`backend/app/config/analog_spec.json` (version `analog-v1.0`) and
`backend/app/services/analog_engine.py`.

### 6.1 Feature distances

For each feature i in the spec, a distance d_i between the Mars site and the
Earth candidate:

```
numeric:      d_i = | x_Mars,i - x_Earth,i | / scale_i            (scaled_absolute_difference)
tag sets:     d_i = 1 - |A ∩ B| / |A ∪ B|                          (jaccard_distance; 0 when both sets are empty)
```

| `feature_id` | Method | Scale | Default weight | Rationale (from the spec, condensed) |
|---|---|---|---|---|
| `slope_regional_median_deg` | scaled difference | 1.5 deg | 25 | Terrain gradient at the same ~3.7 km baseline on both planets; a 1.5 deg difference contributes d = 1 |
| `roughness_regional_m` | scaled difference | 100 m | 25 | Plane-removed relief at the harmonised cell size |
| `terrain_morphology` | Jaccard | - | 20 | Literature-sourced categorical tags (impact_crater, lava_plain, playa, ...) |
| `mineralogy_tags` | Jaccard | - | 20 | Literature-sourced composition tags (basalt, clays, sulfates, ...) |
| `precipitation_mm_day` | scaled difference | 1.0 mm/day | 10 | Mars = 0 (physical fact); Earth = NASA POWER climatology. Lower Earth precipitation = better aridity analog |
| `insolation_toa_annual_mean_wm2` | scaled difference | 100 W/m2 | **0** | Computed identically for both planets but dominated by heliocentric distance, so informational only: disclosed, not matched on |

A feature is **comparable** only if both sides have a non-missing value of the
right type: a **finite** real number (not `NaN`, `inf` or a boolean) for a
scaled difference, a **list of strings** for Jaccard. A scaled-difference
feature whose spec `scale` is zero, missing or not a finite positive number is
also non-comparable, rather than dividing by it. A non-comparable feature is
reported with `comparable: false` and a note (for example "missing on one
side; not imputed") and does not enter D. Non-finite values are echoed as
`null` in `mars_value` / `earth_value` so the response stays valid JSON.

### 6.2 Aggregate distance and similarity

Over comparable features with weight > 0:

```
D          = sum_i( w_i * d_i ) / sum_i( w_i )
Similarity = 100 / (1 + D)
```

`FeatureDistance.normalized_weight = w_i / sum(w)` and
`contribution = normalized_weight * d_i`, so the contributions sum to D.
Similarity lies in (0, 100] by construction, since every d_i >= 0 gives
D >= 0; the engine applies no clamp, and `test_analog_engine.py` asserts
`0 < similarity <= 100` on every match. `completeness_fraction` = comparable
weighted features / weighted features. Matches are sorted by similarity
descending, ties by candidate id; `rank` is assigned only when a similarity
exists. The caller may override any weight (0..100); unknown feature ids are
ignored with a warning, all-zero weights produce a warning and no similarity,
and a candidate with **no comparable weighted feature** is returned without a
similarity and with a warning naming it ("candidate '...' has no comparable
weighted feature with '...'; similarity undefined").

Worked example, Jezero Crater vs Atacama - Yungay under default weights
(`api_examples.json`, rebuilt Earth profiles): slope d = |1.077 - 1.166| / 1.5
= 0.0593; relief d = |194.4 - 126.5| / 100 = 0.679; terrain tags d = 1.0 (no
shared tag); mineralogy tags d = 1.0; precipitation d = |0 - 0.02| / 1.0 =
0.02. D = 0.25 x 0.0593 + 0.25 x 0.679 + 0.20 x 1.0 + 0.20 x 1.0 + 0.10 x
0.02 = **0.5866**; Similarity = 100 / 1.5866 = **63.03**. Next in the
example's top three: MDRS 61.53 (D 0.6251), McMurdo Dry Valleys 61.32
(D 0.6308).

### 6.3 Narrative fields

- `shared_characteristics`: the tag intersections, plus each numeric feature
  with d <= 0.5 ("close at the harmonised scale").
- `important_differences`: numeric features with d > 1.0.
- `noncomparable_variables`: per-feature non-comparable notes, followed by the
  spec's five **planetary disclosures**, attached to every match and echoed as
  `planetary_differences` on every response: atmospheric pressure (Mars ~0.6
  kPa vs Earth 101 kPa), gravity (3.71 vs 9.81 m/s2), radiation (no global
  magnetic field, thin atmosphere), temperature (qualitative only), and the
  elevation datum (GMM3 areoid vs EGM2008 geoid; absolute elevations shown
  but never differenced).
- `research_applications`: the candidate's documented `known_analog_use`,
  plus generic suggestions derived from shared terrain and mineral tags.
- `citations`: the union of the candidate's sources and both profiles'
  `source_id`s.

### 6.4 What the similarity is not

A heuristic index over the configured features, not a validated probability.
It compares regional terrain statistics, categorical literature tags and one
climate variable; it does not assess metre-scale morphology, measured
mineralogy, pressure, gravity or radiation.

## 7. Retrieval and AI integrity

### 7.1 Corpus and retrieval

**Corpus.** `backend/scripts/ingest_documents.py` builds
`backend/data/documents/` from a hand-curated list of real public URLs:
36 documents ingested, 2 failed (recorded in `manifest.json` with the reason,
never guessed around), 311 chunks of ~700-1000 characters with ~150
characters of overlap, split on paragraph then sentence boundaries. Every
chunk carries `chunk_id`, `document_id`, `title`, `institution`, `url`,
`publication_date` (from Crossref, a PDS3 `PRODUCT_CREATION_TIME` or the
page's own published-time tag; `null` otherwise), `geographic_relevance` and
character offsets into the stored full text. See
[DATA_SOURCES.md](DATA_SOURCES.md#10-scientific-document-corpus).

**Retrieval** (`backend/app/services/retrieval_engine.py`, `Retriever`).
`chunks.jsonl` is loaded once at start-up; nothing is fetched at request time.
Two backends sit behind one `retrieve(query, k, geographic_relevance)`:

- `local` (default, `EMBEDDING_BACKEND=local`, what CI runs): **Okapi BM25**
  over a simple tokeniser (`k1 = 1.5`, `b = 0.75`), built in memory from the
  chunk text plus title. No downloads, no optional dependency.
- `chroma-default` (`EMBEDDING_BACKEND=chroma-default`, needs
  `pip install -r requirements-ai.txt`): the BM25 ranking **plus** a ChromaDB
  collection persisted under `VECTOR_INDEX_DIR`, embedded with ChromaDB's
  default embedding function, built lazily from `chunks.jsonl` on first
  start-up. If the import, the model download or the index build fails, the
  retriever logs it once and continues with BM25 alone.

Ranking, in order: (1) the lexical rank list and, when available, the vector
rank list are fused with **Reciprocal Rank Fusion**, `score = sum over lists
of 1 / (60 + rank)`, so the two scores never need a common scale; (2) a
**metadata boost** x1.25 for a chunk whose `geographic_relevance` intersects
the request's (site id and region); (3) a **cheap reranker** x1.10 for a chunk
whose text mentions a distinctive geographic term from the request (e.g.
"jezero", "isidis"; generic words such as "crater" or "planitia" are
ignored). The top k (default 6) are returned as `EvidenceChunk`s with a
700-character excerpt. `status()` is `ok` when chunks are loaded, which is
what `/api/v1/health` reports on the committed data.

### 7.2 Query construction

`build_query()` in `explanation_engine.py` concatenates the site name, region,
description, heritage, tags, the labels of the scored criteria, and at most
300 characters of the user's optional `question`. The question is a **hint**
for retrieval, never an instruction (`ExplainRequest.question` docstring).

### 7.3 Deterministic explanation

`deterministic()` assembles `ExplanationSections` from the numbers alone:
factor lines sorted by weighted contribution (favorable if q >= 0.6, else
unfavorable), the result's `risks`, failed hard constraints, excluded criteria
and missing features under `missing_evidence`, up to four retrieved excerpts
and the top two analogs under `research_applications`, and two fixed
`future_investigation` lines (HiRISE/CTX DTMs; THEMIS/TES thermal inertia and
rock abundance). `generated_by` is `deterministic_fallback`; the two
limitations state that no language model was used and that citations point at
retrieved passages only.

### 7.4 The language-model path and its guards

`explanation_engine.explain()` is the only entry point. The LLM path runs
only when `ANTHROPIC_API_KEY` is set and `LLM_PROVIDER` is `anthropic`
(default model `claude-sonnet-5`, `app/config/settings.py`); the `anthropic`
SDK is imported lazily from `requirements-ai.txt`. Otherwise, and on any
failure, `deterministic()` runs. The call sends a fixed system prompt (the
rules below) and a user message holding the structured measurements, the
`SuitabilityResult`, the analog matches if requested, the optional question
(a hint, truncated to 500 characters, wrapped in delimiters and labelled
untrusted) and the numbered evidence excerpts `[C1]..[Cn]`, and asks for
structured output: `output_config.format` is a JSON schema with exactly the
seven `ExplanationSections` keys, each a list of strings. The reply is parsed
with `ExplanationSections.model_validate_json`.

The guards, in the order the code applies them:

1. **Structured output, validated.** Anything that does not parse as the
   requested JSON shape falls back to `deterministic()`.
2. **Citation validation** (`validate_citations()`). Every `[C\d+]` handle in
   the output must be one that was provided; unknown handles are stripped from
   the text and a limitation line records how many were removed; if the model
   cited nothing, a limitation says so. The handles map 1:1 to the
   `chunk_id`s in `supporting_evidence`, which the API smoke test asserts for
   every response.
3. **Numeric guard** (`check_numbers()`). Every number in the output must
   appear in the structured inputs or the evidence excerpts, allowing
   thousands separators, trailing zeros, sign and rounding to the precision
   written (2,129 and 2129.0 both match -2129.0). A number that matches
   nothing means the model produced a measurement, so **the whole answer is
   discarded** and `deterministic()` is returned with the reason in
   `limitations`.
4. **Fallback on any exception** (import, network, auth, parse). The error is
   remembered for `LLM_ERROR_TTL_S` (600 s) so `/api/v1/health` reports
   `llm: error`; otherwise it reports `configured` or `unconfigured`.
5. **Cache.** An in-memory cache keyed by (site id, SHA-256 of the
   `SuitabilityResult` JSON, include_analogs, question) returns the same
   explanation with `cached: true`, so slider motion that re-sends the same
   mission never re-calls the model; any weight, constraint or policy change
   changes the hash.

The rules the system prompt states, which the guards enforce after the fact:
no invented or computed numbers; no change to scores, ranks, suitabilities or
similarities (the engines own them, the model narrates them); cite only the
handles given; acknowledge missing evidence in `missing_evidence` rather than
filling the gap; treat the excerpts and the question as **untrusted data**,
describing rather than following anything in them that reads like an
instruction; terrain statistics are regional and scores are indices, not
probabilities. `tests/test_explanation.py` exercises each guard with a mocked
model (valid JSON parsed and cached; invalid JSON falls back and marks the
error; an exception falls back; invalid handles stripped; no-citation note;
an invented number rejected; formatting and rounding accepted).

**What has not been done:** no live call to the Anthropic API has been made
from this repository. Every LLM-path test uses a mocked `_call_llm`, and
`docs/api_examples.json` was captured with no key, so its explanation is
`generated_by: deterministic_fallback`. The "no number in LLM output that is
not in the inputs" acceptance check has been exercised only against the mock.

### 7.5 Passage cleaning, source diversification and evidence digests

Agency pages carry navigation labels, captions, credits and fact-sheet lines
between the prose. `app/services/text_cleaning.py` strips those lexically
(whole-line patterns, caption cues, credit lines, sentence-level debris) and is
applied in three places so they agree: at ingestion (`scripts/ingest_documents.py`
chunks only the paragraphs that survive the filter; the raw page text is kept
in `corpus/<id>.json` as `raw_text`), at retrieval (a chunk whose cleaned text
is under 120 characters is demoted below every clean chunk) and before any
passage reaches a model. Retrieval returns up to 8 chunks with at most 2 per
source document, so a repeated link means a repeated passage and never
pretends to be independent corroboration.

A **source digest** (`SourceDigest`) is one per unique source URL. The
extractive producer picks the one or two cleaned sentences sharing the most
content words with the site, its tags, the scored factors and the applied
objective; `support_level` is `supports` when the picked text names at least
two site-specific terms (generic words such as "crater", "nasa" or "landing"
do not count) or one plus an objective term, `context` when it is background,
and `insufficient` when no sentence overlaps at all - in which case the digest
says so rather than inventing relevance. A model digest is admitted only if
its `document_id` is a retrieved source, every `chunk_id` belongs to that
source, every number it states occurs in that source's passages, and at least
45% of its content words occur in those passages. That overlap test is
lexical: it shows the wording came from the passage, not that the claim is
scientifically right. A mission overview can document landing context without
validating a model score.

### 7.6 Research study cards

`research_studies` holds at most three `StudyCard`s. The deterministic
builder proposes a card only when the inputs motivate it: a measured regional
terrain profile plus a retrieved passage about the topographic dataset or
landing-site selection; cited composition or aqueous tags plus a passage that
mentions them; an Earth analog whose SHARED characteristics are terrain (a
mineralogy-only match does not motivate a traverse). Every card states a
research question, a method, why this site or analog helps, the exact
motivating citation handles and what cannot be inferred. Documented analog
campaigns come from `candidates.json` and are labelled `documented_campaign`
on the Compare page, never as proposals. Model-proposed cards pass
`accept_llm_card`: cited handles must exist, the cited passages must
lexically support the question, no unknown numbers, and `kind` must be
`proposed_study`. When nothing can be motivated the list is empty and
`evidence_gap` explains why.

### 7.7 Objective interpretation and priority guidance

`POST /mission/interpret` turns free text into PROPOSED weights for the
existing criteria. The rule-based reader (lexicon per criterion; emphasis,
exclusion and de-emphasis cues; "X over Y" trade-offs; a list of out-of-scope
needs such as ice, a permanent base, the Moon or radiation that it refuses to
score) always runs; a configured model may propose instead. Both proposals
pass `validate_proposal`: unknown criterion ids are dropped, weights are
integers clamped to 0-100, criteria the client reports as data-unavailable
(thermal in v1) are forced to 0, and at least one available criterion must be
positive. Hard constraints and scoring thresholds are not part of the request
or response. Confidence refers to the reading of the text, never to site
suitability.

`POST /mission/guidance` evaluates the previous and new weights with the
scoring engine and reports effective influence before and after,
de-emphasised factors, rank deltas, the leader and missing data; the only
thing a model may do is phrase the summary, and the numeric guard rejects any
number not present in those facts. The Earth-comparison weights are not
involved.

## 8. Validation performed

### 8.1 Quality check before store

The data pipeline is `Fetch -> Sample footprint -> Terrain statistics ->
Quality check -> Store`. The quality-check step is
`backend/scripts/validate_profiles.py`, run from `backend/` after either
build script and before the output is committed (it is also what
`tests/test_profiles_sanity.py` imports, so CI runs the same checks). It
validates every profile against the `EnvironmentalProfile` model and then the
invariants every engine relies on: a unit on every numeric, non-missing
measurement; elevations inside the MOLA label range [-8177, 21171] m (Earth
EGM2008 elevations also fall inside it, so one bound serves both planets);
slopes in [0, 90] deg, roughness >= 0, TOA insolation in (0, 600) W/m2;
latitude in [-90, 90], longitude in [-180, 180], footprint centres matching
the site; every `source_id` resolving in the profile's own `sources`; every
missing measurement `null` with `quality_flag: missing`; completeness
arithmetic matching the measurement list; every site in `sites.json` /
`candidates.json` having a profile and vice versa; and, when the raw MOLA
grid is present, Olympus Mons > 15000 m and Hellas < -5000 m. It prints one
row per profile and exits 1 on any failure.

Its summary on the committed data (2026-11-14):

```
ok   olympus_mons (18.65, 226.2E) = 20046 m, expected > 15000 m
ok   hellas_basin (-42.4, 70.5E) = -6072 m, expected < -5000 m
grid extremes -8177 .. 21171 m match the MEGDR label
15 profiles checked (8 Mars, 7 Earth); 0 failure(s)
```

### 8.2 Checks and results

| Check | Where | Result (2026-11-14) |
|---|---|---|
| MOLA grid extremes equal the label's -8177 / 21171 m | `build_mars_profiles.load_grid()` assertion | passes on every build |
| Landmark cells: Olympus Mons > 15000 m, Hellas < -5000 m | `build_mars_profiles.main()` assertion | Olympus 20046 m, Hellas -6072 m |
| Landmark cells: Jezero, Gale, InSight | coordinator spot-check against the raw grid | -2628, -4509, -2595 m |
| MOLA cell size 3.705 km | `test_mola_cell_size` | 3.7045 km |
| Slope of a plane rising 100 m per 1000 m cell = atan(0.1) | `test_slope_of_plane` | passes |
| Detrended std of a perfect plane = 0 | `test_detrended_std_removes_tilt` | passes |
| Block average shape and mean | `test_block_average_shape_and_mean` | passes |
| Slope combines both gradients and respects anisotropic (non-square) cell spacing, which is what the per-axis Earth harmonisation relies on | `test_slope_combines_both_gradients_and_respects_anisotropic_cells` | passes. (`block_average_xy` itself has no dedicated test; `block_average` does) |
| Insolation monotone toward the poles, Mars equator in 170..195, N/S asymmetry < 8 W/m2, Earth equator = 417 +/- 2% | `test_insolation_decreases_toward_poles_and_is_symmetric_enough` | passes; Earth equator 415.6 |
| Piecewise-linear bounds and midpoints | `test_piecewise_linear_bounds_and_direction` | passes |
| Weight normalisation and score formula (30/10 weights, q = 0.5 each -> 50.0) | `test_weight_normalisation_and_score_formula` | passes |
| `common_feature_set` drops a criterion for all sites; missing reported, not zeroed | `test_common_feature_set_drops_criterion_for_all_sites` | passes |
| `insufficient_data` below two criteria | `test_insufficient_data_when_fewer_than_two_criteria` | passes |
| Hard constraint -> `ineligible`, no rank | `test_hard_constraint_makes_site_ineligible_despite_high_score` | passes |
| Ranking order and determinism | `test_ranking_is_deterministic_and_orders_statuses` | passes |
| Jaccard distance cases | `test_jaccard` | passes |
| D and 100/(1+D) recomputed from the response; weights sum to 1; pressure disclosed; sorted | `test_similarity_formula_and_noncomparable_disclosure` | passes |
| Custom weights change the ranking; unknown weight warns | `test_custom_weights_change_ranking_and_zero_weights_warn` | passes (terrain-only weights rank Haughton first for Jezero) |
| End-to-end API: health, sites, profile, 404 envelope, evaluate, 422 on zero weights, match, explain; contributions sum to score; citations subset of evidence | `test_api_smoke.py` (7 tests) | passes |
| Engine edge cases: weight-0 criteria excluded from `criteria_requested`; NaN / inf / bool treated as missing; site without a profile is `insufficient_data`; per-site gaps reported under `per_site_exclusion`; zero or invalid analog scale non-comparable; non-list tags non-comparable; nothing-comparable candidate warned; similarity in [0, 100] | `test_scoring_engine.py`, `test_analog_engine.py` (synthetic profiles from `tests/factories.py`) | passes |
| Committed profiles: counts (8 Mars, 7 Earth, both `v1`), every numeric value has a unit and is finite, elevations inside the MOLA label range, slopes in [0, 90], roughness >= 0, insolation in (0, 600) W/m2, footprint centres in range, every `source_id` resolves, missing values are `null` with `quality_flag: missing`, completeness arithmetic, membership against `sites.json` / `candidates.json` | `test_profiles_sanity.py`, which imports the same checks from `scripts/validate_profiles.py` | passes |
| Corpus and retrieval: fixture HTML chunked with metadata; a JavaScript shell rejected rather than invented; chunk bounds and overlap; Crossref record dated and without an invented abstract; metadata boost; term reranker; empty index is `unavailable`; missing chromadb falls back to local; on the real corpus a Jezero query returns a Jezero chunk first, every site has coverage and the manifest is consistent | `test_retrieval.py` | passes |
| Explanation guards (section 7.4) with a mocked model | `test_explanation.py` | passes |
| **Total** | `cd backend && .venv/bin/python -m pytest -q` | **244 passed** in 0.36 s (2026-11-14) |
| All 11 DOIs resolve and match title / first author / year | Crossref, coordinator | 11 of 11 |
| Smith et al. (2001) DOI 10.1029/2000JE001364 resolves to the MOLA experiment-summary paper | Crossref, pipeline author | matches |
| All agency URLs in `sites.json` and `candidates.json` return HTTP 200 | coordinator | all; Mars 2020 redirects to the stored URL |
| Earth equatorial TOA insolation vs textbook | `geo.py` | 415.6 vs ~417 W/m2 |

## 9. Known limitations

Scientific:

- Terrain statistics are regional (~3.7 km) on both planets. They cannot
  certify lander-scale safety or detect boulders, scarps or dunes.
- MOLA cells are shot medians with interpolation where no shot fell (about
  45% of equatorial cells), so fine relief is smoothed unevenly.
- Four Mars features are missing on every site (temperature, pressure, rock
  abundance, dust cover); the thermal criterion is therefore never scored.
- Composition and morphology are literature-derived categorical tags, not
  spectral measurements, and the tag vocabulary is small, so Jaccard
  distances are coarse (many pairs share no tag and get d = 1).
- Earth climate comes from a 0.5 x 0.625 degree reanalysis and does not
  resolve valley or summit microclimates; `T2M` is air temperature, not
  ground temperature.
- The insolation value is top-of-atmosphere and latitude-only.
- All scoring knees and both default hard constraints are assumptions.

Inconsistencies found between code, data and documentation while writing this
page, with their status as of 2026-11-14:

1. **Resolved.** `build_earth_profiles.py` assumed square pixels in degrees,
   over-estimating slopes at Holuhraun, Haughton and McMurdo. It now reads
   both pixel sizes and block-averages with separate N-S and E-W factors
   (`geo.block_average_xy`), and `candidate_profiles.v1.json` was rebuilt
   (section 2 and section 3 carry the new values).
2. **Resolved.** The `solar_illumination` `full` knee moved from 185 to
   178 W/m2 in spec `landing-v1.1`, with the change recorded in the spec's
   `notes` and the criterion's rationale; q = 1 is attainable at the equator.
3. **Resolved.** `sites.json`, `build_mars_profiles.py` and every Mars
   footprint `description` now say "17x17 MOLA 16 ppd cells (floor/ceil
   edges)".
4. **Resolved.** `candidates.json` now gives the full width ("about 56 km
   N-S full width, 56*cos(lat) km E-W").
5. **Resolved.** The "~41" comment is gone; the factor is per axis and stored
   in each profile's `pipeline` string.
6. **Resolved.** The MOLA `uncertainty_notes` attribute the ~1 m radial shot
   accuracy to Smith et al. (2001), J. Geophys. Res. 106(E10),
   doi:10.1029/2000JE001364, and say it is not stated in the product label.
7. **Resolved.** `scripts/ingest_documents.py`, `data/documents/chunks.jsonl`
   (311 chunks) and `requirements-ai.txt` all exist; retrieval reports `ok`.
8. **Open.** `usgs_planetary_nomenclature` and `lit_golombek_mer_sites` are
   declared in `sites.json` but attached to no site, so they never appear in
   a profile's `sources`. (Both are in the document corpus, so they can be
   cited by an explanation.)
9. **Open.** `candidates.json` still records the POWER climatology period as
   "multi-decade climatology (see API header)"; the pipeline does not store
   the header's span.
