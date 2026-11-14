"""Landing suitability engine (Mission Phase 1).

Owner: Engineer 3. Pure functions over Pydantic models and the scoring spec;
no I/O, no randomness, no LLM. Formulas (docs/SCIENTIFIC_METHOD.md):

    q(s,i)    = f_i(x(s,i))                      suitability in [0,1]
    Score(s)  = 100 * sum(w_i q(s,i)) / sum(w_i)  over VALID criteria only

A criterion is VALID for a site when it is in the spec, carries a positive
weight, and the site has a finite numeric value for its feature (and, under
`common_feature_set`, so does every other evaluated site).

Missing-data policy: a missing feature is never zero. Under
`common_feature_set` a criterion missing on any evaluated site is dropped for
all sites; under `per_site_exclusion` it is dropped per site and a warning is
attached. Fewer than two valid criteria => status insufficient_data.

Completeness counts only criteria the user actually asked for (weight > 0): a
slider set to zero is a choice, not a data gap, so it never lowers the
completeness fraction.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

from app.models import (
    ConstraintResult,
    CriteriaCompleteness,
    Eligibility,
    EnvironmentalMeasurement,
    EnvironmentalProfile,
    FactorScore,
    HardConstraint,
    MissionProfile,
    Site,
    SuitabilityResult,
)

SPEC_PATH = Path(__file__).resolve().parents[1] / "config" / "scoring_spec.json"

# Thresholds for the human-readable favorable / risk lists. They only shape
# wording; the score itself never looks at them.
FAVORABLE_MIN_Q = 0.75
RISK_MAX_Q = 0.4


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
_OPS = {
    "<=": lambda v, t: v <= t,
    ">=": lambda v, t: v >= t,
    "<": lambda v, t: v < t,
    ">": lambda v, t: v > t,
    "abs<=": lambda v, t: abs(v) <= t,
}


def check_constraint(hc: HardConstraint, value: float | None) -> ConstraintResult:
    """`passed` is None (unevaluated, not failed) when the feature is missing or not a finite number."""
    passed: bool | None
    if value is None or not _is_finite_number(value):
        passed, value = None, None
    else:
        passed = _OPS[hc.operator](float(value), hc.threshold)
    return ConstraintResult(constraint_id=hc.constraint_id, feature_id=hc.feature_id, passed=passed,
                            feature_value=None if value is None else float(value),
                            operator=hc.operator, threshold=hc.threshold, rationale=hc.rationale, is_assumption=hc.is_assumption)


# --- feature access -----------------------------------------------------------
def _is_finite_number(v) -> bool:
    """True for a real, finite int/float. bool is excluded (it is an int
    subclass) and NaN/inf are excluded because they cannot be scored or
    serialised to JSON."""
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _numeric(profile: EnvironmentalProfile | None, feature_id: str) -> tuple[float | None, str | None]:
    if profile is None:
        return None, None
    m = profile.get(feature_id)
    if m is None or m.is_missing or not _is_finite_number(m.value):
        return None, (m.unit if m else None)
    return float(m.value), m.unit


# --- wording ------------------------------------------------------------------
def format_value(x: float | None, unit: str | None) -> str:
    """Unit-aware number formatting for the strings a judge reads."""
    if x is None:
        return "no value"
    u = (unit or "").strip()
    if u == "m":
        s = f"{x:,.0f}"
    elif u == "deg":
        s = f"{x:.2f}"
    elif u in ("W/m2", "Pa"):
        s = f"{x:.0f}"
    elif u == "degC":
        s = f"{x:.1f}"
    elif u == "mm/day":
        s = f"{x:.2f}"
    else:
        s = f"{x:g}"
    return f"{s} {u}".strip()


def suitability_word(q: float) -> str:
    if q >= 0.99:
        return "fully suitable"
    if q >= FAVORABLE_MIN_Q:
        return "suitable"
    if q >= RISK_MAX_Q:
        return "marginal"
    if q > 0.0:
        return "poor"
    return "unsuitable"


def _measurement_context(m: EnvironmentalMeasurement | None) -> str:
    """Where the number comes from, for the favorable/risk line: a footprint
    statistic names its footprint width, a latitude-only model says so."""
    if m is None:
        return ""
    res = (m.spatial_resolution or "").lower()
    lab = (m.label or "").lower()
    stat = "median" if "median" in lab else ("90th percentile" if "90th" in lab else None)
    if "latitude" in res:
        return "latitude-only model"
    fp = m.geographic_footprint
    if fp is not None and fp.approx_width_km:
        where = f"~{fp.approx_width_km:.0f} km footprint"
        return f"{stat} over {where}" if stat else where
    return m.spatial_resolution or ""


def _knee_sentence(cs: dict, x: float, q: float, unit: str | None) -> str:
    """One sentence saying where this value sits against the spec's knees."""
    f = cs["function"]
    full, zero, direction = f["full"], f["zero"], f["direction"]
    xs, fs, zs = format_value(x, unit), format_value(full, unit), format_value(zero, unit)
    better = "at or below" if direction == "lower_is_better" else "at or above"
    worse = "at or above" if direction == "lower_is_better" else "at or below"
    if q >= 1.0:
        return f"{xs} is {better} the {fs} fully-suitable knee, so q = 1.00."
    if q <= 0.0:
        return f"{xs} is {worse} the {zs} cut-off, so q = 0.00."
    return f"{xs} lies between the knees ({fs} -> 1.0, {zs} -> 0.0), so q = {q:.2f} by linear interpolation."


