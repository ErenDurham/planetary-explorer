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
    profile = spec[req.mission_type]
    if pool is None:
        store = get_store()
        sites = store.earth_candidates() if req.body == "earth" else store.sites()
        pool = [(s, store.earth_profile(s.id) if req.body == "earth" else store.profile(s.id)) for s in sites]
    criteria = profile["criteria"]
    weights = {c["id"]:req.weights.get(c["id"], c["weight"]) for c in criteria}
    requirements = req.requirements.model_dump()
    for key in ("material_targets", "landform_targets"):
        requirements[key] = sorted(set(t.strip().lower().replace(" ","_") for t in requirements[key] if t.strip()))
    # Research claims must use the actual catalogue vocabulary, not silently score typos as absence.
    if req.mission_type == "research":
        for c in criteria:
            known = set()
            for _,p in pool:
                m = p.get(c["feature"]) if p else None
                if _available(m,c): known.update(m.value)
            unknown = set(requirements[c["targets"]]) - known
            if unknown:
                raise ValueError(f"Unknown {c['label'].lower()}: {', '.join(sorted(unknown))}")
    configured = [c for c in criteria if weights[c["id"]] > 0 and ("targets" not in c or requirements[c["targets"]])]
    missing_targets = [f"Select {c['label'].lower()} to activate this priority." for c in criteria if weights[c['id']] > 0 and "targets" in c and not requirements[c['targets']]]
    valid = [c for c in configured if pool and all(_available(p.get(c["feature"]) if p else None,c) for _,p in pool)]
    excluded = [f"{c['label']} excluded for every site: missing, non-finite or incompatible data in the candidate pool." for c in configured if c not in valid]
    denominator = sum(weights[c["id"]] for c in configured)
    valid_weight = sum(weights[c["id"]] for c in valid)
    coverage = valid_weight / denominator if denominator else 0
    status = "not_supported" if req.mission_type == "base_planning" else "needs_requirements" if not configured else "scored" if valid_weight else "insufficient_data"
    results = []
    for site,p in pool:
        factors = []
        provenance_gaps = []
        for c in criteria:
            m = p.get(c["feature"]) if p else None
            ok = c in valid
            q = None
            if ok and "targets" in c:
                targets = set(requirements[c["targets"]]); found = targets & set(m.value)
                q = len(found)/len(targets)
                note = f"{len(found)} of {len(targets)} requested tags documented: {', '.join(sorted(found)) or 'none'}. Unreported tags are not confirmed absent."
            elif ok:
                target, tolerance = requirements[c["target"]],requirements[c["tolerance"]]
                q = piecewise_linear(abs(float(m.value)-target), "lower_is_better", 0, tolerance)
                note = f"Target {target:g} {c['unit']}; tolerance {tolerance:g} {c['unit']}. Absolute difference {abs(float(m.value)-target):g} {c['unit']}."
            else:
                note = "Weight is zero." if weights[c['id']] == 0 else "No targets selected." if c not in configured else "Excluded pool-wide: data missing or incompatible."
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
        score = sum(f.contribution for f in factors if f.contribution is not None) if status == "scored" else None
        results.append(MissionAssessmentResult(site_id=site.id,site_name=site.name,body=req.body,score=score,status=status,
            coverage_fraction=coverage,factors=factors,evidence_gaps=profile.get('evidence_gaps',[])+missing_targets+excluded+provenance_gaps))
    results.sort(key=lambda r:(-(r.score if r.score is not None else -1),r.site_id))
    previous_score = None
    rank = 0
    for index,result in enumerate(results,1):
        if result.score is not None:
            if previous_score is None or not math.isclose(result.score,previous_score,rel_tol=0,abs_tol=1e-12): rank=index
            result.rank=rank;previous_score=result.score
    return MissionAssessmentResponse(body=req.body,mission_type=req.mission_type,spec_version=spec['version'],
        profile_label=profile['label'],method=profile['method'],assumptions=profile['assumptions'],warnings=missing_targets+excluded,
        requirements=requirements,results=results,client_request_id=req.client_request_id)
