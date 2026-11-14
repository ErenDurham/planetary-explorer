# API Contracts (v1)

Source of truth: the Pydantic models in `backend/app/models/` and the generated
[`docs/openapi.json`](openapi.json). This page is the human-readable summary with
live examples captured from the committed v1 data (`docs/api_examples.json`).
Regenerate both with `python scripts/export_contracts.py` after changing a model.

Base path: `/api/v1`. All bodies are JSON. All timestamps ISO-8601 UTC.
Longitudes are east-positive in -180..180. Units are stated per field and never
implied.

## Conventions

| Topic | Rule |
|---|---|
| Nullability | A missing measurement has `"value": null, "is_missing": true`. Never 0. Optional request fields default as shown in the schema. |
| Errors | Every non-2xx response is `{"error": {"code", "message", "details"}}`. Codes: `not_found` (404), `validation_error` (422), `unsupported_planet` (422), `data_unavailable` (503), `http_error`. |
| Stale responses | `POST /scoring/evaluate` echoes `client_request_id`; the client must drop any response whose id is not the latest it issued. |
| Versions | `profile_version`, `scoring_spec_version`, `analog_spec_version` are echoed in responses so results are reproducible. |
| Scores | `SuitabilityResult.score` is 0-100 relative index; `AnalogMatch.similarity` is 0-100 heuristic index. Neither is a probability. |

## Endpoints

### `GET /health` → `HealthResponse`
```json
{
  "status": "ok",
  "version": "0.1.0",
  "profile_version": "v1",
  "scoring_spec_version": "landing-v1.0",
  "services": {
    "data": "ok",
    "retrieval": "unavailable",
    "llm": "unconfigured"
  }
}
```

### `GET /sites?planet=mars` → `SiteListResponse`
`planet=earth` returns 422 `unsupported_planet` in v1 (Earth locations are analog candidates, see `/analogs/match`).
```json
{
  "planet": "mars",
  "sites": [
    {
      "id": "jezero_crater",
      "planet": "mars",
      "name": "Jezero Crater",
      "region": "Nili Fossae / Isidis basin rim",
      "lat": 18.4447,
      "lon_east": 77.4508,
      "footprint": {
        "shape": "square",
        "center_lat": 18.4447,
        "center_lon_east": 77.4508,
        "half_width_deg": 0.5,
        "radius_km": null,
        "crs": "IAU2000:49900",
        "longitude_convention": "east_-180_180",
        "approx_width_km": 56.2,
        "description": "1.0 deg square centred on the site; ~16x16 MOLA 16 ppd cells"
      },
      "description": "A ~45 km impact crater holding an ancient lake basin with a well-preserved river delta on its western margin. Chosen for Perseverance for its lacustrine and ...",
      "heritage": "NASA Mars 2020 Perseverance landing site (2021)",
      "tags": [
        "basalt",
        "carbonates",
        "... (6 more)"
      ],
      "coordinate_sources": [
        "nasa_m2020_landing_site"
      ]
    }
  ],
  "profile_version": "v1"
}
```

