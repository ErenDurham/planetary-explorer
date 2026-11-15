"""Offline-artifact-only discovery service. No network or raster dependencies."""
from __future__ import annotations

import hashlib
import json
import math
from collections import Counter
from pathlib import Path

from app.config.settings import get_settings
from app.models.discovery import (
    DiscoveryCapabilities, DiscoveryCandidateDetail, DiscoveryCriterion,
    DiscoveryDimensionScore, DiscoveryExport, DiscoveryFeatureDistance,
    DiscoveryRankRequest, DiscoveryRankResponse, DiscoveryRunArtifact,
    DiscoveryRunSummary,
)

# Dimension groups. An analog may be strong in one and poor in another; the engine
# scores each separately so the shortlist never hides that behind a single number.
GROUPS = {
    "terrain": "Terrain and landform",
    "illumination": "Illumination and latitude",
    "water": "Water and aridity",
}

# Every feature the engine knows how to score, with the scale that turns a physical
# difference into a dimensionless one. Scales are documented screening assumptions,
# not calibrated tolerances. A run scores whichever subset its specification registers.
FEATURE_REGISTRY = {
    "slope_regional_median_deg": ("Regional median slope", "deg", 1.5, "terrain",
        "Typical regional gradient: the first control on where a vehicle can go and where loose material comes to rest."),
    "slope_regional_p90_deg": ("Steep-tail slope (90th percentile)", "deg", 3.0, "terrain",
        "The steep tail that actually constrains landing and mobility, which a median slope hides."),
    "roughness_regional_m": ("Detrended regional relief", "m", 100.0, "terrain",
        "Relief left after removing the regional plane: surface texture rather than overall tilt."),
    "elevation_range_m": ("Elevation range (p90 minus p10)", "m", 400.0, "terrain",
        "Vertical amplitude across the footprint: how dissected the region is, and the depth of any basin or valley in it."),
    "latitude_abs_deg": ("Distance from the equator", "deg", 15.0, "illumination",
        "Illumination geometry and seasonality. Absolute insolation cannot match -- Earth receives about 2.2 times Mars's flux -- but the latitude regime transfers, so it is latitude that is scored and the flux gap that is reported as context."),
    "precipitation_mm_day": ("Mean precipitation", "mm/day", 1.0, "water",
        "Liquid water reaching the surface today: the aridity axis that separates a dry analog from a merely rocky one."),
}

# Back-compatible view used by the offline builder and the v1 artifacts.
FEATURES = {f: (v[0], v[1], v[2]) for f, v in FEATURE_REGISTRY.items() if f in ("slope_regional_median_deg", "roughness_regional_m")}

LIMITATIONS = [
    "Proposed regional terrain analog candidates; field validation required.",
    "Similarity is a heuristic index over the scored features, not confidence or a probability; do not compare it with curated five-feature scores.",
    "4 km cells and 60 km footprints do not resolve rover hazards, trafficability, geology or landing safety.",
    "Outside a catalog buffer does not mean unknown to science or accessible; catalog coverage is incomplete.",
    "Copernicus is a surface model including vegetation and infrastructure; MOLA includes interpolated bins.",
    "Earth atmosphere, gravity, radiation, biology and weather differ from Mars. No transfer has been validated.",
]


class DiscoveryUnavailable(Exception):
    pass


class DiscoveryRejected(ValueError):
    """A well-formed request the installed survey cannot answer. Never a server fault."""


def root() -> Path:
    return get_settings().data_dir / "discovery" / "runs"


def distance_km(a_lat, a_lon, b_lat, b_lon):
    """Great-circle WGS84-mean-sphere catalog distance, not a travel distance."""
    p, q = math.radians(a_lat), math.radians(b_lat)
    d = math.sin((q-p)/2)**2 + math.cos(p)*math.cos(q)*math.sin(math.radians(b_lon-a_lon)/2)**2
    return 6371.0088 * 2 * math.asin(math.sqrt(min(1, max(0, d))))


def load_run(run_id: str) -> tuple[DiscoveryRunArtifact, dict]:
    # Never construct a path from an unchecked route parameter.
    import re
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", run_id):
        raise KeyError(run_id)
    directory = root() / run_id
    if not directory.is_dir():
        if not root().exists() or not any(p.is_dir() and not p.name.startswith(".") for p in root().iterdir()):
            raise DiscoveryUnavailable("No discovery artifacts installed; run the offline builder.")
        raise KeyError(run_id)
    try:
        raw = (directory / "run.json").read_bytes()
        manifest = json.loads((directory / "manifest.json").read_text())
        if hashlib.sha256(raw).hexdigest() != manifest["sha256"]:
            raise ValueError("artifact checksum mismatch")
        run = DiscoveryRunArtifact.model_validate_json(raw)
        if run.run_id != run_id or manifest["run_id"] != run_id:
            raise ValueError("run ID mismatch")
        verify_run(run)
        review_path = directory / "validation.json"
        if review_path.exists():
            review_raw = review_path.read_bytes()
            review_manifest = json.loads((directory / "validation-manifest.json").read_text())
            if (digest := hashlib.sha256(review_raw).hexdigest()) != review_manifest["sha256"] or review_manifest["run_sha256"] != manifest["sha256"]:
                raise ValueError("validation attachment checksum mismatch")
            review = json.loads(review_raw)
            run.validation["follow_up_assessment"] = review
            reviewed = {r["candidate_id"] for r in review.get("desktop_review", []) if r.get("manual_observations")}
            for row in run.audit_rows:
                if row.candidate.id in reviewed:
                    row.candidate.novelty.review_status = "desktop_reviewed"
        return run, manifest
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise DiscoveryUnavailable(f"Invalid discovery artifact {run_id}: {exc}") from exc


