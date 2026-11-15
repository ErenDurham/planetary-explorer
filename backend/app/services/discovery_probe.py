"""Score one user-chosen Earth footprint ("a dropped pin") against a run's reference.

The probe runs the SAME pipeline the survey ran - the run's own grid (cell size,
footprint), its own scales, its own catalog buffer and the caller's weights - at a
point the user chose instead of a preregistered centre. Nothing here estimates a
value: the digital-elevation tiles are fetched (content-verified, cached) and
processed with the survey's terrain code, and any basis feature that code cannot
measure at the point leaves the probe UNSCORED rather than approximated.

What a probe is not: it is not a survey candidate. It was not sampled
systematically, it was not screened or diversified with the pool, and it never
enters a ranking. The response says where it would have placed among the
eligible candidates under the same weights, which is context, not a rank.

The contract says request handlers never acquire data, so by default the probe
reads only tiles already in the verified cache (the surveyed regions and their
neighbours) and reports anything else as terrain_unavailable. A local API can opt
in to on-demand tile fetching with DISCOVERY_PROBE_FETCH=true; fetched tiles go
into the same content-verified cache the offline builder uses.

Raster libraries are imported lazily so the API still boots where they are
absent (the GitHub Pages build runs this backend in the browser without them);
there the probe answers 503 data_unavailable and says why.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

from app.config.settings import get_settings
from app.models.discovery import (DiscoveryNovelty, DiscoveryProbePlacement, DiscoveryProbeRequest,
    DiscoveryProbeResponse, DiscoveryProfile, DiscoverySource)
from app.services.discovery_engine import (DiscoveryRejected, DiscoveryUnavailable, basis, distance_km, load_run,
    resolve_weights, score_measurements)

CACHE_ONLY_NOTE = ("Terrain tiles are read from the verified cache only; this API does not download data on request. "
    "Pins inside or near the surveyed regions have cached tiles; elsewhere the probe reports terrain unavailable.")

PROBE_LIMITATIONS = [
    "Scored on demand at a user-chosen point with the survey's own pipeline and scales; it is not part of the "
    "preregistered sample, was not screened or diversified with the pool, and does not enter the ranking.",
    "Placement among the survey's candidates is context under the current weights, not a rank; a different "
    "weighting changes it.",
]

# Features the probe can settle from the coordinate alone. Every other scored
# feature must come out of the terrain profile; a feature neither supplies is
# reported missing and the probe stays unscored.
COORDINATE_FEATURES = {"latitude_abs_deg": lambda lat, lon: abs(lat)}


def terrain_tools():
    """The survey's terrain code, imported only when a probe is actually requested."""
    try:
        from scripts.build_discovery import earth_grid
        from scripts.discovery_terrain import profile
    except ImportError as exc:  # rasterio / pyproj absent, e.g. the in-browser Pages runtime
        raise DiscoveryUnavailable("Pin scoring runs only against the local API: it reads digital-elevation tiles "
            f"with raster libraries this deployment does not have ({exc.name or exc}).") from exc
    return earth_grid, profile


def _check_point(lat: float, lon: float):
    # The survey's tile grammar covers non-polar, non-dateline footprints; refuse the rest plainly.
    if not -79.5 < lat < 79.5:
        raise DiscoveryRejected("the terrain tiles the survey uses stop at 80 degrees; choose a point between 79.5 S and 79.5 N")
    if not -179.5 < lon < 179.5:
        raise DiscoveryRejected("a footprint across the antimeridian is not supported; choose a point away from 180 degrees")


def _novelty(run, lat, lon) -> DiscoveryNovelty | None:
    known = (run.validation or {}).get("known_catalog") or {}
    entries = known.get("entries") or []
    if not entries:
        return None
    buffer_km = run.specification.get("catalog_buffer_km")
    nearest = min(entries, key=lambda k: distance_km(lat, lon, k["lat"], k["lon_east"]))
    d = distance_km(lat, lon, nearest["lat"], nearest["lon_east"])
    return DiscoveryNovelty(catalog_version=known.get("version", "unknown"), nearest_known_site_id=nearest["id"],
        nearest_known_site_distance_km=d,
        buffer_rule=f"Exclude centres <= {buffer_km} km from approximate catalog reference points; not a site boundary",
        outside_catalog_buffer=buffer_km is None or d > buffer_km)