### `GET /sites/{id}` → `SiteWithProfile`
Every `measurement.source_id` resolves to a key of `profile.sources` (a `Provenance`).
```json
{
  "site": {
    "id": "jezero_crater",
    "planet": "mars",
    "name": "Jezero Crater",
    "region": "Nili Fossae / Isidis basin rim",
    "lat": 18.4447,
    "lon_east": 77.4508,
    "footprint": {
      "shape": "square",
      "center_lat": 18.4447,
      "center_lon_east": 77.4508,
      "half_width_deg": 0.5,
      "radius_km": null,
      "crs": "IAU2000:49900",
      "longitude_convention": "east_-180_180",
      "approx_width_km": 56.2,
      "description": "1.0 deg square centred on the site; ~16x16 MOLA 16 ppd cells"
    },
    "description": "A ~45 km impact crater holding an ancient lake basin with a well-preserved river delta on its western margin. Chosen for Perseverance for its lacustrine and ...",
    "heritage": "NASA Mars 2020 Perseverance landing site (2021)",
    "tags": [
      "basalt",
      "carbonates",
      "... (6 more)"
    ],
    "coordinate_sources": [
      "nasa_m2020_landing_site"
    ]
  },
  "profile": {
    "site_id": "jezero_crater",
    "planet": "mars",
    "profile_version": "v1",
    "generated_at": "2026-11-14T15:48:04+00:00",
    "pipeline": "scripts/build_mars_profiles.py: MOLA MEGDR 16 ppd footprint sampling + scripts/geo.py terrain statistics + analytic TOA insolation",
    "measurements": [
      {
        "feature_id": "elevation_median_m",
        "label": "Elevation (footprint median)",
        "category": "ground",
        "value": -2129.0,
        "unit": "m",
        "source_id": "mola_megdr_16ppd",
        "measurement_type": "measured",
        "spatial_resolution": "~3.7 km cells (16 ppd); 289 cells in footprint",
        "geographic_footprint": {
          "shape": "square",
          "center_lat": 18.4447,
          "center_lon_east": 77.4508,
          "half_width_deg": 0.5,
          "radius_km": null,
          "crs": "IAU2000:49900",
          "longitude_convention": "east_-180_180",
          "approx_width_km": 56.2,
          "description": "1.0 deg square centred on the site; ~16x16 MOLA 16 ppd cells"
        },
        "uncertainty": "Cell medians of MOLA shots; interpolated where no shot; relative to GMM3 areoid",
        "quality_flag": "good",
        "is_missing": false,
        "notes": null
      },
      {
        "feature_id": "elevation_p10_m",
        "label": "Elevation (10th percentile)",
        "category": "ground",
        "value": -2641.4,
        "unit": "m",
        "source_id": "mola_megdr_16ppd",
        "measurement_type": "measured",
        "spatial_resolution": "~3.7 km cells (16 ppd); 289 cells in footprint",
        "geographic_footprint": {
          "shape": "square",
          "center_lat": 18.4447,
          "center_lon_east": 77.4508,
          "half_width_deg": 0.5,
          "radius_km": null,
          "crs": "IAU2000:49900",
          "longitude_convention": "east_-180_180",
          "approx_width_km": 56.2,
          "description": "1.0 deg square centred on the site; ~16x16 MOLA 16 ppd cells"
        },
        "uncertainty": null,
        "quality_flag": "good",
        "is_missing": false,
        "notes": null
      },
      "... (1 more)"
    ],
    "sources": {
      "mola_megdr_16ppd": {
        "source_id": "mola_megdr_16ppd",
        "title": "MGS MOLA Mission Experiment Gridded Data Record (MEGDR), 16 pixel/degree global topography (MEGT90N000EB)",
        "institution": "NASA PDS Geosciences Node / Goddard Space Flight Center (MOLA Science Team)",
        "url": "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.lbl",
        "instrument_or_model": "Mars Global Surveyor / Mars Orbiter Laser Altimeter (MOLA)",
        "dataset_id": "MGS-M-MOLA-5-MEGDR-L3-V1.0 / MEGT90N000EB.IMG v2.0",
        "coverage": "Global, 90N-90S, 0-360E; simple cylindrical; IAU2000; areoid GMM3 (mgm1025) to degree and order 50",
        "spatial_resolution": "0.0625 deg (16 ppd) = ~3.7 km per cell at the equator",
        "units": "metres (planetary radius minus areoid radius)",
        "observation_period": "1997-09-15 to 2001-06-30 (MGS mapping, primary and extended missions)",
        "uncertainty_notes": "Each cell is the MEDIAN of MOLA shots inside it; near the equator only ~55% of cells contain a shot and the rest are interpolated, with gaps of up to 12 km b...",
        "access_method": "HTTPS download of the raw binary + PDS3 label (scripts/fetch_mola.py)",
        "license": "NASA PDS data are public domain; cite the MOLA Science Team",
        "retrieved_at": "2026-11-14"
      },
      "derived_toa_insolation": {
        "source_id": "derived_toa_insolation",
        "title": "Top-of-atmosphere annual-mean insolation from latitude and orbital elements",
        "institution": "Planetary Explorer pipeline (scripts/geo.py)",
        "url": "docs/SCIENTIFIC_METHOD.md#insolation",
        "instrument_or_model": "Analytic daily-mean insolation integrated over one orbit (a=1.52368 AU, e=0.0934, obliquity 25.19 deg, Ls_perihelion 251 deg, S0=1361 W/m2)",
        "dataset_id": null,
        "coverage": "Any latitude",
        "spatial_resolution": "Latitude only; no terrain or atmosphere",
        "units": "W/m2",
        "observation_period": null,
        "uncertainty_notes": "Model output, not a measurement. Ignores atmospheric dust opacity (which can cut surface flux by tens of percent) and local horizon. Use as a latitude-driven...",
        "access_method": "computed",
        "license": "n/a",
        "retrieved_at": null
      },
      "nasa_m2020_landing_site": {
        "source_id": "nasa_m2020_landing_site",
        "title": "Mars 2020 Perseverance Rover - Science (Jezero Crater landing site)",
        "institution": "NASA Science / JPL",
        "url": "https://science.nasa.gov/mission/mars-2020-perseverance/science/",
        "instrument_or_model": null,
        "dataset_id": null,
        "coverage": null,
        "spatial_resolution": null,
        "units": null,
        "observation_period": null,
        "uncertainty_notes": null,
        "access_method": "web page",
        "license": null,
        "retrieved_at": null
      },
      "lit_jezero_mineralogy": {
        "source_id": "lit_jezero_mineralogy",
        "title": "Goudge et al. (2015), Assessing the mineralogy of the watershed and fan deposits of the Jezero crater paleolake system, Mars, J. Geophys. Res. Planets 120",
        "institution": "AGU (peer-reviewed literature)",
        "url": "https://doi.org/10.1002/2014JE004782",
        "instrument_or_model": null,
        "dataset_id": null,
        "coverage": null,
        "spatial_resolution": null,
        "units": null,
        "observation_period": null,
        "uncertainty_notes": null,
        "access_method": "DOI",
        "license": null,
        "retrieved_at": null
      }
    },
    "completeness": {
      "features_requested": 17,
      "features_available": 13,
      "fraction": 0.765,
      "missing_feature_ids": [
        "surface_temperature_mean_c",
        "atmospheric_pressure_pa",
        "... (2 more)"
      ]
    }
  }
}
```