def basis(run) -> dict[str, tuple]:
    """The features this run scores, taken from its own preregistered scales.

    A run may never score a feature the engine does not know, and the stored scale
    always wins over the registry default: the artifact is the record of what was run.
    """
    scales = run.specification.get("scales") or {}
    unknown = sorted(set(scales) - set(FEATURE_REGISTRY))
    if unknown:
        raise ValueError("run scores unknown features: " + ", ".join(unknown))
    if not scales:
        raise ValueError("run registers no scored features")
    out = {}
    for feature, scale in scales.items():
        label, unit, _, group, rationale = FEATURE_REGISTRY[feature]
        if not isinstance(scale, (int, float)) or not math.isfinite(scale) or scale <= 0:
            raise ValueError("invalid discovery comparison scale")
        out[feature] = (label, unit, float(scale), group, rationale)
    return out


def criteria_for(run) -> list[DiscoveryCriterion]:
    return [DiscoveryCriterion(feature_id=f, label=v[0], unit=v[1], scale=v[2], group=v[3],
                               group_label=GROUPS.get(v[3], v[3]), rationale=v[4])
            for f, v in basis(run).items()]


def default_weights_for(run) -> dict[str, float]:
    """A run's own default emphasis, falling back to an equal split over its basis."""
    features = basis(run)
    stored = run.specification.get("default_weights") or {}
    weights = {f: float(stored[f]) for f in features if f in stored and isinstance(stored[f], (int, float))}
    if weights and sum(weights.values()) > 0:
        return weights
    return {f: round(100 / len(features), 4) for f in features}


def verify_run(run):
    rows = run.audit_rows
    valid = sum(r.profile is not None for r in rows)
    eligible = sum(not r.screening_reasons for r in rows)
    if (len(rows), valid, eligible) != (run.survey.generated_count, run.survey.terrain_valid_count, run.survey.eligible_count):
        raise ValueError("survey counts do not reconcile")
    if len({r.candidate.id for r in rows}) != len(rows):
        raise ValueError("duplicate candidates")
    exclusions = dict(Counter(reason for r in rows for reason in r.screening_reasons))
    if exclusions != run.survey.exclusion_counts or len(run.survey.sampling_centres) != len(rows):
        raise ValueError("exclusions or sampling centres do not reconcile")
    for row in rows:
        if not row.screening_reasons and not row.candidate.novelty.outside_catalog_buffer:
            raise ValueError("eligible candidate lies inside catalog buffer")
    for profile in [run.reference_profile] + [r.profile for r in rows if not r.screening_reasons]:
        if profile is None:
            raise ValueError("eligible candidate lacks terrain")
        for fid, (_, unit, _, _, _) in basis(run).items():
            m = profile.measurements.get(fid)
            # Precipitation is legitimately zero on Mars; no scored feature may be negative.
            if m is None or m.unit != unit or not math.isfinite(m.value) or m.value < 0:
                raise ValueError(f"invalid or missing measurement for {fid}")
        if profile.terrain_valid_fraction < run.specification["min_terrain_valid_fraction"]:
            raise ValueError("inadequate valid terrain")
        if profile.gradient_valid_fraction < run.specification["min_gradient_valid_fraction"]:
            raise ValueError("inadequate gradient support")


def capabilities():
    summaries, problems = [], []
    if root().exists():
        for p in sorted(root().iterdir()):
            if not p.is_dir() or p.name.startswith("."):
                continue
            try:
                run, _ = load_run(p.name)
                regions = run.survey.regions
                summaries.append(DiscoveryRunSummary(run_id=run.run_id, label=run.label,
                    created_at=run.created_at, bounds=run.survey.bounds,
                    total_sampled=run.survey.generated_count, eligible_count=run.survey.eligible_count,
                    region_count=len(regions) or 1, regions=regions,
                    criteria=criteria_for(run), default_weights=default_weights_for(run)))
            except (DiscoveryUnavailable, KeyError) as exc:
                problems.append(str(exc))
    summaries.sort(key=lambda r: r.created_at, reverse=True)
    # Capabilities describe the newest survey; each summary still carries its own basis
    # so switching surveys switches the weight controls with it.
    newest = summaries[0] if summaries else None
    union, seen = [], set()
    for summary in summaries:
        for criterion in summary.criteria:
            if criterion.feature_id not in seen:
                seen.add(criterion.feature_id); union.append(criterion)
    return DiscoveryCapabilities(state="ready" if summaries else "unavailable", runs=summaries,
        criteria=newest.criteria if newest else union,
        default_weights=newest.default_weights if newest else {}, limitations=LIMITATIONS + problems)


