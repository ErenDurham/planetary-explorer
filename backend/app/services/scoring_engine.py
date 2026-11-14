"""Landing suitability engine (Mission Phase 1).

Owner: Engineer 3. Pure functions over Pydantic models and the scoring spec;
no I/O, no randomness, no LLM. Formulas (docs/SCIENTIFIC_METHOD.md):

    q(s,i)    = f_i(x(s,i))                      suitability in [0,1]
    Score(s)  = 100 * sum(w_i q(s,i)) / sum(w_i)  over VALID criteria only

Missing-data policy: a missing feature is never zero. Under
`common_feature_set` a criterion missing on any evaluated site is dropped for
all sites; under `per_site_exclusion` it is dropped per site and a warning is
attached. Fewer than two valid criteria => status insufficient_data.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from app.models import (
    ConstraintResult,
    CriteriaCompleteness,
    Eligibility,
    EnvironmentalProfile,
    FactorScore,
    HardConstraint,
    MissionProfile,
    Site,
    SuitabilityResult,
)

SPEC_PATH = Path(__file__).resolve().parents[1] / "config" / "scoring_spec.json"


@lru_cache
def load_spec() -> dict:
    spec = json.loads(SPEC_PATH.read_text())
    spec["_by_id"] = {c["criterion_id"]: c for c in spec["criteria"]}
    return spec


def default_mission() -> MissionProfile:
    spec = load_spec()
    return MissionProfile(
        mission_phase="landing",
        criteria=[{"criterion_id": c["criterion_id"], "weight": c["default_weight"]} for c in spec["criteria"]],
        hard_constraints=[HardConstraint(**h) for h in spec["default_hard_constraints"]],
        missing_data_policy=spec["missing_data_policy"]["default"],
    )


# --- suitability functions --------------------------------------------------
def piecewise_linear(x: float, direction: str, full: float, zero: float) -> float:
    """1 at/beyond `full` in the preferred direction, 0 at/beyond `zero`, linear between."""
    if direction == "lower_is_better":
        if x <= full:
            return 1.0
        if x >= zero:
            return 0.0
        return (zero - x) / (zero - full)
    if direction == "higher_is_better":
        if x >= full:
            return 1.0
        if x <= zero:
            return 0.0
        return (x - zero) / (full - zero)
    raise ValueError(f"unknown direction {direction}")


def suitability(criterion: dict, x: float) -> float:
    f = criterion["function"]
    if f["type"] == "piecewise_linear":
        return max(0.0, min(1.0, piecewise_linear(float(x), f["direction"], f["full"], f["zero"])))
    raise ValueError(f"unsupported function type {f['type']}")


# --- hard constraints -------------------------------------------------------
def check_constraint(hc: HardConstraint, value: float | None) -> ConstraintResult:
    passed: bool | None
    if value is None:
        passed = None
    else:
        v, t = float(value), hc.threshold
        passed = {"<=": v <= t, ">=": v >= t, "<": v < t, ">": v > t, "abs<=": abs(v) <= t}[hc.operator]
    return ConstraintResult(constraint_id=hc.constraint_id, feature_id=hc.feature_id, passed=passed, feature_value=None if value is None else float(value),
                            operator=hc.operator, threshold=hc.threshold, rationale=hc.rationale, is_assumption=hc.is_assumption)


def _numeric(profile: EnvironmentalProfile, feature_id: str) -> tuple[float | None, str | None]:
    m = profile.get(feature_id)
    if m is None or m.is_missing or not isinstance(m.value, (int, float)):
        return None, (m.unit if m else None)
    return float(m.value), m.unit


# --- evaluation ---------------------------------------------------------------
def valid_criteria(mission: MissionProfile, profiles: dict[str, EnvironmentalProfile]) -> tuple[list[str], dict[str, str]]:
    """Criteria usable under the mission's missing-data policy.
    Returns (criterion_ids kept, {criterion_id: reason dropped})."""
    spec = load_spec()
    kept, dropped = [], {}
    for c in mission.criteria:
        cs = spec["_by_id"].get(c.criterion_id)
        if cs is None:
            dropped[c.criterion_id] = "unknown criterion_id (not in scoring spec)"
            continue
        if c.weight <= 0:
            dropped[c.criterion_id] = "weight is 0"
            continue
        if mission.missing_data_policy == "common_feature_set":
            missing_on = [sid for sid, p in profiles.items() if _numeric(p, cs["feature_id"])[0] is None]
            if missing_on:
                dropped[c.criterion_id] = f"feature {cs['feature_id']} missing on {len(missing_on)}/{len(profiles)} sites; excluded for all under common_feature_set"
                continue
        kept.append(c.criterion_id)
    return kept, dropped


def evaluate_site(site: Site, profile: EnvironmentalProfile, mission: MissionProfile, kept: list[str], dropped: dict[str, str]) -> SuitabilityResult:
    spec = load_spec()
    weights = {c.criterion_id: c.weight for c in mission.criteria}
    factors: list[FactorScore] = []
    valid: list[tuple[float, float]] = []  # (weight, q)
    for c in mission.criteria:
        cs = spec["_by_id"].get(c.criterion_id)
        if cs is None:
            factors.append(FactorScore(criterion_id=c.criterion_id, label=c.criterion_id, feature_id="?", feature_value=None, unit=None, suitability=None,
                                       raw_weight=c.weight, normalized_weight=None, weighted_contribution=None, is_missing=True,
                                       excluded_reason=dropped.get(c.criterion_id), rationale="Unknown criterion"))
            continue
        x, unit = _numeric(profile, cs["feature_id"])
        excluded = dropped.get(c.criterion_id)
        if excluded is None and x is None:
            excluded = f"feature {cs['feature_id']} missing for this site"
        q = suitability(cs, x) if (x is not None and excluded is None) else None
        if q is not None:
            valid.append((c.weight, q))
        factors.append(FactorScore(criterion_id=c.criterion_id, label=cs["label"], feature_id=cs["feature_id"], feature_value=x, unit=unit or cs["unit"],
                                   suitability=q, raw_weight=c.weight, normalized_weight=None, weighted_contribution=None,
                                   is_missing=x is None, excluded_reason=excluded, rationale=cs["rationale"]))
    wsum = sum(w for w, _ in valid)
    score = None
    if len(valid) >= 2 and wsum > 0:
        score = 100.0 * sum(w * q for w, q in valid) / wsum
        for f in factors:
            if f.suitability is not None and f.excluded_reason is None:
                f.normalized_weight = f.raw_weight / wsum
                f.weighted_contribution = 100.0 * f.normalized_weight * f.suitability

    results = [check_constraint(hc, _numeric(profile, hc.feature_id)[0]) for hc in mission.hard_constraints]
    failed = [r for r in results if r.passed is False]
    uneval = [r for r in results if r.passed is None]
    eligible = not failed
    completeness = CriteriaCompleteness(criteria_requested=len(mission.criteria), criteria_supported=len(valid),
                                        fraction=(len(valid) / len(mission.criteria)) if mission.criteria else 0.0,
                                        excluded_criteria=[c for c in weights if c not in kept])
    status = "ineligible" if not eligible else ("ok" if score is not None else "insufficient_data")

    favorable = [f"{f.label}: {f.feature_value:g} {f.unit or ''} scores {f.suitability:.2f}" for f in factors if f.suitability is not None and f.suitability >= 0.75]
    risks = [f"{f.label}: {f.feature_value:g} {f.unit or ''} scores {f.suitability:.2f}" for f in factors if f.suitability is not None and f.suitability < 0.4]
    limitations = [f"Excluded criterion '{cid}': {why}" for cid, why in dropped.items()]
    limitations.append("Terrain metrics are regional (~3.7 km MOLA baseline) and cannot certify lander-scale safety.")
    if uneval:
        limitations.append("Unevaluated constraints (feature missing): " + ", ".join(r.constraint_id for r in uneval))
    if score is not None:
        limitations.append("Score is a relative decision-support index under documented threshold assumptions, not a probability.")
    return SuitabilityResult(site_id=site.id, site_name=site.name, status=status, score=None if score is None else round(score, 2), rank=None,
                             factor_scores=factors, eligibility=Eligibility(eligible=eligible, failed_constraints=failed, unevaluated_constraints=uneval),
                             completeness=completeness, favorable=favorable, risks=risks, limitations=limitations)


def evaluate(sites: list[Site], profiles: dict[str, EnvironmentalProfile], mission: MissionProfile) -> tuple[list[SuitabilityResult], list[str]]:
    """Evaluate every site under one mission. Ranking is applied by ranking_engine."""
    kept, dropped = valid_criteria(mission, profiles)
    warnings = [f"criterion '{k}' excluded: {v}" for k, v in dropped.items()]
    if mission.missing_data_policy == "per_site_exclusion":
        warnings.append("per_site_exclusion policy: scores may be built from different feature sets and are not strictly comparable")
    results = [evaluate_site(s, profiles[s.id], mission, kept, dropped) for s in sites]
    return results, warnings