### `GET /scoring/default-mission`
The scoring spec's default weights, hard constraints and per-criterion rationale, so sliders initialise from the backend.

### `POST /scoring/evaluate` : `EvaluateRequest` → `EvaluateResponse`
Request:
```json
{
  "planet": "mars",
  "site_ids": null,
  "mission": {
    "mission_phase": "landing",
    "criteria": [
      {
        "criterion_id": "terrain_safety",
        "weight": 35.0
      },
      {
        "criterion_id": "elevation_suitability",
        "weight": 25.0
      },
      "... (3 more)"
    ],
    "hard_constraints": [
      {
        "constraint_id": "max_elevation",
        "feature_id": "elevation_median_m",
        "operator": "<=",
        "threshold": 2000.0,
        "rationale": "ASSUMPTION: footprints with median elevation above +2 km leave too little atmosphere for current EDL architectures. Historical mission limits were lower; thi...",
        "is_assumption": true
      },
      {
        "constraint_id": "latitude_band",
        "feature_id": "latitude_abs_deg",
        "operator": "<=",
        "threshold": 50.0,
        "rationale": "ASSUMPTION: the 2015 NASA First Landing Site / Exploration Zone Workshop for human missions screened candidate zones to within 50 degrees of the equator for ...",
        "is_assumption": true
      }
    ],
    "missing_data_policy": "common_feature_set"
  },
  "client_request_id": "req-42"
}
```
Response (results sorted: `ok` by score desc, then `insufficient_data`, then `ineligible`; only `ok` rows carry `rank`):
```json
{
  "results": [
    {
      "site_id": "chryse_planitia",
      "site_name": "Chryse Planitia (Viking 1)",
      "status": "ok",
      "score": 98.06,
      "rank": 1,
      "factor_scores": [
        {
          "criterion_id": "terrain_safety",
          "label": "Terrain safety (regional slope)",
          "feature_id": "slope_regional_median_deg",
          "feature_value": 0.144,
          "unit": "deg",
          "suitability": 1.0,
          "raw_weight": 35.0,
          "normalized_weight": 0.3888888888888889,
          "weighted_contribution": 38.88888888888889,
          "is_missing": false,
          "excluded_reason": null,
          "rationale": "Lower regional slopes reduce the chance that a landing ellipse spans tilted terrain such as crater walls or rises. The 2 deg 'fully suitable' knee echoes the..."
        },
        {
          "criterion_id": "elevation_suitability",
          "label": "Elevation suitability (EDL atmosphere)",
          "feature_id": "elevation_median_m",
          "feature_value": -3624.0,
          "unit": "m",
          "suitability": 1.0,
          "raw_weight": 25.0,
          "normalized_weight": 0.2777777777777778,
          "weighted_contribution": 27.77777777777778,
          "is_missing": false,
          "excluded_reason": null,
          "rationale": "Lower elevation means a thicker atmospheric column for entry, descent and landing deceleration. Historical engineering limits ranged from below -1.3 km (MER,..."
        }
      ],
      "eligibility": {
        "eligible": true,
        "failed_constraints": [],
        "unevaluated_constraints": []
      },
      "completeness": {
        "criteria_requested": 5,
        "criteria_supported": 4,
        "fraction": 0.8,
        "excluded_criteria": [
          "thermal_conditions"
        ]
      },
      "favorable": [
        "Terrain safety (regional slope): 0.144 deg scores 1.00",
        "Elevation suitability (EDL atmosphere): -3624 m scores 1.00",
        "... (2 more)"
      ],
      "risks": [],
      "limitations": [
        "Excluded criterion 'thermal_conditions': feature surface_temperature_mean_c missing on 8/8 sites; excluded for all under common_feature_set",
        "Terrain metrics are regional (~3.7 km MOLA baseline) and cannot certify lander-scale safety.",
        "... (1 more)"
      ]
    }
  ],
  "scoring_spec_version": "landing-v1.0",
  "profile_version": "v1",
  "mission": {
    "mission_phase": "landing",
    "criteria": [
      {
        "criterion_id": "terrain_safety",
        "weight": 35.0
      },
      {
        "criterion_id": "elevation_suitability",
        "weight": 25.0
      },
      "... (3 more)"
    ],
    "hard_constraints": [
      {
        "constraint_id": "max_elevation",
        "feature_id": "elevation_median_m",
        "operator": "<=",
        "threshold": 2000.0,
        "rationale": "ASSUMPTION: footprints with median elevation above +2 km leave too little atmosphere for current EDL architectures. Historical mission limits were lower; thi...",
        "is_assumption": true
      },
      {
        "constraint_id": "latitude_band",
        "feature_id": "latitude_abs_deg",
        "operator": "<=",
        "threshold": 50.0,
        "rationale": "ASSUMPTION: the 2015 NASA First Landing Site / Exploration Zone Workshop for human missions screened candidate zones to within 50 degrees of the equator for ...",
        "is_assumption": true
      }
    ],
    "missing_data_policy": "common_feature_set"
  },
  "warnings": [
    "criterion 'thermal_conditions' excluded: feature surface_temperature_mean_c missing on 8/8 sites; excluded for all under common_feature_set"
  ],
  "client_request_id": "req-42"
}
```