def resolve_weights(run, requested: dict[str, float] | None) -> dict[str, float]:
    """Normalise a weight request against the run's own basis.

    Unknown or unscored features are refused rather than silently dropped, so a
    client can never believe it weighted something the survey does not measure.
    """
    features = basis(run)
    raw = dict(requested) if requested else default_weights_for(run)
    unknown = sorted(set(raw) - set(features))
    if unknown:
        raise DiscoveryRejected("this survey does not score: " + ", ".join(unknown))
    raw = {f: float(raw.get(f, 0.0)) for f in features}
    total = sum(raw.values())
    if not math.isfinite(total) or total <= 0:
        raise DiscoveryRejected("weights need a finite positive total")
    return {f: v / total for f, v in raw.items()}


def dimension_scores(factors, weights) -> list[DiscoveryDimensionScore]:
    """Similarity within each dimension, on the same index scale as the total.

    A group's distance is the weighted mean inside that group, so a candidate that
    matches the terrain but not the water budget reports both plainly.
    """
    out = []
    for group, label in GROUPS.items():
        members = [f for f in factors if FEATURE_REGISTRY[f.feature_id][3] == group]
        share = sum(weights[f.feature_id] for f in members)
        if not members or share <= 0:
            continue
        distance = sum(f.contribution for f in members) / share
        out.append(DiscoveryDimensionScore(group=group, label=label,
            feature_ids=[f.feature_id for f in members], weight_share=share,
            distance=distance, similarity_index=100 / (1 + distance)))
    return out


def rank(req: DiscoveryRankRequest):
    run, _ = load_run(req.run_id)
    features = basis(run)
    weights = resolve_weights(run, req.weights)
    ranked = []
    for row in run.audit_rows:
        if row.screening_reasons:
            continue
        c = row.candidate.model_copy(deep=True)
        from app.services.discovery_research import get_record
        c.research_status = get_record(run.run_id, c.id).status
        factors = []
        for fid, (_, unit, scale, _, _) in features.items():
            earth = row.profile.measurements[fid].value
            mars = run.reference_profile.measurements[fid].value
            d = abs(earth-mars)/scale
            factors.append(DiscoveryFeatureDistance(feature_id=fid, earth_value=earth, mars_value=mars,
                unit=unit, scale=scale, normalized_weight=weights[fid], distance=d, contribution=d*weights[fid]))
        c.feature_distances = factors
        c.dimension_scores = dimension_scores(factors, weights)
        c.distance = sum(f.contribution for f in factors)
        c.similarity_index = 100/(1+c.distance)
        ranked.append(c)
    ranked.sort(key=lambda c: (c.distance, c.id))
    chosen = []
    separation = run.survey.diversification["minimum_center_distance_km"]
    for i, c in enumerate(ranked, 1):
        c.raw_rank = i
        if all(distance_km(c.lat,c.lon_east,x.lat,x.lon_east) >= separation for x in chosen):
            c.display_rank = len(chosen)+1
            chosen.append(c)
    chosen = chosen[:req.top_k]
    return DiscoveryRankResponse(run_id=run.run_id, reference=run.reference, survey=run.survey,
        basis_features=[f for f in FEATURES if weights[f]>0], effective_weights=weights,
        eligible_pool_count=len(ranked), returned_count=len(chosen), candidates=chosen,
        client_request_id=req.client_request_id, limitations=run.limitations)


def detail(run_id, candidate_id):
    run, _ = load_run(run_id)
    row = next((r for r in run.audit_rows if r.candidate.id == candidate_id), None)
    if row is None:
        raise KeyError(candidate_id)
    from app.services.discovery_research import get_record
    candidate = row.candidate.model_copy(deep=True)
    candidate.research_status = get_record(run_id, candidate_id).status
    # Details use immutable measurements, not a stale or implicit weight selection.
    return DiscoveryCandidateDetail(**candidate.model_dump(), profile=row.profile,
        screening_reasons=row.screening_reasons, source_manifest=row.candidate.sources,
        proposed_field_validation=["Check land access, permissions and local hazards before any field visit.",
            "Survey terrain at metre scale and compare with regional orbital statistics.",
            "Measure geology/materials and test the proposed mapping procedure; transfer to Mars remains unvalidated."])


def export(run_id):
    run, manifest = load_run(run_id)
    from app.services.discovery_research import get_record
    research_records = {r.candidate.id: get_record(run_id, r.candidate.id).model_dump() for r in run.audit_rows}
    run.validation["candidate_research"] = {key: value for key, value in research_records.items() if value["updated_at"] is not None}
    return DiscoveryExport(manifest=manifest, specification=run.specification, survey=run.survey,
        reference_profile=run.reference_profile, audit_rows=run.audit_rows,
        exclusions=run.survey.exclusion_counts, provenance=run.provenance, validation=run.validation)
