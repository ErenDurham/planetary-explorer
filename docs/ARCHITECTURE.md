# Architecture

Planetary Explorer is two processes and a set of versioned data files.

```
┌──────────────────────────────┐        ┌─────────────────────────────────────────────┐
│ frontend/  (Vite + React)    │  HTTP  │ backend/  (FastAPI)                         │
│                              │ ─────► │  api/routes.py                              │
│  globe/      R3F Mars globe  │  JSON  │   ├─ services/data_loader.py   (E2)         │
│  mission/    sliders, ranks  │        │   ├─ services/scoring_engine.py (E3)        │
│  sites/      profile panel   │ ◄───── │   ├─ services/ranking_engine.py (E3)        │
│  charts/     Recharts        │        │   ├─ services/analog_engine.py  (E3)        │
│  intelligence/ RAG panel     │        │   ├─ services/retrieval_engine.py (E4)      │
│  services/api.ts  (typed)    │        │   └─ services/explanation_engine.py (E4)    │
│  store/      Zustand         │        │  models/   Pydantic = contract source       │
│  TanStack Query cache        │        │  config/   scoring_spec.json, analog_spec   │
└──────────────────────────────┘        └───────────────┬─────────────────────────────┘
                                                        │ reads only
                                        ┌───────────────▼─────────────────────────────┐
                                        │ backend/data/  (versioned, committed)       │
                                        │  mars/sites.json, site_profiles.v1.json     │
                                        │  earth/candidates.json, candidate_profiles  │
                                        │  documents/chunks.jsonl (+ vector index)    │
                                        │  raw/ (gitignored downloads)                │
                                        └───────────────▲─────────────────────────────┘
                                                        │ writes
                                        ┌───────────────┴─────────────────────────────┐
                                        │ backend/scripts/  reproducible pipeline     │
                                        │  fetch_mola.py → build_mars_profiles.py     │
                                        │  build_earth_profiles.py (Copernicus+POWER) │
                                        │  fetch_mars_texture.py (NASA Trek WMTS)     │
                                        │  ingest_documents.py (corpus → chunks)      │
                                        └─────────────────────────────────────────────┘
```

## Principles

1. **Pydantic models are the contract.** `backend/app/models/` defines every
   request and response. The frontend's `src/types/api.ts` is generated from
   the OpenAPI document (`npm run gen:types`), never hand-edited.
2. **The pipeline runs offline, the app serves files.** No request to the
   backend triggers a download from NASA. Everything the API serves was
   produced by a script in `backend/scripts/` and committed with a version
   suffix. This keeps the demo deterministic and the judges' experience
   independent of PDS uptime.
3. **Five independent services, one thin router.** Scoring, ranking, analog
   matching, retrieval and explanation import only `app.models` and their own
   spec file. None imports another engine. The router composes them.
4. **Deterministic first, AI second.** Scores and similarities are pure
   functions. The explanation engine is given those results plus retrieved
   passages and may only narrate them; if the LLM is unconfigured or fails,
   `deterministic()` produces the same sections from the same inputs.
5. **Missing data stays missing.** `EnvironmentalMeasurement.is_missing` and
   `value: null` propagate through scoring (criterion excluded, reported) and
   analogs (feature non-comparable, reported). Nothing is imputed.

## Request flows

**Explore / Analyze**

```
GET /sites ─► globe markers
click marker ─► GET /sites/{id} ─► profile panel
slider change ─► debounce 150 ms ─► POST /scoring/evaluate {mission, client_request_id}
             ─► response with same client_request_id ─► replace rankings, recolour markers, redraw charts
             (a response whose client_request_id != latest is dropped: stale-response guard)
```

**Research**

```
POST /research/explain {site_id, mission?, include_analogs?}
  backend: evaluate(default or given mission) ─► retrieve(query built from site + factors, site-aware boost)
           ─► explanation_engine.explain(result, profile, evidence, analogs)
           ─► LLM path (if configured): structured output validated by Pydantic,
              citation ids checked against retrieved chunk ids, else fallback
```

**Compare**

```
POST /analogs/match {mars_site_id, weights?, top_k}
  backend: for each Earth candidate: feature distances over the analog spec ─► D ─► 100/(1+D) ─► rank
```

## Frontend state

| Concern | Where | Why |
|---|---|---|
| selected site, slider weights, active panel, UI prefs | Zustand store | synchronous, shared across panels, no server round trip |
| sites, profile, evaluation, analogs, explanation | TanStack Query | caching, loading/error states, request de-duplication |
| camera, hover, rotation | React Three Fiber local state | 60 fps; must never go through the store |

The evaluation query key includes a hash of the mission weights; the response
carries `client_request_id`, and the client ignores any response whose id is
not the most recently issued. Explanations are keyed by site + mission hash and
cached for the session so slider motion never calls the LLM.

## Coordinate convention

Planetocentric latitude, east-positive longitude, stored as -180..180, IAU2000
Mars reference. The globe texture is equirectangular with column 0 at 180 W.
Marker placement on a Three.js `SphereGeometry` of radius R:

```
x =  R cos(lat) cos(lon_east)
y =  R sin(lat)
z = -R cos(lat) sin(lon_east)
```

Verified against Olympus Mons (18.65 N, 226.2 E = -133.8 E), which must sit on
the texture's largest volcano, and Hellas (-42.4, 70.5 E).

## Versioning

`PROFILE_VERSION` (`v1`) is in the file names and in every response. Changing
the pipeline means writing `site_profiles.v2.json`, not overwriting v1. The
scoring and analog specs carry their own `version` strings, which the evaluate
and match responses echo so a saved result can always be reproduced.

## What is deliberately not here

No database, no message queue, no cloud services, no auth. A single `uvicorn`
process and a static frontend build are the whole deployment (see
`docs/TEAM_WORKSTREAMS.md` for the deployment checkpoint).