def _factor_line(f: FactorScore, m: EnvironmentalMeasurement | None) -> str:
    """e.g. 'Regional slope 0.16 deg (median over ~59 km footprint) - fully suitable (1.00)'."""
    ctx = _measurement_context(m)
    short = f.label.split(" (")[0]
    core = f"{short} {format_value(f.feature_value, f.unit)}"
    if ctx:
        core += f" ({ctx})"
    q = f.suitability or 0.0
    return f"{core} - {suitability_word(q)} ({q:.2f})"


# --- evaluation ---------------------------------------------------------------
def valid_criteria(mission: MissionProfile, profiles: dict[str, EnvironmentalProfile]) -> tuple[list[str], dict[str, str]]:
    """Criteria usable under the mission's missing-data policy.
    Returns (criterion_ids kept, {criterion_id: reason dropped}). `profiles`
    must hold exactly the evaluated sites (the caller restricts it)."""
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
            missing_on = sorted(sid for sid, p in profiles.items() if _numeric(p, cs["feature_id"])[0] is None)
            if missing_on:
                shown = ", ".join(missing_on[:4]) + (", ..." if len(missing_on) > 4 else "")
                dropped[c.criterion_id] = (f"feature {cs['feature_id']} missing on {len(missing_on)}/{len(profiles)} sites ({shown});"
                                          " excluded for all under common_feature_set")
                continue
        kept.append(c.criterion_id)
    return kept, dropped