def _placement(run, lat, lon, features, weights, probe_distance) -> DiscoveryProbePlacement:
    b = run.survey.bounds
    inside = b.west <= lon <= b.east and b.south <= lat <= b.north
    eligible = [row for row in run.audit_rows if not row.screening_reasons]
    closer = 0
    nearest_id, nearest_km = None, None
    for row in eligible:
        d = sum(abs(row.profile.measurements[fid].value - run.reference_profile.measurements[fid].value) / scale * weights[fid]
                for fid, (_, _, scale, _, _) in features.items())
        if probe_distance is not None and d < probe_distance:
            closer += 1
        km = distance_km(lat, lon, row.candidate.lat, row.candidate.lon_east)
        if nearest_km is None or km < nearest_km:
            nearest_id, nearest_km = row.candidate.id, km
    return DiscoveryProbePlacement(inside_survey_bounds=inside, nearest_survey_candidate_id=nearest_id,
        nearest_survey_candidate_distance_km=nearest_km,
        closer_survey_candidates=closer if probe_distance is not None else None, eligible_pool_count=len(eligible))


def probe(req: DiscoveryProbeRequest) -> DiscoveryProbeResponse:
    run, _ = load_run(req.run_id)
    features = basis(run)
    weights = resolve_weights(run, req.weights)
    _check_point(req.lat, req.lon_east)
    earth_grid, profile = terrain_tools()
    spec = run.specification
    fetch = bool(get_settings().discovery_probe_fetch)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    common = dict(run_id=run.run_id, reference=run.reference, lat=req.lat, lon_east=req.lon_east,
        effective_weights=weights, client_request_id=req.client_request_id, computed_at=now,
        novelty=_novelty(run, req.lat, req.lon_east),
        limitations=PROBE_LIMITATIONS + ([] if fetch else [CACHE_ONLY_NOTE]) + list(run.limitations))

    try:
        z, support, grid, polygon, sources, errors = earth_grid(req.lat, req.lon_east, spec, not fetch)
    except (ValueError, OSError) as exc:
        # No cached tile covers the footprint (or, when fetching is enabled, none could be fetched).
        why = ("No cached digital-elevation tile covers this footprint, and this API does not download tiles on request; "
               "drop the pin inside or near a surveyed region, or enable DISCOVERY_PROBE_FETCH on a local API."
               if not fetch else "No digital-elevation tile covers this footprint, or none could be fetched.")
        return DiscoveryProbeResponse(**common, status="terrain_unavailable",
            reasons=[why, "Detail: " + str(exc)[:300]],
            placement=_placement(run, req.lat, req.lon_east, features, weights, None))
    sources = [DiscoverySource.model_validate(s) for s in sources]
    reasons = [f"Acquisition gaps: {'; '.join(errors)}"] if errors else []
    try:
        measured = profile(z, support, *grid, spec)
    except ValueError as exc:
        return DiscoveryProbeResponse(**common, status="insufficient_terrain_coverage", footprint_geojson=polygon,
            reasons=reasons + [f"The footprint has too little valid terrain to measure: {exc}"], sources=sources,
            placement=_placement(run, req.lat, req.lon_east, features, weights, None))
    terrain = DiscoveryProfile.model_validate(measured)
    if (terrain.terrain_valid_fraction < spec["min_terrain_valid_fraction"]
            or terrain.gradient_valid_fraction < spec["min_gradient_valid_fraction"]):
        return DiscoveryProbeResponse(**common, status="insufficient_terrain_coverage", footprint_geojson=polygon,
            profile=terrain, sources=sources, reasons=reasons + [
                f"Valid terrain {terrain.terrain_valid_fraction:.0%} and gradient support {terrain.gradient_valid_fraction:.0%} "
                f"fall below the survey's cut-offs ({spec['min_terrain_valid_fraction']:.0%} and {spec['min_gradient_valid_fraction']:.0%})."],
            placement=_placement(run, req.lat, req.lon_east, features, weights, None))

    values = {}
    missing = []
    for fid in features:
        m = terrain.measurements.get(fid)
        if m is not None and math.isfinite(m.value):
            values[fid] = m.value
        elif fid in COORDINATE_FEATURES:
            values[fid] = COORDINATE_FEATURES[fid](req.lat, req.lon_east)
        else:
            missing.append(fid)
    if missing:
        # The survey scores a feature the probe cannot measure at an arbitrary point (a climate
        # record, say). Reporting a partial index would misstate the comparison, so there is none.
        return DiscoveryProbeResponse(**common, status="features_unavailable", footprint_geojson=polygon,
            profile=terrain, sources=sources, reasons=reasons + [
                "This survey also scores " + ", ".join(features[f][0] for f in missing) +
                ", which cannot be measured at an arbitrary point here; no index is reported."],
            placement=_placement(run, req.lat, req.lon_east, features, weights, None))

    factors, dims, distance, index = score_measurements(run, features, weights, values)
    return DiscoveryProbeResponse(**common, status="scored", footprint_geojson=polygon, profile=terrain, sources=sources,
        reasons=reasons, feature_distances=factors, dimension_scores=dims, distance=distance, similarity_index=index,
        placement=_placement(run, req.lat, req.lon_east, features, weights, distance))
