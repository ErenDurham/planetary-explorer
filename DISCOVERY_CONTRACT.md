# Discovery v1 — Fable handoff

Backend: `discovery-v1`. Source of truth: `backend/app/models/discovery.py`.
Generated types: `frontend/src/types/discovery-api.ts`; shared-transport client:
`frontend/src/services/discoveryEngine.ts`. These files are backend-owned.
Fable owns UI, navigation integration and discovery UI tests. No UI has been changed.

## Endpoints

- `GET /api/v1/discovery/capabilities` → `DiscoveryCapabilities`: `engine_version`,
  `state` (`ready|unavailable`), `reference`, `runs`, `criteria`, `default_weights`, `limitations`.
  Each run: `run_id,label,created_at,bounds,total_sampled,eligible_count`.
- `POST /api/v1/discovery/rank` → `DiscoveryRankResponse`.
  Request: `{run_id,reference_id:"jezero_crater",weights:{slope_regional_median_deg:50,
  roughness_regional_m:50},top_k:5,client_request_id:"ui-1"}`.
  Response: `engine_version,run_id,reference,survey,basis_features,effective_weights,
  eligible_pool_count,returned_count,candidates,client_request_id,limitations`.
- `GET /api/v1/discovery/runs/{run_id}/candidates/{candidate_id}` → `DiscoveryCandidateDetail`.
- `GET /api/v1/discovery/runs/{run_id}/export` → `DiscoveryExport` containing
  `manifest,specification,survey,reference_profile,audit_rows,exclusions,provenance,validation`.

Candidate: `id,name,lat,lon_east,footprint_geojson,raw_rank,display_rank,distance,
similarity_index,feature_distances,terrain_valid_fraction,novelty,context,sources,limitations`.
Detail adds `profile,screening_reasons,source_manifest,proposed_field_validation`.
Details/export contain immutable inputs, **not** the last ranking; their rank/distance
fields remain null. Keep the selected rank response in UI state when showing current scores.

Feature distances: `feature_id,earth_value,mars_value,unit,scale,normalized_weight,distance,contribution`.
Survey: `bounds,generated_count,terrain_valid_count,eligible_count,exclusion_counts,
sampling_centres,grid_specification,footprint_specification,dataset_versions,spec_version,diversification`.
Novelty: `catalog_version,nearest_known_site_id,nearest_known_site_distance_km,buffer_rule,
outside_catalog_buffer,review_status`. Context: nullable `climate`, nullable `land_cover`,
`geology_status:"not_assessed"`. See generated types for exact nested fields.

## Semantics

Offline acquisition only; no API-time downloads. First pilot: 16 quarter-degree
cell centres in 31–32 N, 3–2 W (eastern Morocco), fixed before processing outcomes.
Selection rationale: inland semi-arid regional terrain, bounded public DEM workload;
not chosen for a favorable score or assumed novelty. Earth sampling centres lie inside
the survey boundary; their 60 km footprints extend outside it and the source mosaic is padded.

Both bodies use local equal-area metric grids, 4 km cells, 60×60 km footprints.
Mars uses a 3396 km sphere, Earth WGS84. These are modeling choices, not standards.
Default score: equally weighted scaled absolute slope/relief differences;
`similarity_index=100/(1+D)`. Scales 1.5 deg and 100 m are unvalidated assumptions.
Order full-precision D then stable ID; diversify greedily with at least 40 km between
centres, then apply `top_k`. Overlap of 60 km footprints can remain. `raw_rank` is
before diversification; `display_rank` is after. No guaranteed number of candidates.

Minimum terrain coverage: 95% of analysis cells, each with >=95% valid fine-grid
support; >=80% of interior cells require complete central-difference neighbours. No median
fill, no inferred geology. Catalog exclusion uses a conservative 100 km centre
buffer; it is not a measured site boundary. Climate/land cover are optional context,
never inputs to the two-feature score. Unknown context remains null.

Unknown IDs: 404; invalid weights/inputs: 422; missing/corrupt installed run: 503
using the existing `{error:{code,message,details}}` envelope. Capabilities returns
`unavailable` and no runs when no verified artifacts are installed.

UI: show AOI, counts, sources, actual footprints and missing evidence; label each
result **Proposed terrain analog candidate; field validation required**. Outside the
versioned catalog buffer is not scientific novelty. Do not mix discovery scores
with existing curated scores. Do not infer operational safety or live scanning.

## Reproduction

From `backend`: `.venv/bin/python scripts/build_discovery.py` builds the pilot;
`--offline` replays verified caches; `--spec PATH` selects a preregistered config.
`.venv/bin/python scripts/export_discovery_contract.py` generates isolated OpenAPI;
from `frontend`, `node node_modules/openapi-typescript/bin/cli.js ../docs/discovery-openapi.json -o src/types/discovery-api.ts`.
Source rasters stay in ignored raw cache; compact run artifacts are shipped for
fresh-checkout serving without credentials. Validation report is inside the export.