def evaluate_site(site: Site, profile: EnvironmentalProfile | None, mission: MissionProfile, kept: list[str], dropped: dict[str, str]) -> SuitabilityResult:
    spec = load_spec()
    factors: list[FactorScore] = []
    valid: list[tuple[float, float]] = []  # (weight, q)
    requested = [c for c in mission.criteria if c.weight > 0]
    per_site_excluded: list[str] = []
    for c in mission.criteria:
        cs = spec["_by_id"].get(c.criterion_id)
        if cs is None:
            factors.append(FactorScore(criterion_id=c.criterion_id, label=c.criterion_id, feature_id="?", feature_value=None, unit=None, suitability=None,
                                       raw_weight=c.weight, normalized_weight=None, weighted_contribution=None, is_missing=True,
                                       excluded_reason=dropped.get(c.criterion_id),
                                       rationale=f"'{c.criterion_id}' is not a criterion of scoring spec {spec['version']}; it carries no weight in the score."))
            continue
        x, unit = _numeric(profile, cs["feature_id"])
        unit = unit or cs["unit"]
        excluded = dropped.get(c.criterion_id)
        if excluded is None and x is None:
            excluded = f"feature {cs['feature_id']} missing for this site"
            per_site_excluded.append(c.criterion_id)
        q = suitability(cs, x) if (x is not None and excluded is None) else None
        if q is not None:
            valid.append((c.weight, q))
            rationale = f"{_knee_sentence(cs, x, q, unit)} {cs['rationale']}"
        elif x is None:
            rationale = (f"No finite value for {cs['feature_id']} in this profile, so the criterion is not scored; "
                         f"its weight is renormalised over the remaining criteria rather than counted as zero. {cs['rationale']}")
        else:
            rationale = f"Not scored ({excluded}). {cs['rationale']}"
        factors.append(FactorScore(criterion_id=c.criterion_id, label=cs["label"], feature_id=cs["feature_id"], feature_value=x, unit=unit,
                                   suitability=q, raw_weight=c.weight, normalized_weight=None, weighted_contribution=None,
                                   is_missing=x is None, excluded_reason=excluded, rationale=rationale))

    wsum = sum(w for w, _ in valid)
    score = None
    if len(valid) >= 2 and wsum > 0:
        score = min(100.0, max(0.0, 100.0 * sum(w * q for w, q in valid) / wsum))
        for f in factors:
            if f.suitability is not None and f.excluded_reason is None:
                f.normalized_weight = f.raw_weight / wsum
                f.weighted_contribution = 100.0 * f.normalized_weight * f.suitability

    results = [check_constraint(hc, _numeric(profile, hc.feature_id)[0]) for hc in mission.hard_constraints]
    failed = [r for r in results if r.passed is False]
    uneval = [r for r in results if r.passed is None]
    eligible = not failed
    scored = [f for f in factors if f.suitability is not None and f.excluded_reason is None]
    scored_ids = {f.criterion_id for f in scored}
    completeness = CriteriaCompleteness(criteria_requested=len(requested), criteria_supported=len(valid),
                                        fraction=(len(valid) / len(requested)) if requested else 0.0,
                                        excluded_criteria=[c.criterion_id for c in requested if c.criterion_id not in scored_ids])
    status = "ineligible" if not eligible else ("ok" if score is not None else "insufficient_data")

    def meas(f: FactorScore) -> EnvironmentalMeasurement | None:
        return profile.get(f.feature_id) if profile is not None else None

    favorable = [_factor_line(f, meas(f)) for f in scored if f.suitability >= FAVORABLE_MIN_Q]
    risks = [_factor_line(f, meas(f)) for f in scored if f.suitability < RISK_MAX_Q]
    for r in failed:
        risks.append(f"Fails hard constraint '{r.constraint_id}': {r.feature_id} = {r.feature_value:g} violates {r.operator} {r.threshold:g}"
                     f"{' (documented assumption)' if r.is_assumption else ''}; the site is ineligible whatever its score.")

    limitations = [f"Excluded criterion '{cid}': {why}" for cid, why in dropped.items()]
    limitations += [f"Excluded criterion '{cid}' for this site: feature {spec['_by_id'][cid]['feature_id']} missing (per_site_exclusion); "
                    "its score rests on fewer criteria than other sites may use" for cid in per_site_excluded]
    if profile is None:
        limitations.append("No environmental profile is available for this site in the served profile version; nothing could be scored.")
    limitations.append("Terrain metrics are regional (~3.7 km MOLA baseline) and cannot certify lander-scale safety.")
    if uneval:
        limitations.append("Unevaluated constraints (feature missing, treated as neither passed nor failed): " + ", ".join(r.constraint_id for r in uneval))
    if score is not None:
        limitations.append("Score is a relative decision-support index under documented threshold assumptions, not a probability.")
    elif status == "insufficient_data":
        limitations.append(f"Only {len(valid)} criterion/criteria could be scored; at least 2 are required for a comparable score.")
    return SuitabilityResult(site_id=site.id, site_name=site.name, status=status, score=None if score is None else round(score, 2), rank=None,
                             factor_scores=factors, eligibility=Eligibility(eligible=eligible, failed_constraints=failed, unevaluated_constraints=uneval),
                             completeness=completeness, favorable=favorable, risks=risks, limitations=limitations)


def evaluate(sites: list[Site], profiles: dict[str, EnvironmentalProfile], mission: MissionProfile) -> tuple[list[SuitabilityResult], list[str]]:
    """Evaluate every site under one mission. Ranking is applied by ranking_engine.

    `profiles` may hold more sites than `sites`; only the evaluated sites take
    part in the common-feature-set scan. A site with no profile is reported as
    insufficient_data with a warning and does not drag the others down."""
    warnings: list[str] = []
    evaluated = {s.id: profiles.get(s.id) for s in sites}
    for sid in sorted(sid for sid, p in evaluated.items() if p is None):
        warnings.append(f"site '{sid}' has no environmental profile; reported as insufficient_data")
    kept, dropped = valid_criteria(mission, {sid: p for sid, p in evaluated.items() if p is not None})
    warnings += [f"criterion '{k}' excluded: {v}" for k, v in dropped.items()]
    if mission.missing_data_policy == "per_site_exclusion":
        warnings.append("per_site_exclusion policy: scores may be built from different feature sets and are not strictly comparable")
    results = [evaluate_site(s, evaluated[s.id], mission, kept, dropped) for s in sites]
    if mission.missing_data_policy == "per_site_exclusion":
        for r in results:
            per_site = [f.criterion_id for f in r.factor_scores if (f.excluded_reason or "").endswith("missing for this site")]
            if per_site:
                warnings.append(f"site '{r.site_id}': criteria excluded for missing features: {', '.join(per_site)}")
    return results, warnings
