"""Deterministic profile evaluator. Scores only declared requirements and data.

A pool-wide feature basis prevents missing data from improving a site's rank.
All scores use full precision until display. No LLM is involved.
"""
import json
import math
from functools import lru_cache
from pathlib import Path
from app.models.mission_assessment import MissionAssessmentRequest, MissionAssessmentResponse, MissionAssessmentResult, MissionFactor
from app.services.data_loader import get_store
from app.services.scoring_engine import piecewise_linear
from app.models import AnalogWeight
from app.models.analog_rank import AnalogRankRequest
from app.services.analog_engine import load_spec as load_analog_spec
from app.services.analog_rank_engine import rank_pool

@lru_cache
def load_profiles():
    return json.loads((Path(__file__).resolve().parents[1] / "config/mission_profiles.json").read_text())

def _available(measurement, criterion):
    if measurement is None or measurement.is_missing or measurement.value is None or measurement.quality_flag == "demo_fixture" or measurement.measurement_type == "demo_fixture":
        return False
    if "targets" in criterion:
        return isinstance(measurement.value, list) and all(isinstance(v,str) for v in measurement.value)
    return (isinstance(measurement.value,(int,float)) and not isinstance(measurement.value,bool)
            and math.isfinite(measurement.value) and measurement.unit == criterion["unit"])