## Final installed pilot and assessment

Run: `morocco-4c20d8478ee2`; 16 measured eligible footprints, four default
spatially separated results. See `backend/data/discovery/README.md` for measured
runtimes, source checks, limitations and reproducible commands.
`validation.json` and `validation-manifest.json` are separately hashed assessment
attachments bound to the original run; export includes them under
`validation.follow_up_assessment`. API request handlers never acquire data.

## Candidate research extension

Candidate summaries now include `research_status`: `unresearched`, `in_progress`, or
`literature_reviewed`. This is independent of `novelty.review_status`, which records
only limited desktop checks. All original candidates start unresearched for literature.

`GET /api/v1/discovery/runs/{run_id}/candidates/{candidate_id}/research?question=...`
returns a candidate dossier, saved `record`, `research_questions`, targeted `search_tasks`,
`research_brief`, `background_evidence`, `retrieval_status` and limitations.
Retrieval uses the existing local corpus; it is not live or exhaustive web research.
Getting a dossier never changes research status.

`POST` to the same research path accepts `{status,notes,findings:[{title,url,finding,scope}]}`.
Scopes: `candidate_specific`, `regional_background`, `contradictory`. Sources must use
HTTPS. Findings and status are analyst supplied, not automatically factual-verified.
Literature reviewed requires >=40 summary characters and a direct/contradictory source
finding; it is never field validation. Invalid records return 422.

Notebooks persist separately in ignored `data/discovery/research/{run}/{candidate}.json`;
immutable run/profile files and terrain scores do not change. Deployments need a durable
writable volume for notes. Exports include saved records under
`validation.candidate_research`; do not publish private notes without reviewing them.

### Saved candidate research brief (additive)

`GET /api/v1/discovery/runs/{run_id}/candidates/{candidate_id}/research/export`
returns `ResearchBrief` (`research-brief-v1`): `run_id`, `candidate_id`, safe
`filename`, `markdown`, saved `record`, reproducible `discovery` survey snapshot,
and `limitations`. Generated types and `discoveryEngine.exportResearch` expose it.
This is read-only and does not retrieve literature, alter status, or require an
LLM. Unsaved drafts and current UI ranking/custom weights are deliberately not
represented. The Markdown embeds measured candidate data and complete survey
context, with provenance and exclusions. Analyst citations remain unverified.
Unknown IDs return 404; unavailable artifacts or unreadable selected notebooks
return 503. Other candidates' notebooks are excluded and cannot block this export.
Fable should save pending edits before requesting this export, or explicitly
label the download as the last saved version. Offer raw JSON alongside Markdown.

## Dropped-pin probe (additive)

`POST /api/v1/discovery/probe` → `DiscoveryProbeResponse`. Request `DiscoveryProbeRequest`:
`run_id, reference_id, lat, lon_east, weights?, client_request_id?` (weights validated exactly as
for rank and resolved against the run's own basis; a feature the run does not score is 422).

The probe measures ONE user-chosen 60 km footprint with the survey's own terrain code
(`scripts/discovery_terrain`, the run's `cell_m`, `footprint_m` and coverage cut-offs) and scores it with
the same `score_measurements` the ranking uses, against the run's reference profile and scales. It is
never a candidate: it does not enter `rank`, is not written into any artifact, and the response
labels it so. `status` is one of `scored`, `terrain_unavailable`, `insufficient_terrain_coverage`,
`features_unavailable`; an index is present only when `status == "scored"`, i.e. when every feature
the run scores was measured at the point (a feature with no provider at an arbitrary point, such as a
climate record, leaves the probe unscored rather than partially scored). `placement` reports whether
the point lies inside the surveyed bounds, the nearest survey candidate and, when scored, how many
eligible candidates are strictly closer to the reference under the same weights (context, not a
rank). `novelty` applies the run's stored catalog and buffer. `footprint_geojson`, `profile` and
`sources` carry the measured footprint's provenance.

Data acquisition: by default the probe reads terrain tiles from the verified cache only and never
downloads on request (status `terrain_unavailable` says so when no cached tile covers the point).
`DISCOVERY_PROBE_FETCH=true` on a local API opts in to fetching missing Copernicus tiles into the same
content-verified cache. Where raster libraries are absent (the GitHub Pages runtime) the endpoint
answers 503 `data_unavailable` and the UI shows the probe as unavailable.

UI obligations: present the probe apart from the shortlist, label it as not a candidate, show the
reasons verbatim when unscored, and keep the discovery index separate from curated analog scores.