Validation: at least one criterion with weight > 0 (else 422); unknown `site_ids` → 404 with the ids in `details`.
`warnings` lists every criterion excluded under the missing-data policy and why.

### `POST /analogs/match` : `MatchRequest` → `MatchResponse`
Request: ```json
{
  "mars_site_id": "jezero_crater",
  "weights": null,
  "top_k": 3
}
```
Response:
```json
{
  "mars_site_id": "jezero_crater",
  "matches": [
    {
      "mars_site_id": "jezero_crater",
      "earth_candidate": {
        "id": "atacama_yungay",
        "name": "Atacama Desert - Yungay region",
        "region": "Antofagasta Region",
        "country": "Chile",
        "lat": -24.08,
        "lon_east": -69.95,
        "footprint": {
          "shape": "square",
          "center_lat": -24.08,
          "center_lon_east": -69.95,
          "half_width_deg": 0.25,
          "radius_km": null,
          "crs": "EPSG:4326",
          "longitude_convention": "east_-180_180",
          "approx_width_km": 50.8,
          "description": "0.5 deg square centred on the site"
        },
        "description": "Hyperarid core of the Atacama, with soils so low in organics and microbial life that they were proposed as the closest terrestrial match to Viking-era Mars s...",
        "tags": [
          "alluvial_fan",
          "desert_plain",
          "... (7 more)"
        ],
        "known_analog_use": [
          "NASA ARADS rover and drilling campaigns",
          "Viking-era soil analog studies"
        ],
        "sources": [
          "nasa_arads",
          "lit_yungay"
        ]
      },
      "similarity": 63.46,
      "distance": 0.5758,
      "rank": 1,
      "feature_distances": [
        {
          "feature_id": "slope_regional_median_deg",
          "label": "Regional slope (median, ~3.7 km baseline)",
          "comparable": true,
          "mars_value": 1.077,
          "earth_value": 1.106,
          "unit": "deg",
          "scale": 1.5,
          "distance": 0.019333333333333425,
          "raw_weight": 25.0,
          "normalized_weight": 0.25,
          "contribution": 0.004833333333333356,
          "method": "scaled_absolute_difference",
          "note": null
        },
        {
          "feature_id": "roughness_regional_m",
          "label": "Detrended relief (~3.7 km cells)",
          "comparable": true,
          "mars_value": 194.4,
          "earth_value": 126.8,
          "unit": "m",
          "scale": 100.0,
          "distance": 0.676,
          "raw_weight": 25.0,
          "normalized_weight": 0.25,
          "contribution": 0.169,
          "method": "scaled_absolute_difference",
          "note": null
        }
      ],
      "shared_characteristics": [
        "Regional slope (median, ~3.7 km baseline): Mars 1.077 vs Earth 1.106 deg (close at the harmonised scale)",
        "Aridity (mean precipitation): Mars 0 vs Earth 0.02 mm/day (close at the harmonised scale)"
      ],
      "important_differences": [],
      "noncomparable_variables": [
        "Atmospheric pressure: Mars surface pressure is ~0.6 kPa (about 0.6% of Earth's 101 kPa); no Earth site is comparable.",
        "Gravity: Mars surface gravity is 3.71 m/s2 versus Earth's 9.81 m/s2.",
        "... (3 more)"
      ],
      "research_applications": [
        "NASA ARADS rover and drilling campaigns",
        "Viking-era soil analog studies"
      ],
      "limitations": [
        "Similarity is a heuristic index (100 / (1 + D)) over the configured features, not a validated probability.",
        "Terrain statistics are compared at a harmonised ~3.7 km baseline; metre-scale morphology is not assessed.",
        "... (1 more)"
      ],
      "citations": [
        "copernicus_glo90",
        "derived_toa_insolation",
        "... (6 more)"
      ],
      "completeness_fraction": 1.0
    }
  ],
  "analog_spec_version": "analog-v1.0",
  "planetary_differences": [
    "Atmospheric pressure: Mars surface pressure is ~0.6 kPa (about 0.6% of Earth's 101 kPa); no Earth site is comparable.",
    "Gravity: Mars surface gravity is 3.71 m/s2 versus Earth's 9.81 m/s2.",
    "... (3 more)"
  ],
  "warnings": []
}
```
`feature_distances[].comparable=false` means the feature was missing or non-numeric on one side and did not enter `D`.
`planetary_differences` is always present: pressure, gravity, radiation, temperature, elevation datum.

