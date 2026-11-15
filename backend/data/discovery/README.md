# Discovery data and reproduction

Two surveys are installed. The current one is `survey-bf8e644974b2`, the
**global under-studied terrain survey**, described below; the original v1 pilot
`morocco-4c20d8478ee2` is kept because its preregistered record and its
immutable replay still hold.

## Global under-studied terrain survey (`global.json`, spec `discovery-v2.0`)

Sixteen one-degree regions on five continents, 3x3 systematic centres each:
144 footprints, 143 eligible (one failed the terrain-coverage cutoff). Each
region carries the Mars process or surface it was chosen for — desert pavement,
yardangs, evaporite playa, megadunes, lava tubes, relict drainage — written
down in `global.json` **before** any terrain was processed or any score seen.
Antarctica, the Atacama proper, Iceland and Hawaii are deliberately absent:
the brief asks for analogs beyond the places already studied to exhaustion.

Six features are scored across three dimensions: regional median slope,
steep-tail slope (p90), detrended relief and elevation range (terrain);
distance from the equator (illumination); mean precipitation (water). Latitude
rather than insolation carries illumination, because Earth receives about 2.2
times Jezero's top-of-atmosphere flux at any latitude and no Earth site can
close that gap — the flux is reported as context instead. Air temperature,
wind and surface shortwave are measured on Earth only and are never scored.

The separation rule is 150 km, wider than a one-degree region, so a shortlist
spans distinct regions rather than neighbouring cells of one place.

Build: `.venv/bin/python scripts/build_discovery.py --spec data/discovery/global.json`
(about ten minutes; ~144 Copernicus tiles and one NASA POWER query per footprint).

## Eastern Morocco pilot (`pilot.json`, spec `discovery-v1.0`)

The pilot survey is `morocco-4c20d8478ee2`: 16 systematic centres in
31–32 N, 3–2 W. This is a regional terrain screening experiment, not a list of
newly established scientific analog sites. The broad label “eastern Morocco”
is geographic context, not an administrative boundary or access assessment;
the region is near the Morocco–Algeria border. Footprints can cross borders.

`pilot.json` fixes the AOI, selection rationale, 4 km grid, 60 km footprints,
coverage rules, scales, catalog buffer and separation rule. The timestamped
preregistration was saved before processing. **Do not tune the AOI after
looking at ranks and describe it as a blind discovery pass.**

## Commands (from backend)

```bash
.venv/bin/python scripts/build_discovery.py
.venv/bin/python scripts/build_discovery.py --offline
.venv/bin/python scripts/build_discovery.py --spec data/discovery/pilot.json --offline
.venv/bin/python scripts/validate_discovery.py morocco-4c20d8478ee2 --offline
.venv/bin/python -m pytest -q -p no:cacheprovider
```

First build needs the installed original MOLA product. If absent, run the existing
`scripts/fetch_mola.py`. Anonymous Copernicus downloads and optional POWER/WorldCover
checks happen only in offline scripts. `--offline` requires verified cached inputs.
Serving the installed run requires **no source rasters, credentials or network**.
Cache checksums are verified before reuse; files are atomically installed. Builds
resume cached acquisitions and rerun the small deterministic processing pass.

All 16 candidates passed terrain coverage and the 100 km known-catalog buffer;
40 km greedy centre separation returns four results at default weights.
Raw ranks are retained before diversification. The two-feature index is separate
from the curated analog ranking and is not a probability or safety judgment.
The catalog has 11 cited reference points, including four beyond our original
seven: Lake Salda, Rio Tinto, Svalbard AMASE, and Ibn Battuta/Marrakech.
Points are approximate and the catalog is incomplete. Catalog absence is not
scientific novelty; this Moroccan region may already have analog research.

## Actual verification

- Anonymous Copernicus HTTP Range access returned 206; installed MOLA checksum matched.
- Initial acquisition/context/processing pass: 46.94 seconds; final verified-cache
  processing pass: 2.18 seconds. These are local measurements, not performance guarantees.
- Replaying the same source/spec/pipeline hashes reproduced all profiles exactly.
- Common terrain pipeline: local equal-area physical grids on Earth WGS84 and
  Mars radius 3396 km; area-average elevation and validity separately; central
  differences only where all neighbours exist; no median fill.
- Leading result: `region-03-03` (31.875, -2.125), terrain index about 68.54,
  slope about 0.561 deg, detrended relief about 117.16 m. Jezero reference:
  0.986965 deg, 180.522581 m. These are versioned regional model outputs.
- Leading candidate remained first under 45 weight/scale scenarios and four
  ±1 km grid-origin/footprint shifts. Stability is not calibrated confidence.
- Top, middle and bottom raw ranks were reviewed with separately normalized DEM
  contact sheets and independent native WorldCover 2021 centre samples. All three
  sampled windows contained only bare/sparse classification. Samples cover roughly
  1 km, **not** the 60 km footprint. No geological/operational validation is claimed.
- POWER context is one coarse survey-centre query, clearly labelled; not candidate
  climate measurement. WorldCover remains null in discovery scores/profiles;
  independent sample evidence lives only in validation attachments.

## Files and integrity

Each run has immutable `run.json` and a `manifest.json` containing its SHA256,
specification, catalog, source and pipeline identities. The run includes all audit
rows, exclusions, source manifests and exact grid transforms. API loads verify
hashes, schema, counts, units, eligibility and coverage. Corruption fails closed.

`validation.json` is a separate follow-up assessment, bound to the original run
hash by `validation-manifest.json`. Exports include this verified attachment.
The manifest's main SHA256 identifies the on-disk original run, not the export
serialization or a browser session's ranking. Ranking/detail review labels can
reflect the attachment; original artifact bytes remain unchanged.

Heavy rasters and inspection PNG/NumPy caches are ignored under
`backend/data/raw/discovery/`. Compact API artifacts ship in this directory.
No placeholder scientific results or copied known-site imagery are used.

## Sources and limits

- [Copernicus GLO-90](https://copernicus-dem-90m.s3.amazonaws.com/readme.html): DSM,
  including vegetation and infrastructure; respect Copernicus attribution/license.
- [NASA MOLA MEGDR](https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.lbl):
  median/interpolated terrain, not rover hazard mapping.
- [NASA POWER](https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/):
  coarse reanalysis context, header period retained.
- [ESA WorldCover](https://esa-worldcover.org/en/data-access): 2021 v200 classification,
  CC BY 4.0; independent sample evidence, not geological measurements.
- [NASA Analog Explorer](https://science.nasa.gov/solar-system/analog-explorer/):
  catalog context, not validation of our selected candidates.

No lunar search, global optimization, mineral inference, field access, hazard
certification or proven novelty is provided. Soil/rocks, vegetation/water across
the full footprint, geology, permits and land access need further investigation.