def evaluate(req: MissionAssessmentRequest, pool=None):
    spec = load_profiles()
    if req.requirements.analog_reference_id and pool is None:
        if req.body != "earth" or req.mission_type != "rover_field_test":
            raise ValueError("analog_reference_id applies only to the Earth rover field test ranking")
        return _evaluate_against_mars(req, spec)
    profile = spec[req.mission_type]
    if pool is None:
        store = get_store()
        sites = store.earth_candidates() if req.body == "earth" else store.sites()
        pool = [(s, store.earth_profile(s.id) if req.body == "earth" else store.profile(s.id)) for s in sites]
    criteria = profile["criteria"]
    weights = {c["id"]:req.weights.get(c["id"], c["weight"]) for c in criteria}
    requirements = req.requirements.model_dump()
    for key in ("material_targets", "landform_targets", "excluded_material_targets"):
        requirements[key] = sorted(set(t.strip().lower().replace(" ","_") for t in requirements[key] if t.strip()))
    # Research claims must use the actual catalogue vocabulary, not silently score typos as absence.
    if req.mission_type == "research":
        for c in criteria:
            known = set()
            for _,p in pool:
                m = p.get(c["feature"]) if p else None
                if _available(m,c): known.update(m.value)
            unknown = (set(requirements[c["targets"]]) | (set(requirements["excluded_material_targets"]) if c["id"] == "materials" else set())) - known
            if unknown:
                raise ValueError(f"Unknown {c['label'].lower()}: {', '.join(sorted(unknown))}")
    configured = [c for c in criteria if weights[c["id"]] > 0 and ("targets" not in c or requirements[c["targets"]])]
    missing_targets = [f"Select {c['label'].lower()} to activate this priority." for c in criteria if weights[c['id']] > 0 and "targets" in c and not requirements[c['targets']]]
    valid = [c for c in configured if pool and (any if req.mission_type == "research" else all)(_available(p.get(c["feature"]) if p else None,c) for _,p in pool)]
    excluded = [f"{c['label']} excluded for every site: missing, non-finite or incompatible data in the candidate pool." for c in configured if c not in valid]
    denominator = sum(weights[c["id"]] for c in configured)
    valid_weight = sum(weights[c["id"]] for c in valid)
    coverage = valid_weight / denominator if denominator else 0
    status = "not_supported" if req.mission_type == "base_planning" else "needs_requirements" if not configured else "scored" if valid_weight else "insufficient_data"
    results = []
    for site,p in pool:
        factors = []
        site_valid = [c for c in valid if _available(p.get(c["feature"]) if p else None,c)]
        site_coverage = sum(weights[c["id"]] for c in site_valid) / denominator if denominator else 0
        site_status = "insufficient_data" if req.mission_type == "research" and configured and len(site_valid) != len(configured) else status
        mineral_data=p.get("mineralogy_tags") if p else None
        exclusion_unknown=bool(req.mission_type == "research" and requirements["excluded_material_targets"] and not _available(mineral_data,{"targets":"material_targets"}))
        blocked=set(requirements["excluded_material_targets"]) & set(mineral_data.value) if mineral_data and isinstance(mineral_data.value,list) else set()
        if exclusion_unknown: site_status="insufficient_data"
        provenance_gaps = ([f"{c['label']}: no compatible site data; site is unranked rather than scored as zero." for c in configured if c not in site_valid] if req.mission_type == "research" else [])
        for c in criteria:
            m = p.get(c["feature"]) if p else None
            ok = c in site_valid
            q = None
            if ok and "targets" in c:
                targets = set(requirements[c["targets"]]); found = targets & set(m.value)
                q = float(bool(found)) if c["id"] == "materials" and req.requirements.material_match == "any" else len(found)/len(targets)
                note = ("Any requested material qualifies. " if c["id"] == "materials" and req.requirements.material_match == "any" else "") + f"{len(found)} of {len(targets)} requested tags documented: {', '.join(sorted(found)) or 'none'}. Unreported tags are not confirmed absent."
            elif ok:
                target, tolerance = requirements[c["target"]],requirements[c["tolerance"]]
                q = piecewise_linear(abs(float(m.value)-target), "lower_is_better", 0, tolerance)
                note = f"Target {target:g} {c['unit']}; tolerance {tolerance:g} {c['unit']}. Absolute difference {abs(float(m.value)-target):g} {c['unit']}."
            else:
                note = "Weight is zero." if weights[c['id']] == 0 else "No targets selected." if c not in configured else "Site data missing or incompatible; no score is assigned." if req.mission_type == "research" else "Excluded pool-wide: data missing or incompatible."
            if ok and req.mission_type == "research" and blocked:
                q=0.0
                note += f" Excluded material documented: {', '.join(sorted(blocked))}; this site does not meet the exclusion."
            generic_source = bool(ok and "targets" in c and m.source_id == "nasa_analogs_overview")
            if generic_source:
                gap = f"{c['label']}: catalogue tags cite a general analog overview; verify site-specific support."
                provenance_gaps.append(gap)
                note += " Site-specific provenance needs verification."
            weight = weights[c['id']]/valid_weight if ok else None
            value = m.value if _available(m,c) else None
            factors.append(MissionFactor(criterion_id=c['id'],label=c['label'],feature_id=c['feature'],value=value,
                unit=m.unit if m else c.get('unit'),q=q,normalized_weight=weight,
                contribution=100*weight*q if ok else None,
                source=p.sources.get(m.source_id) if p and m and m.source_id else None,
                method="tag_target_coverage" if "targets" in c else "target_distance",note=note,quality="low_confidence" if generic_source else m.quality_flag if m else None))
        score = sum(f.contribution for f in factors if f.contribution is not None) if site_status == "scored" else None
        results.append(MissionAssessmentResult(site_id=site.id,site_name=site.name,body=req.body,score=score,status=site_status,
            coverage_fraction=site_coverage if req.mission_type == "research" else coverage,factors=factors,evidence_gaps=profile.get('evidence_gaps',[])+missing_targets+excluded+provenance_gaps))
    results.sort(key=lambda r:(-(r.score if r.score is not None else -1),r.site_id))
    previous_score = None
    rank = 0
    for index,result in enumerate(results,1):
        if result.score is not None:
            if previous_score is None or not math.isclose(result.score,previous_score,rel_tol=0,abs_tol=1e-12): rank=index
            result.rank=rank;previous_score=result.score
    if req.mission_type == "research" and req.requirements.material_match == "any":
        profile = {**profile, "method": "Material match = 1 if at least one requested material tag is documented, otherwise 0. Other configured target coverage uses the fraction documented. Index = 100 × weighted mean; sites missing an active criterion are unranked. Ties are preserved. This does not rank ice proximity or accessibility."}
    return MissionAssessmentResponse(body=req.body,mission_type=req.mission_type,spec_version=spec['version'],
        profile_label=profile['label'],method=profile['method'],assumptions=profile['assumptions'],warnings=missing_targets+excluded,
        requirements=requirements,results=results,client_request_id=req.client_request_id)