### `POST /research/explain` : `ExplainRequest` → `ResearchExplanation`
Request: ```json
{
  "site_id": "jezero_crater",
  "mission": null,
  "include_analogs": true,
  "question": null
}
```
Response (`generated_by` is `llm` or `deterministic_fallback`; every `citations[].chunk_id` appears in `supporting_evidence`):
```json
{
  "site_id": "jezero_crater",
  "generated_by": "deterministic_fallback",
  "model": null,
  "sections": {
    "favorable": [
      "Terrain safety (regional slope): 1.077 deg -> suitability 1.00, contributing 38.9 of 79.8 points.",
      "Elevation suitability (EDL atmosphere): -2129 m -> suitability 0.83, contributing 22.9 of 79.8 points.",
      "... (1 more)"
    ],
    "unfavorable": [
      "Surface roughness (detrended relief): 194.4 m -> suitability 0.38, contributing 8.4 of 79.8 points."
    ],
    "risks": [
      "Surface roughness (detrended relief): 194.4 m scores 0.38"
    ],
    "influential_factors": [
      "Terrain safety (regional slope) (normalised weight 0.39)",
      "Elevation suitability (EDL atmosphere) (normalised weight 0.28)",
      "... (2 more)"
    ],
    "research_applications": [
      "Closest Earth analog: Atacama Desert - Yungay region, similarity 63.46 (Regional slope (median, ~3.7 km baseline): Mars 1.077 vs Earth 1.106 deg (close at th...",
      "Closest Earth analog: San Rafael Swell - MDRS area, similarity 61.83 (Composition: clays; Regional slope (median, ~3.7 km baseline): Mars 1.077 vs Earth 0.97..."
    ],
    "missing_evidence": [
      "Criterion excluded: thermal_conditions",
      "No measurement for surface_temperature_mean_c in profile v1.",
      "... (4 more)"
    ],
    "future_investigation": [
      "Sample HiRISE/CTX-derived DTMs over the landing ellipse to replace regional MOLA slopes with metre-scale hazard maps.",
      "Integrate THEMIS/TES thermal inertia and rock abundance so the thermal and hazard criteria can be scored."
    ]
  },
  "supporting_evidence": [],
  "citations": [],
  "limitations": [
    "Deterministic template assembled from measurements, scoring results and retrieved excerpts; no language model was used.",
    "Citations point at retrieved passages only; read the source before relying on a claim."
  ],
  "cached": false,
  "generated_at": "2026-11-14T15:56:06+00:00"
}
```

### Errors
```json
{
  "error": {
    "code": "not_found",
    "message": "site 'nope' not found",
    "details": null
  }
}
```
```json
{
  "error": {
    "code": "validation_error",
    "message": "request failed schema validation",
    "details": [
      {
        "type": "value_error",
        "loc": [
          "body",
          "mission",
          "... (1 more)"
        ],
        "msg": "Value error, at least one criterion must carry a positive weight",
        "input": [],
        "ctx": {
          "error": {}
        }
      }
    ]
  }
}
```

## TypeScript generation

```bash
cd frontend && npm run gen:types     # openapi-typescript http://localhost:8000/openapi.json -> src/types/api.ts
```
`src/types/api.ts` is committed so the frontend builds without a running backend; regenerate it whenever a model changes.
