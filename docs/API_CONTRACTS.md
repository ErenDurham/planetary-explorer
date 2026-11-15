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
  "scoring_spec_version": "landing-v1.1",
  "services": {
    "data": "ok",
    "retrieval": "ok",
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
        "description": "1.0 deg square centred on the site; 17x17 MOLA 16 ppd cells (floor/ceil edges)"
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
      "description": "1.0 deg square centred on the site; 17x17 MOLA 16 ppd cells (floor/ceil edges)"
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
    "generated_at": "2026-11-14T16:19:15+00:00",
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
          "description": "1.0 deg square centred on the site; 17x17 MOLA 16 ppd cells (floor/ceil edges)"
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
          "description": "1.0 deg square centred on the site; 17x17 MOLA 16 ppd cells (floor/ceil edges)"
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
      "score": 98.72,
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
          "rationale": "0.14 deg is at or below the 2.00 deg fully-suitable knee, so q = 1.00. Lower regional slopes reduce the chance that a landing ellipse spans tilted terrain su..."
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
          "rationale": "-3,624 m is at or below the -3,000 m fully-suitable knee, so q = 1.00. Lower elevation means a thicker atmospheric column for entry, descent and landing dece..."
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
        "Terrain safety 0.14 deg (median over ~55 km footprint) - fully suitable (1.00)",
        "Elevation suitability -3,624 m (median over ~55 km footprint) - fully suitable (1.00)",
        "... (2 more)"
      ],
      "risks": [],
      "limitations": [
        "Excluded criterion 'thermal_conditions': feature surface_temperature_mean_c missing on 8/8 sites (chryse_planitia, elysium_planitia, gale_crater, gusev_crate...",
        "Terrain metrics are regional (~3.7 km MOLA baseline) and cannot certify lander-scale safety.",
        "... (1 more)"
      ]
    }
  ],
  "scoring_spec_version": "landing-v1.1",
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
    "criterion 'thermal_conditions' excluded: feature surface_temperature_mean_c missing on 8/8 sites (chryse_planitia, elysium_planitia, gale_crater, gusev_crate..."
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
      "similarity": 63.03,
      "distance": 0.5866,
      "rank": 1,
      "feature_distances": [
        {
          "feature_id": "slope_regional_median_deg",
          "label": "Regional slope (median, ~3.7 km baseline)",
          "comparable": true,
          "mars_value": 1.077,
          "earth_value": 1.166,
          "unit": "deg",
          "scale": 1.5,
          "distance": 0.059333333333333314,
          "raw_weight": 25.0,
          "normalized_weight": 0.25,
          "contribution": 0.014833333333333329,
          "method": "scaled_absolute_difference",
          "note": "Mars 1.08 deg vs Earth 1.17 deg: |difference| 0.09 deg / scale 1.50 deg = d 0.06 (close at the harmonised ~3.7 km baseline)"
        },
        {
          "feature_id": "roughness_regional_m",
          "label": "Detrended relief (~3.7 km cells)",
          "comparable": true,
          "mars_value": 194.4,
          "earth_value": 126.5,
          "unit": "m",
          "scale": 100.0,
          "distance": 0.679,
          "raw_weight": 25.0,
          "normalized_weight": 0.25,
          "contribution": 0.16975,
          "method": "scaled_absolute_difference",
          "note": "Mars 194 m vs Earth 126 m: |difference| 68 m / scale 100 m = d 0.68 (moderately different at the harmonised ~3.7 km baseline)"
        }
      ],
      "shared_characteristics": [
        "Regional slope: Mars 1.08 deg vs Earth 1.17 deg (difference 0.09 deg, within half the 1.50 deg comparison scale)",
        "Aridity: Mars 0.00 mm/day vs Earth 0.02 mm/day (difference 0.02 mm/day, within half the 1.00 mm/day comparison scale)"
      ],
      "important_differences": [
        "Terrain morphology: no shared tags (Mars: impact crater, delta, paleolake basin, crater floor; Earth: desert plain, smooth plains, alluvial fan, hyperarid)",
        "Composition: no shared tags (Mars: carbonates, clays, olivine, basalt; Earth: nitrates, sulfates, perchlorates, halite, regolith)"
      ],
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
      "Terrain safety (regional slope): 1.077 deg -> suitability 1.00, contributing 38.9 of 80.5 points.",
      "Elevation suitability (EDL atmosphere): -2129 m -> suitability 0.83, contributing 22.9 of 80.5 points.",
      "... (1 more)"
    ],
    "unfavorable": [
      "Surface roughness (detrended relief): 194.4 m -> suitability 0.38, contributing 8.4 of 80.5 points."
    ],
    "risks": [
      "Surface roughness 194 m (~56 km footprint) - poor (0.38)"
    ],
    "influential_factors": [
      "Terrain safety (regional slope) (normalised weight 0.39)",
      "Elevation suitability (EDL atmosphere) (normalised weight 0.28)",
      "... (2 more)"
    ],
    "research_applications": [
      "Assessing the mineralogy of the watershed and fan deposits of the Jezero crater paleolake system, Mars (Journal of Geophysical Research: Planets / American G...",
      "Mars 2020: Perseverance Rover - NASA Science (NASA Science / JPL) [C5]: Watery Past\n\nThe rover discovered a habitable, stable lake, delta, and river system i...",
      "... (4 more)"
    ],
    "missing_evidence": [
      "Criterion excluded: thermal_conditions",
      "No measurement for surface_temperature_mean_c in profile v1.",
      "... (3 more)"
    ],
    "future_investigation": [
      "Sample HiRISE/CTX-derived DTMs over the landing ellipse to replace regional MOLA slopes with metre-scale hazard maps.",
      "Integrate THEMIS/TES thermal inertia and rock abundance so the thermal and hazard criteria can be scored."
    ]
  },
  "supporting_evidence": [
    {
      "chunk_id": "crossref_lit_jezero_mineralogy#002",
      "document_id": "crossref_lit_jezero_mineralogy",
      "title": "Assessing the mineralogy of the watershed and fan deposits of the Jezero crater paleolake system, Mars",
      "institution": "Journal of Geophysical Research: Planets / American Geophysical Union (AGU)",
      "url": "https://api.crossref.org/works/10.1002/2014JE004782",
      "publication_date": "2015-04",
      "geographic_relevance": [
        "jezero_crater",
        "Nili Fossae / Isidis basin rim"
      ],
      "excerpt": "present results from geomorphic mapping and visible to near\u2010infrared spectral analyses of the Jezero crater paleolake basin and its associated watershed. The...",
      "score": 0.022541
    }
  ],
  "citations": [
    {
      "citation_id": "[C1]",
      "chunk_id": "crossref_lit_jezero_mineralogy#002",
      "document_id": "crossref_lit_jezero_mineralogy",
      "title": "Assessing the mineralogy of the watershed and fan deposits of the Jezero crater paleolake system, Mars",
      "institution": "Journal of Geophysical Research: Planets / American Geophysical Union (AGU)",
      "url": "https://api.crossref.org/works/10.1002/2014JE004782"
    },
    {
      "citation_id": "[C2]",
      "chunk_id": "nasa_m2020_overview#007",
      "document_id": "nasa_m2020_overview",
      "title": "Mars 2020: Perseverance Rover - NASA Science",
      "institution": "NASA Science / JPL",
      "url": "https://science.nasa.gov/mission/mars-2020-perseverance/"
    },
    "... (4 more)"
  ],
  "limitations": [
    "Deterministic template assembled from measurements, scoring results and retrieved excerpts; no language model was used.",
    "Citations point at retrieved passages only; read the source before relying on a claim."
  ],
  "cached": false,
  "generated_at": "2026-11-14T16:22:18+00:00"
}
```

### `POST /mission/interpret` : `InterpretRequest` → `InterpretResponse`
Free-text objective → PROPOSED weights for the existing criteria. The model (when configured) or the rule-based reader proposes; deterministic code validates ids, clamps 0-100, forces data-unavailable criteria to 0 and requires a positive total. `hard_constraints` are not part of this contract. `confidence` describes the reading of the text, never site suitability. `objective_hash` lets the client refuse a stale "interpreted" label once the draft changes.
Request: ```json
{
  "objective": "Prioritise landing safety over sunlight; ignore solar",
  "current_weights": null,
  "excluded_criteria": [
    "thermal_conditions"
  ]
}
```
Response:
```json
{
  "objective": "Prioritise landing safety over sunlight; ignore solar",
  "objective_hash": "ac7ffbd73f2cf0d5",
  "generated_by": "rule_based",
  "model": null,
  "suggestions": [
    {
      "criterion_id": "terrain_safety",
      "label": "Terrain safety (regional slope)",
      "weight": 75,
      "previous_weight": 35,
      "reason": "\"safety\" is ranked above \"sunlight\" in the objective, so it is raised.",
      "data_available": true
    },
    {
      "criterion_id": "elevation_suitability",
      "label": "Elevation suitability (EDL atmosphere)",
      "weight": 25,
      "previous_weight": 25,
      "reason": "Unchanged: the objective did not mention this factor.",
      "data_available": true
    },
    "... (3 more)"
  ],
  "rationale": [
    "Read \"Prioritise landing safety over sunlight\" as a trade-off: Terrain safety (regional slope) up, Solar illumination (annual mean, top of atmosphere) down.",
    "Clause \"ignore solar\": Solar illumination (annual mean, top of atmosphere) -> 0."
  ],
  "tradeoffs": [
    "Terrain safety (regional slope) over Solar illumination (annual mean, top of atmosphere) (from: \"Prioritise landing safety over sunlight\").",
    "Solar illumination (annual mean, top of atmosphere) excluded (\"ignore solar\")."
  ],
  "unsupported_needs": [],
  "clarifying_questions": [],
  "confidence": "high",
  "confidence_note": "Confidence describes how clearly the text matched the rule lexicon; it says nothing about how suitable any site is. Rule-based reading: lexicon matches plus ...",
  "validation_notes": [
    "Thermal conditions set to 0: no site carries the measurement, so it cannot influence any score."
  ],
  "scoring_spec_version": "landing-v1.1",
  "cached": false,
  "generated_at": "2026-11-14T17:56:34+00:00"
}
```

### `POST /mission/guidance` : `GuidanceRequest` → `GuidanceResponse`
Objective-aware guidance after a priority change. The scoring engine evaluates the previous and new weights (default hard constraints, common feature set) and reports effective influence before/after, de-emphasised factors, rank deltas, the leader, and missing data; a model may only phrase `summary` (numeric guard), otherwise `generated_by` is `rule_based`. Debounce on the client; `client_request_id` is echoed so stale answers can be dropped. Earth-comparison weights are never involved.
Request: ```json
{
  "objective": "land safely",
  "previous_weights": {
    "terrain_safety": 35,
    "elevation_suitability": 25,
    "surface_roughness": 20,
    "thermal_conditions": 10,
    "solar_illumination": 10
  },
  "new_weights": {
    "terrain_safety": 35,
    "elevation_suitability": 100,
    "surface_roughness": 20,
    "thermal_conditions": 10,
    "solar_illumination": 10
  },
  "changed_criterion_id": "elevation_suitability",
  "client_request_id": "g-7"
}
```
Response:
```json
{
  "generated_by": "rule_based",
  "model": null,
  "summary": "Elevation suitability (EDL atmosphere) now carries 60.6% of the effective influence (was 27.8%). This de-emphasises Terrain safety (regional slope), Surface ...",
  "de_emphasised": [
    "Terrain safety (regional slope)",
    "Surface roughness (detrended relief)",
    "... (1 more)"
  ],
  "leader_changed": false,
  "leader": "Chryse Planitia (Viking 1)",
  "rank_changes": [
    {
      "site_id": "oxia_planum",
      "site_name": "Oxia Planum",
      "previous_rank": 3,
      "new_rank": 2,
      "previous_score": 96.6,
      "new_score": 98.14
    },
    {
      "site_id": "utopia_planitia",
      "site_name": "Utopia Planitia (Viking 2)",
      "previous_rank": 4,
      "new_rank": 3,
      "previous_score": 94.13,
      "new_score": 96.8
    },
    "... (4 more)"
  ],
  "influence": [
    {
      "criterion_id": "terrain_safety",
      "label": "Terrain safety (regional slope)",
      "previous_pct": 38.9,
      "new_pct": 21.2,
      "excluded_reason": null
    },
    {
      "criterion_id": "elevation_suitability",
      "label": "Elevation suitability (EDL atmosphere)",
      "previous_pct": 27.8,
      "new_pct": 60.6,
      "excluded_reason": null
    },
    "... (3 more)"
  ],
  "missing_data_notes": [
    "criterion 'thermal_conditions' excluded: feature surface_temperature_mean_c missing on 8/8 sites (chryse_planitia, elysium_planitia, gale_crater, gusev_crate..."
  ],
  "client_request_id": "g-7",
  "cached": false,
  "generated_at": "2026-11-14T17:56:34+00:00"
}
```

### `ResearchExplanation` additions (digests and study cards)
`POST /research/explain` now accepts `objective` and returns `source_digests` (one per unique source URL; `chunk_ids`/`citation_ids` are the exact passages the digest was written from; `support_level` ∈ supports | context | insufficient; `generated_by` ∈ extractive | llm), `research_studies` (at most three `StudyCard`s, `kind` ∈ proposed_study | documented_campaign, with `motivating_citation_ids` and `cannot_infer`) and `evidence_gap` (set when nothing can be motivated). Retrieval returns up to 8 chunks with at most 2 per source.
```json
{
  "source_digests": [
    {
      "document_id": "crossref_lit_jezero_mineralogy",
      "title": "Assessing the mineralogy of the watershed and fan deposits of the Jezero crater paleolake system, Mars",
      "institution": "Journal of Geophysical Research: Planets / American Geophysical Union (AGU)",
      "url": "https://api.crossref.org/works/10.1002/2014JE004782",
      "publication_date": "2015-04",
      "purpose_label": "Peer-reviewed record",
      "chunk_ids": [
        "crossref_lit_jezero_mineralogy#002",
        "crossref_lit_jezero_mineralogy#001"
      ],
      "citation_ids": [
        "[C1]",
        "[C4]"
      ],
      "what_it_tells_us": "Two fan deposits located within the basin have distinct visible to near\u2010infrared mineralogic signatures measured by the Compact Reconnaissance Imaging Spectr...",
      "why_it_matters": "Relevant because it names jezero, olivine, paleolake.",
      "limitation": "Bibliographic record and abstract only; the full paper was not retrieved, so detailed results are not available here.",
      "support_level": "supports",
      "generated_by": "extractive"
    }
  ],
  "research_studies": [
    {
      "kind": "proposed_study",
      "title": "Does the regional terrain statistic predict landing-scale hazards at Jezero Crater?",
      "research_question": "Do the ~3.7 km MOLA slope and relief values that rank Jezero Crater here (median slope 1.077 deg, detrended relief 194.4 m) correspond to metre-scale slopes ...",
      "method": "Sample HiRISE/CTX-derived digital terrain models at 1-5 m baselines over the footprint, count rocks from HiRISE images, and compare the distributions with th...",
      "why_here": "Jezero Crater has a complete regional terrain profile and retrieved documentation of the topographic data and its sampling caveats, so the comparison can be ...",
      "motivating_citation_ids": [
        "[C2]",
        "[C7]"
      ],
      "cannot_infer": "Regional statistics cannot resolve lander-scale hazards, and the suitability score is a screening index; neither establishes that a landing would be safe.",
      "analog_candidate_id": null
    }
  ],
  "evidence_gap": null
}
```
`AnalogMatch` now carries `documented_analog_use` (historical programmes from the data files; `research_applications` is a deprecated alias) and `proposed_studies` (StudyCard dicts motivated only by the characteristics the two sites actually share).

### `GET /sites/{id}/imagery` → `SiteImagery` and `GET /imagery/{entry_id}/asset`
Verified imagery for a site: `entries` (`ImageryEntry`: view orbital|surface, image_type, title, institution, credit, license, instrument, mission, source_page_url, asset_url, local_asset, mime_type, width_px, height_px, bytes, acquisition_date (null unless verified), acquisition_note, release_date (publication, distinct), spatial_resolution_m_per_px, resolution_note, bounds (only georeferenced CTX mosaics), coverage_evidence, relationship exact_location|landing_ellipse|candidate_region|nearby_scene, distance_from_site_km, relevance, appearance_note, verified_on), `missing_views` and `notes`. The asset endpoint serves the backend-cached file; if the cache is missing it fetches the manifest's own `asset_url` from an allow-listed host with a 6 MB cap and an image decode check. The frontend never loads external URLs directly. 404 for unknown site/entry; 502 `asset_not_allowed` / `asset_rejected` / `asset_fetch_failed`; 503 `imagery_unavailable` when the manifest has not been built.

### `POST /analogs/rank` : `AnalogRankRequest` → `AnalogRankResponse`
Body-aware analog ranking in EITHER direction: `reference_body` + `reference_id` (an Earth candidate or a Mars site) and an optional `candidate_body` (defaults to the other body). Every candidate on the candidate body is ranked against the reference on a COMMON positive-weight feature basis (a feature not comparable for every candidate is dropped pool-wide and listed in `excluded_features` with the reason), so no candidate looks better merely because a difficult feature is missing. The pairwise maths is identical to `/analogs/match` (same `feature_distance`, spec, units, scales), so a given Earth/Mars pair has the same `similarity` in both directions; only `rank` differs because the pool differs. Each candidate carries `rank` (1 = strongest over the full ranked pool), `rank_color_position` (0 strongest … 1 weakest, for a monotonic palette over the whole pool), `similarity`, `distance`, canonical `feature_distances` (`mars_value`/`earth_value` regardless of direction), `coverage_fraction`, `unrankable_reason`, shared/different characteristics and both locations' `sources`. `tie_rule` is explicit (full-precision distance, then candidate id). `client_request_id` is echoed. `/analogs/match` is unchanged.

### `POST /mission/interpret` additions
`task_interpretation` (`TaskInterpretation`): `task` landing_screening | analog_site_selection | ambiguous; `focus_body` (where to look for a location) and `mission_destination` (where the mission flies; a Mars mission can use Earth test sites) as separate fields; `reference_site` (an Earth or Mars location named in the text, resolved from a documented alias table); `unresolved_sites` (partial mentions such as "the crater" with a selector list, never a guessed coordinate); `direction_options` when the text does not settle the search direction (e.g. "Compare Earth and Mars geology"); `analog_suggestions` (proposed analog-match preferences over the five supported analog features, separate from the landing weights; elevation and thermal never appear); `rationale`. Deterministic rules; see `backend/app/services/task_interpreter.py`.

### Imagery: Earth locations
`GET /sites/{id}/imagery` now also answers for Earth analog candidate ids (`body: "earth"`). Earth orbital context comes from NASA GIBS (Landsat 7 WELD annual true-colour composite for 2000 at 61 m and 30.5 m per pixel, with MODIS Terra 250 m as the fallback where WELD has no coverage), with exact bounds from the GIBS EPSG:4326 tile grid; Earth field photographs come from the NASA Image Library (Haughton-Mars Project, Artemis geology training at Holuhraun) and Wikimedia Commons files whose licence, author and source are recorded verbatim from the file metadata (NSF/USAP and NPS public-domain photos, CC BY / CC BY-SA files). Sites with no verifiable field photograph (e.g. Atacama Yungay) report `missing_views: ["surface"]` with a note.

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


### `POST /scoring/sensitivity` → `SensitivityResponse`
Read-only priority sweep for a selected site. Send the applied `mission`, `focus_site_id`, the same `site_ids` as the evaluation, `range_pp` (default 5) and `step_pp` (default 1). Returns an applied baseline, per-factor scenario points, sampled rank/leader changes and excluded factors. Other active factors retain their mutual proportions. No mission state is written. Scenario endpoints with too few active factors are unscorable. Changes are bounded to the requested range; breakpoints are bracketed by samples, not exact thresholds. This is weight sensitivity, not measurement confidence.

Analyze uses full-precision factor contributions for comparator gaps and points below the model's weighted ideal. It keeps the engine's reported rank and discloses ties at displayed precision. The sensitivity viewer does not apply scenario weights; return to the mission controls to change the applied allocation.


### `GET /comparison/catalog` → `ComparisonCatalog`

Read-only Earth, Mars and Moon comparison catalogue. `bodies` contains NASA-sourced planetary reference conditions (gravity, atmosphere, normal incident solar irradiance and mean solar day). `locations` contains independent location selectors, coverage, unchanged Earth/Mars measurements and provenance, plus two curated lunar landing-region descriptions. Moon solar-day hours are converted from the 29.53-day synodic period.

This does not extend the Mars scoring model to another body. Lunar locations currently contain qualitative terrain/material descriptions and mission coordinates only. Numeric lunar site measurements remain absent, and the UI renders them as unavailable. Earth POWER temperature is 2 m air temperature; Earth EGM2008 and Mars areoid elevations are not subtracted. Regional slope/relief differences use the existing harmonised Earth/Mars grids.

## Astro conversation

`POST /api/v1/astro/chat` provides bounded, context-aware research guidance. Requests and responses are defined in `models/astro.py` and the generated OpenAPI schema. The backend owns scientific facts, excerpts, citations and navigation targets. Responses identify `llm` versus `deterministic_fallback`; missing Claude configuration does not make the endpoint unavailable. Unknown locations return 404; invalid request bounds or criteria return 422. `map_mode` accepts landing suitability, analog match and mission browse. Optional `assessment` uses the same task/body/weights/requirements contract as `/missions/evaluate`; the server recalculates those facts before responding. See [ASTRO.md](ASTRO.md) for configuration, grounding and session behavior.


## Task-specific mission assessment

`GET /api/v1/missions/profiles` exposes versioned task definitions and documented assumptions. `POST /api/v1/missions/evaluate` accepts `body` (earth/mars), `mission_type` (research/rover_field_test/base_planning), per-profile `weights`, `requirements`, and `client_request_id`. Landing scoring remains at `/scoring/evaluate`.

Research weights are `materials` / `landforms`, with requirements `material_targets` / `landform_targets`. Rover weights are `slope` / `relief`, with `slope_target_deg`, positive `slope_tolerance_deg`, `relief_target_m` and positive `relief_tolerance_m`. All weights must be finite 0..100 and at least one supplied weight positive. Unknown criteria and unrecognized research targets are rejected (422). Target lists are normalized and deduplicated.

Responses include spec version, method, assumptions, warnings, echoed requirements/request ID, and all body candidates. Each result has score/rank or an explicit `needs_requirements`, `insufficient_data` or `not_supported` status. Factors contain the raw value/unit, source, q, normalized weight, weighted contribution and explanation. `coverage_fraction` reports the available fraction of configured positive priority weight before evidence exclusions. Base planning has null scores/ranks and explicit evidence gaps.