def analog_weights(rover_weights: dict[str, float]) -> dict[str, float]:
    """Analog feature weights for the Earth ranking: the analog spec defaults,
    with the spec's slope + relief share split by the Earth slope/relief sliders."""
    w = {fs["feature_id"]: float(fs["default_weight"]) for fs in load_analog_spec()["features"]}
    terrain = w["slope_regional_median_deg"] + w["roughness_regional_m"]
    slope, relief = float(rover_weights.get("slope", 0)), float(rover_weights.get("relief", 0))
    if slope + relief > 0:
        w["slope_regional_median_deg"] = terrain * slope / (slope + relief)
        w["roughness_regional_m"] = terrain * relief / (slope + relief)
    return w


def _evaluate_against_mars(req: MissionAssessmentRequest, spec) -> MissionAssessmentResponse:
    """Earth sites ranked by their analog similarity to one Mars site: the same
    pool-wide calculation as POST /analogs/rank (analog_rank_engine), reported
    in the mission-assessment shape so the Explore list, map and detail work
    unchanged. Each factor's points are the share of (100 - score) it cost,
    so the factors add up exactly to the score."""
    store = get_store()
    mars_id = req.requirements.analog_reference_id
    mars_site = store.site(mars_id)
    if mars_site is None or store.profile(mars_id) is None:
        raise ValueError(f"Unknown Mars site: {mars_id}")
    profile = spec["rover_field_test"]
    block = profile["analog_reference"]
    analog_spec = load_analog_spec()
    weights = {k: v for k, v in profile_weights(req).items()}
    w = analog_weights(weights)
    ranked = rank_pool(AnalogRankRequest(reference_body="mars", reference_id=mars_id, candidate_body="earth",
                                         weights=[AnalogWeight(feature_id=f, weight=v) for f, v in w.items()]), store)
    sources = {c.id: store.earth_profile(c.id) for c in store.earth_candidates()}
    fmt = {"mars_name": mars_site.name, "analog_version": analog_spec["version"]}
    results = []
    for cand in ranked.candidates:
        prof = sources.get(cand.location.id)
        fds = [f for f in cand.feature_distances if f.feature_id in ranked.basis_features]
        D = sum(f.contribution for f in fds if f.contribution is not None) if fds else None
        score = None if D is None else 100.0 / (1.0 + D)
        factors = []
        for f in fds:
            lost = 0.0 if not D else (100.0 - score) * (f.contribution or 0.0) / D
            m = prof.get(f.feature_id) if prof else None
            factors.append(MissionFactor(criterion_id=f.feature_id, label=f.label, feature_id=f.feature_id, value=f.earth_value, unit=f.unit,
                q=None if f.distance is None else 1.0 / (1.0 + f.distance), normalized_weight=f.normalized_weight, contribution=-lost,
                source=prof.sources.get(m.source_id) if prof and m and m.source_id else None, method="analog_feature_distance",
                note=f"{f.note}. Cost {lost:.1f} of the 100 points.", quality=m.quality_flag if m else None))
        results.append(MissionAssessmentResult(site_id=cand.location.id, site_name=cand.location.name, body="earth", score=score, rank=cand.rank,
            status="scored" if score is not None else "insufficient_data", coverage_fraction=cand.coverage_fraction, factors=factors,
            evidence_gaps=[f"{e.label}: {e.reason}" for e in ranked.excluded_features if e.reason != "weight is 0 for this ranking"]))
    return MissionAssessmentResponse(body="earth", mission_type=req.mission_type, spec_version=f"{spec['version']} + {analog_spec['version']}",
        profile_label=block["label"].format(**fmt), method=block["method"].format(**fmt), assumptions=block["assumptions"],
        warnings=list(ranked.warnings), requirements=req.requirements.model_dump(), results=results, client_request_id=req.client_request_id)


def profile_weights(req: MissionAssessmentRequest) -> dict[str, float]:
    criteria = load_profiles()[req.mission_type]["criteria"]
    return {c["id"]: req.weights.get(c["id"], c["weight"]) for c in criteria}
