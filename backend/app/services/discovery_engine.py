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
    DiscoveryExport, DiscoveryFeatureDistance, DiscoveryRankRequest,
    DiscoveryRankResponse, DiscoveryRunArtifact, DiscoveryRunSummary,
)

FEATURES = {"slope_regional_median_deg": ("Regional median slope", "deg", 1.5),
            "roughness_regional_m": ("Detrended regional relief", "m", 100.0)}
LIMITATIONS = [
    "Proposed regional terrain analog candidates; field validation required.",
    "Similarity is a two-feature heuristic index, not confidence or a probability; do not compare with curated five-feature scores.",
    "4 km cells and 60 km footprints do not resolve rover hazards, trafficability, geology or landing safety.",
    "Outside a catalog buffer does not mean unknown to science or accessible; catalog coverage is incomplete.",
    "Copernicus is a surface model including vegetation and infrastructure; MOLA includes interpolated bins.",
    "Earth atmosphere, gravity, radiation, biology and weather differ from Mars. No transfer has been validated.",
]


class DiscoveryUnavailable(Exception):
    pass


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
        for fid, (_, unit, _) in FEATURES.items():
            m = profile.measurements[fid]
            if m.unit != unit or m.measurement_type != "derived" or not math.isfinite(m.value) or m.value < 0:
                raise ValueError("invalid terrain measurement or unit")
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
                summaries.append(DiscoveryRunSummary(run_id=run.run_id, label=run.label,
                    created_at=run.created_at, bounds=run.survey.bounds,
                    total_sampled=run.survey.generated_count, eligible_count=run.survey.eligible_count))
            except (DiscoveryUnavailable, KeyError) as exc:
                problems.append(str(exc))
    summaries.sort(key=lambda r: r.created_at, reverse=True)
    return DiscoveryCapabilities(state="ready" if summaries else "unavailable", runs=summaries,
        criteria=[DiscoveryCriterion(feature_id=f, label=v[0], unit=v[1], scale=v[2]) for f,v in FEATURES.items()],
        default_weights={f: 50 for f in FEATURES}, limitations=LIMITATIONS + problems)


def rank(req: DiscoveryRankRequest):
    run, _ = load_run(req.run_id)
    weights = req.weights.model_dump()
    total = sum(weights.values())
    weights = {f: v / total for f,v in weights.items()}
    ranked = []
    for row in run.audit_rows:
        if row.screening_reasons:
            continue
        c = row.candidate.model_copy(deep=True)
        from app.services.discovery_research import get_record
        c.research_status = get_record(run.run_id, c.id).status
        factors = []
        for fid, (_, unit, _) in FEATURES.items():
            scale = run.specification["scales"][fid]
            if not math.isfinite(scale) or scale <= 0:
                raise DiscoveryUnavailable("Invalid discovery comparison scale")
            earth = row.profile.measurements[fid].value
            mars = run.reference_profile.measurements[fid].value
            d = abs(earth-mars)/scale
            factors.append(DiscoveryFeatureDistance(feature_id=fid, earth_value=earth, mars_value=mars,
                unit=unit, scale=scale, normalized_weight=weights[fid], distance=d, contribution=d*weights[fid]))
        c.feature_distances = factors
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
