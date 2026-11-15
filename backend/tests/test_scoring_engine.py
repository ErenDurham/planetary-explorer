"""Suitability and ranking engine tests.

The first block is the original quick checks; the rest are the scientific
properties the brief requires: suitability monotonicity and knees for every
criterion in the spec, weight-scaling invariance and sensitivity, completeness
arithmetic, the hard-constraint operator table, ranking determinism on the
committed profiles, and the edge cases that would otherwise crash or
mis-serialise.
"""
import json
import math

import pytest

from app.models import EnvironmentalProfile, HardConstraint, MissionProfile, Site
from app.services import ranking_engine, scoring_engine
from app.services.data_loader import get_store
from app.services.scoring_engine import check_constraint, piecewise_linear, suitability
from tests.factories import make_site, mission

SPEC = scoring_engine.load_spec()
CRITERIA = SPEC["criteria"]
CRITERION_IDS = [c["criterion_id"] for c in CRITERIA]


# --- original quick checks ----------------------------------------------------
def test_piecewise_linear_bounds_and_direction():
    assert piecewise_linear(1.0, "lower_is_better", 2.0, 10.0) == 1.0
    assert piecewise_linear(10.0, "lower_is_better", 2.0, 10.0) == 0.0
    assert piecewise_linear(6.0, "lower_is_better", 2.0, 10.0) == pytest.approx(0.5)
    assert piecewise_linear(200.0, "higher_is_better", 185.0, 80.0) == 1.0
    assert piecewise_linear(132.5, "higher_is_better", 185.0, 80.0) == pytest.approx(0.5)


def _site(i, **fv):
    fp = {"shape": "square", "center_lat": 0, "center_lon_east": 0, "half_width_deg": 0.5, "crs": "IAU2000:49900"}
    site = Site(id=f"s{i}", planet="mars", name=f"S{i}", region="r", lat=0, lon_east=0, footprint=fp, description="d")
    ms = []
    for fid, v in fv.items():
        ms.append({"feature_id": fid, "label": fid, "category": "ground", "value": v, "unit": "x", "source_id": "t", "measurement_type": "measured",
                   "quality_flag": "missing" if v is None else "good", "is_missing": v is None})
    prof = EnvironmentalProfile(site_id=site.id, planet="mars", profile_version="t", generated_at="t", pipeline="t", measurements=ms, sources={},
                                completeness={"features_requested": len(ms), "features_available": sum(v is not None for v in fv.values()), "fraction": 1.0})
    return site, prof


def test_weight_normalisation_and_score_formula():
    s, p = _site(1, slope_regional_median_deg=6.0, elevation_median_m=-500.0)  # q = 0.5 and 0.5
    m = MissionProfile(criteria=[{"criterion_id": "terrain_safety", "weight": 30}, {"criterion_id": "elevation_suitability", "weight": 10}])
    res, _ = scoring_engine.evaluate([s], {s.id: p}, m)
    r = res[0]
    assert r.status == "ok" and r.score == pytest.approx(50.0)
    nw = {f.criterion_id: f.normalized_weight for f in r.factor_scores}
    assert nw["terrain_safety"] == pytest.approx(0.75) and nw["elevation_suitability"] == pytest.approx(0.25)


def test_common_feature_set_drops_criterion_for_all_sites():
    s1, p1 = _site(1, slope_regional_median_deg=1.0, elevation_median_m=-3000.0, roughness_regional_m=10.0)
    s2, p2 = _site(2, slope_regional_median_deg=1.0, elevation_median_m=-3000.0, roughness_regional_m=None)
    m = MissionProfile(criteria=[{"criterion_id": "terrain_safety", "weight": 1}, {"criterion_id": "elevation_suitability", "weight": 1}, {"criterion_id": "surface_roughness", "weight": 1}])
    res, warnings = scoring_engine.evaluate([s1, s2], {s1.id: p1, s2.id: p2}, m)
    assert all("surface_roughness" in r.completeness.excluded_criteria for r in res)
    assert res[0].score == res[1].score == pytest.approx(100.0)
    assert any("surface_roughness" in w for w in warnings)
    f = next(f for f in res[1].factor_scores if f.criterion_id == "surface_roughness")
    assert f.is_missing and f.suitability is None and f.feature_value is None
    # the site that HAS the value still does not get it scored (fair ranking)
    f1 = next(f for f in res[0].factor_scores if f.criterion_id == "surface_roughness")
    assert f1.suitability is None and f1.feature_value == 10.0 and f1.excluded_reason and "common_feature_set" in f1.excluded_reason


def test_insufficient_data_when_fewer_than_two_criteria():
    s, p = _site(1, slope_regional_median_deg=1.0)
    m = MissionProfile(criteria=[{"criterion_id": "terrain_safety", "weight": 1}, {"criterion_id": "thermal_conditions", "weight": 1}])
    res, _ = scoring_engine.evaluate([s], {s.id: p}, m)
    assert res[0].status == "insufficient_data" and res[0].score is None
    assert any("at least 2" in x for x in res[0].limitations)


def test_hard_constraint_makes_site_ineligible_despite_high_score():
    s, p = _site(1, slope_regional_median_deg=0.1, elevation_median_m=3000.0)
    m = MissionProfile(criteria=[{"criterion_id": "terrain_safety", "weight": 1}, {"criterion_id": "elevation_suitability", "weight": 1}],
                       hard_constraints=[HardConstraint(constraint_id="max_elevation", feature_id="elevation_median_m", operator="<=", threshold=2000, rationale="test")])
    res, _ = scoring_engine.evaluate([s], {s.id: p}, m)
    assert res[0].status == "ineligible" and not res[0].eligibility.eligible
    assert any("max_elevation" in r for r in res[0].risks)
    ranked = ranking_engine.rank(res)
    assert ranked[0].rank is None


def test_ranking_is_deterministic_and_orders_statuses():
    sa, pa = _site(1, slope_regional_median_deg=0.1, elevation_median_m=-3000.0)
    sb, pb = _site(2, slope_regional_median_deg=5.0, elevation_median_m=0.0)
    sc, pc = _site(3, slope_regional_median_deg=None, elevation_median_m=None)
    m = MissionProfile(criteria=[{"criterion_id": "terrain_safety", "weight": 1}, {"criterion_id": "elevation_suitability", "weight": 1}], missing_data_policy="per_site_exclusion")
    res, _ = scoring_engine.evaluate([sa, sb, sc], {sa.id: pa, sb.id: pb, sc.id: pc}, m)
    ranked = ranking_engine.rank(res)
    assert [r.site_id for r in ranked] == ["s1", "s2", "s3"] and ranked[2].status == "insufficient_data"


# --- (a) suitability functions: monotonicity and knees for EVERY criterion ----
@pytest.mark.parametrize("criterion", CRITERIA, ids=CRITERION_IDS)
def test_suitability_knees_and_monotonicity(criterion):
    f = criterion["function"]
    assert f["type"] == "piecewise_linear", "extend this test when a new function type is added to the spec"
    full, zero, direction = f["full"], f["zero"], f["direction"]
    assert full != zero
    assert (full < zero) if direction == "lower_is_better" else (full > zero), "knees must be ordered in the preferred direction"
    assert suitability(criterion, full) == 1.0
    assert suitability(criterion, zero) == 0.0
    assert suitability(criterion, (full + zero) / 2) == pytest.approx(0.5)
    span = abs(zero - full)
    lo, hi = min(full, zero) - 2 * span, max(full, zero) + 2 * span
    xs = [lo + (hi - lo) * k / 400 for k in range(401)]
    qs = [suitability(criterion, x) for x in xs]
    assert all(0.0 <= q <= 1.0 for q in qs)
    sign = -1 if direction == "lower_is_better" else 1
    assert all(sign * (b - a) >= -1e-12 for a, b in zip(qs, qs[1:])), "q must be monotone in the preferred direction"
    # saturation beyond the knees
    beyond_full = full - span if direction == "lower_is_better" else full + span
    beyond_zero = zero + span if direction == "lower_is_better" else zero - span
    assert suitability(criterion, beyond_full) == 1.0 and suitability(criterion, beyond_zero) == 0.0
    # linear in between: q(x) at quarter points
    q1 = suitability(criterion, full + (zero - full) * 0.25)
    assert q1 == pytest.approx(0.75)


def test_spec_knees_are_attainable_on_mars_for_solar_illumination():
    """The illumination knees must bracket the physical range of the latitude-only
    model so q = 1 is attainable; the earlier 185 W/m2 knee was above the equatorial
    maximum of ~178.6 W/m2 and no site could ever be fully suitable."""
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
    from geo import toa_annual_mean_insolation_wm2

    c = SPEC["_by_id"]["solar_illumination"]["function"]
    equator, pole = toa_annual_mean_insolation_wm2(0, "mars"), toa_annual_mean_insolation_wm2(90, "mars")
    assert c["full"] <= equator + 1e-6, "full knee must be reachable at the equator"
    assert c["full"] >= equator - 2.0, "full knee should sit at the equatorial value, not well below it"
    assert abs(c["zero"] - pole) < 1.0, "zero knee should sit at the polar value"


def test_unknown_function_type_is_rejected():
    with pytest.raises(ValueError):
        suitability({"function": {"type": "sigmoid"}}, 1.0)
    with pytest.raises(ValueError):
        piecewise_linear(1.0, "sideways", 0.0, 1.0)


# --- (b) weight scaling invariance and sensitivity ------------------------------
def _real():
    store = get_store()
    sites = store.sites("mars")
    return sites, {s.id: store.profile(s.id) for s in sites}


@pytest.mark.parametrize("k", [0.01, 0.5, 2.0, 2.5])
def test_score_invariant_under_weight_scaling(k):
    sites, profiles = _real()
    base = scoring_engine.default_mission()
    scaled = MissionProfile(criteria=[{"criterion_id": c.criterion_id, "weight": min(100.0, c.weight * k)} for c in base.criteria],
                            hard_constraints=base.hard_constraints, missing_data_policy=base.missing_data_policy)
    if any(c.weight * k > 100 for c in base.criteria):
        pytest.skip("weights above the 100 cap would not be a pure scaling")
    a, _ = scoring_engine.evaluate(sites, profiles, base)
    b, _ = scoring_engine.evaluate(sites, profiles, scaled)
    for ra, rb in zip(a, b):
        assert ra.site_id == rb.site_id and ra.status == rb.status
        assert ra.score == pytest.approx(rb.score, abs=1e-9)
        for fa, fb in zip(ra.factor_scores, rb.factor_scores):
            if fa.normalized_weight is not None:
                assert fa.normalized_weight == pytest.approx(fb.normalized_weight, abs=1e-12)


def test_raising_one_weight_moves_score_toward_that_factor():
    """For every scored factor of every real site: increase that criterion's weight
    and the score must move toward 100*q of that factor (strictly, unless q already
    equals the score)."""
    sites, profiles = _real()
    base = scoring_engine.default_mission()
    res, _ = scoring_engine.evaluate(sites, profiles, base)
    moved = 0
    for r in res:
        for f in r.factor_scores:
            if f.suitability is None:
                continue
            bumped = MissionProfile(criteria=[{"criterion_id": c.criterion_id, "weight": min(100.0, c.weight + 30) if c.criterion_id == f.criterion_id else c.weight} for c in base.criteria],
                                    hard_constraints=base.hard_constraints, missing_data_policy=base.missing_data_policy)
            r2 = next(x for x in scoring_engine.evaluate(sites, profiles, bumped)[0] if x.site_id == r.site_id)
            target = 100.0 * f.suitability
            if abs(target - r.score) < 1e-6:
                assert r2.score == pytest.approx(r.score, abs=1e-6)
            elif target > r.score:
                assert r.score < r2.score <= target + 1e-9
                moved += 1
            else:
                assert target - 1e-9 <= r2.score < r.score
                moved += 1
    assert moved > 0


def test_weight_zero_criterion_is_not_scored_and_not_counted_toward_two():
    s, p = make_site("a", {"slope_regional_median_deg": 1.0, "elevation_median_m": -4000.0, "roughness_regional_m": 10.0})
    m = mission({"terrain_safety": 50, "elevation_suitability": 0, "surface_roughness": 0})
    res, warnings = scoring_engine.evaluate([s], {s.id: p}, m)
    assert res[0].status == "insufficient_data"
    by = {f.criterion_id: f for f in res[0].factor_scores}
    assert by["elevation_suitability"].suitability is None and by["elevation_suitability"].excluded_reason == "weight is 0"
    assert by["elevation_suitability"].feature_value == -4000.0, "the value is still reported; only the weight is zero"


# --- (c) completeness arithmetic ---------------------------------------------------
def test_completeness_fraction_counts_only_positive_weight_criteria():
    s, p = make_site("a", {"slope_regional_median_deg": 1.0, "elevation_median_m": -4000.0, "roughness_regional_m": 10.0})
    # 3 requested, all scored
    res, _ = scoring_engine.evaluate([s], {s.id: p}, mission({"terrain_safety": 1, "elevation_suitability": 1, "surface_roughness": 1}))
    c = res[0].completeness
    assert (c.criteria_requested, c.criteria_supported, c.fraction, c.excluded_criteria) == (3, 3, 1.0, [])
    # a zero-weight slider is a choice, not a data gap: fraction stays 1.0
    res, _ = scoring_engine.evaluate([s], {s.id: p}, mission({"terrain_safety": 1, "elevation_suitability": 1, "surface_roughness": 0}))
    c = res[0].completeness
    assert (c.criteria_requested, c.criteria_supported, c.fraction, c.excluded_criteria) == (2, 2, 1.0, [])
    # a criterion whose feature is missing everywhere lowers it: 4 requested, 3 supported
    res, _ = scoring_engine.evaluate([s], {s.id: p}, mission({"terrain_safety": 1, "elevation_suitability": 1, "surface_roughness": 1, "thermal_conditions": 1}))
    c = res[0].completeness
    assert (c.criteria_requested, c.criteria_supported, c.excluded_criteria) == (4, 3, ["thermal_conditions"]) and c.fraction == pytest.approx(0.75)
    # an unknown criterion id counts as requested-but-unsupported
    res, _ = scoring_engine.evaluate([s], {s.id: p}, mission({"terrain_safety": 1, "elevation_suitability": 1, "made_up": 1}))
    c = res[0].completeness
    assert (c.criteria_requested, c.criteria_supported, c.excluded_criteria) == (3, 2, ["made_up"]) and c.fraction == pytest.approx(2 / 3)


def test_completeness_on_real_default_mission():
    sites, profiles = _real()
    res, _ = scoring_engine.evaluate(sites, profiles, scoring_engine.default_mission())
    for r in res:
        c = r.completeness
        assert c.criteria_requested == len(CRITERIA) and c.criteria_supported == c.criteria_requested - len(c.excluded_criteria)
        assert c.fraction == pytest.approx(c.criteria_supported / c.criteria_requested)
        assert "thermal_conditions" in c.excluded_criteria  # no Mars site carries surface temperature in v1


def test_per_site_exclusion_reports_the_gap_only_on_the_site_that_has_it():
    s1, p1 = make_site("full", {"slope_regional_median_deg": 1.0, "elevation_median_m": -4000.0, "roughness_regional_m": 10.0})
    s2, p2 = make_site("gappy", {"slope_regional_median_deg": 1.0, "elevation_median_m": -4000.0, "roughness_regional_m": None})
    m = mission({"terrain_safety": 1, "elevation_suitability": 1, "surface_roughness": 1}, policy="per_site_exclusion")
    res, warnings = scoring_engine.evaluate([s1, s2], {s1.id: p1, s2.id: p2}, m)
    r1, r2 = res
    assert r1.completeness.excluded_criteria == [] and r1.completeness.fraction == 1.0
    assert r2.completeness.excluded_criteria == ["surface_roughness"] and r2.completeness.fraction == pytest.approx(2 / 3)
    assert r1.status == r2.status == "ok"
    assert any("gappy" in w and "surface_roughness" in w for w in warnings)
    assert any("per_site_exclusion" in x and "surface_roughness" in x for x in r2.limitations)
    assert not any("surface_roughness" in x for x in r1.limitations)


# --- (e) hard constraint operator table -----------------------------------------------
@pytest.mark.parametrize("op,value,threshold,expected", [
    ("<=", 1.0, 2.0, True), ("<=", 2.0, 2.0, True), ("<=", 2.1, 2.0, False),
    (">=", 3.0, 2.0, True), (">=", 2.0, 2.0, True), (">=", 1.9, 2.0, False),
    ("<", 1.0, 2.0, True), ("<", 2.0, 2.0, False), ("<", 3.0, 2.0, False),
    (">", 3.0, 2.0, True), (">", 2.0, 2.0, False), (">", 1.0, 2.0, False),
    ("abs<=", -1.5, 2.0, True), ("abs<=", 2.0, 2.0, True), ("abs<=", -2.0, 2.0, True), ("abs<=", -2.5, 2.0, False), ("abs<=", 2.5, 2.0, False),
])
def test_hard_constraint_operator_table(op, value, threshold, expected):
    hc = HardConstraint(constraint_id="t", feature_id="f", operator=op, threshold=threshold, rationale="test")
    r = check_constraint(hc, value)
    assert r.passed is expected and r.feature_value == value and r.operator == op


@pytest.mark.parametrize("value", [None, float("nan"), float("inf"), -float("inf")])
def test_hard_constraint_with_missing_or_nonfinite_value_is_unevaluated_not_failed(value):
    hc = HardConstraint(constraint_id="t", feature_id="f", operator="<=", threshold=1.0, rationale="test")
    r = check_constraint(hc, value)
    assert r.passed is None and r.feature_value is None


def test_unevaluated_constraint_is_reported_and_site_stays_eligible():
    s, p = make_site("a", {"slope_regional_median_deg": 1.0, "elevation_median_m": -4000.0, "latitude_abs_deg": None})
    hc = HardConstraint(constraint_id="latitude_band", feature_id="latitude_abs_deg", operator="<=", threshold=50, rationale="test")
    res, _ = scoring_engine.evaluate([s], {s.id: p}, mission({"terrain_safety": 1, "elevation_suitability": 1}, hard_constraints=[hc]))
    r = res[0]
    assert r.status == "ok" and r.eligibility.eligible
    assert [c.constraint_id for c in r.eligibility.unevaluated_constraints] == ["latitude_band"] and r.eligibility.failed_constraints == []
    assert any("latitude_band" in x and "Unevaluated" in x for x in r.limitations)


def test_ineligible_site_still_carries_its_score_and_factors():
    s, p = make_site("a", {"slope_regional_median_deg": 1.0, "elevation_median_m": 3000.0})
    hc = HardConstraint(constraint_id="max_elevation", feature_id="elevation_median_m", operator="<=", threshold=2000, rationale="test")
    res, _ = scoring_engine.evaluate([s], {s.id: p}, mission({"terrain_safety": 1, "elevation_suitability": 1}, hard_constraints=[hc]))
    r = res[0]
    assert r.status == "ineligible" and r.score is not None and r.eligibility.failed_constraints[0].passed is False
    assert r.eligibility.failed_constraints[0].feature_value == 3000.0


# --- (d) ranking consistency on the committed profiles -------------------------------
def test_default_ranking_on_committed_profiles_is_a_stable_permutation():
    sites, profiles = _real()
    ids = sorted(s.id for s in sites)
    assert len(ids) == 17
    runs = []
    for _ in range(2):
        res, warnings = scoring_engine.evaluate(sites, profiles, scoring_engine.default_mission())
        ranked = ranking_engine.rank(res)
        runs.append([(r.site_id, r.rank, r.score) for r in ranked])
    assert runs[0] == runs[1], "ranking must be identical across runs"
    order = [sid for sid, _, _ in runs[0]]
    assert sorted(order) == ids, "every site appears exactly once"
    ok = [r for r in runs[0] if r[1] is not None]
    assert [r[1] for r in ok] == list(range(1, len(ok) + 1))
    scores = [r[2] for r in ok]
    assert scores == sorted(scores, reverse=True) and all(0 <= s <= 100 for s in scores)
    # the two polar caps fail the default latitude band, and Noctis (6.4 km high) the elevation ceiling
    assert len(ok) == 14 and {r[0] for r in runs[0] if r[1] is None} == {"planum_boreum", "planum_australe", "noctis_labyrinthus"}


def test_default_ranking_is_scientifically_sensible():
    """Smooth northern plains should score high; Columbus (rugged southern highlands)
    lowest among eligible sites; Noctis, whose footprint spans the trough maze
    (detrended relief > 1 km), scores zero on roughness."""
    sites, profiles = _real()
    res, _ = scoring_engine.evaluate(sites, profiles, scoring_engine.default_mission())
    ranked = [r.site_id for r in ranking_engine.rank(res) if r.rank is not None]
    assert ranked[-1] == "columbus_crater"
    assert set(ranked[:5]) >= {"chryse_planitia", "elysium_planitia", "hebrus_valles", "utopia_planitia"}
    noctis = next(r for r in res if r.site_id == "noctis_labyrinthus")
    rough = next(f for f in noctis.factor_scores if f.criterion_id == "surface_roughness")
    assert rough.suitability == 0.0 and any("roughness" in x.lower() for x in noctis.risks)


def test_rank_breaks_ties_by_site_id_and_ranks_only_ok_rows():
    s1, p1 = make_site("zeta", {"slope_regional_median_deg": 1.0, "elevation_median_m": -4000.0})
    s2, p2 = make_site("alpha", {"slope_regional_median_deg": 1.0, "elevation_median_m": -4000.0})
    s3, p3 = make_site("mid", {"slope_regional_median_deg": 1.0, "elevation_median_m": 5000.0})  # fails the constraint
    s4, p4 = make_site("empty", {"slope_regional_median_deg": None, "elevation_median_m": None})
    hc = HardConstraint(constraint_id="max_elevation", feature_id="elevation_median_m", operator="<=", threshold=2000, rationale="test")
    m = mission({"terrain_safety": 1, "elevation_suitability": 1}, policy="per_site_exclusion", hard_constraints=[hc])
    res, _ = scoring_engine.evaluate([s1, s2, s3, s4], {s.id: p for s, p in ((s1, p1), (s2, p2), (s3, p3), (s4, p4))}, m)
    ranked = ranking_engine.rank(res)
    assert [r.site_id for r in ranked] == ["alpha", "zeta", "empty", "mid"]
    assert [r.rank for r in ranked] == [1, 2, None, None]
    assert [r.status for r in ranked] == ["ok", "ok", "insufficient_data", "ineligible"]


# --- edge cases -----------------------------------------------------------------------
def test_unknown_criterion_id_is_reported_not_scored():
    s, p = make_site("a", {"slope_regional_median_deg": 1.0, "elevation_median_m": -4000.0})
    res, warnings = scoring_engine.evaluate([s], {s.id: p}, mission({"terrain_safety": 1, "elevation_suitability": 1, "bogus": 50}))
    r = res[0]
    assert r.status == "ok" and r.score == pytest.approx(100.0)
    f = next(f for f in r.factor_scores if f.criterion_id == "bogus")
    assert f.suitability is None and f.normalized_weight is None and f.is_missing and "not in scoring spec" in f.excluded_reason
    assert "bogus" in f.rationale
    assert any("bogus" in w for w in warnings)


def test_all_sites_ineligible_yields_no_ranks():
    s1, p1 = make_site("a", {"slope_regional_median_deg": 1.0, "elevation_median_m": 3000.0})
    s2, p2 = make_site("b", {"slope_regional_median_deg": 1.0, "elevation_median_m": 4000.0})
    hc = HardConstraint(constraint_id="max_elevation", feature_id="elevation_median_m", operator="<=", threshold=2000, rationale="test")
    res, _ = scoring_engine.evaluate([s1, s2], {"a": p1, "b": p2}, mission({"terrain_safety": 1, "elevation_suitability": 1}, hard_constraints=[hc]))
    ranked = ranking_engine.rank(res)
    assert all(r.status == "ineligible" and r.rank is None for r in ranked)
    assert [r.site_id for r in ranked] == ["a", "b"], "ineligible rows still sort by score then id"


def test_empty_site_list():
    res, warnings = scoring_engine.evaluate([], {}, scoring_engine.default_mission())
    assert res == [] and ranking_engine.rank(res) == []
    assert isinstance(warnings, list)


def test_all_weights_lost_to_exclusion_gives_insufficient_data():
    s, p = make_site("a", {"slope_regional_median_deg": 1.0, "elevation_median_m": -4000.0})
    res, warnings = scoring_engine.evaluate([s], {s.id: p}, mission({"thermal_conditions": 50, "terrain_safety": 50, "elevation_suitability": 0}))
    assert res[0].status == "insufficient_data" and res[0].score is None
    for f in res[0].factor_scores:
        assert f.normalized_weight is None and f.weighted_contribution is None


def test_site_without_profile_is_insufficient_data_and_does_not_poison_others():
    s1, p1 = make_site("a", {"slope_regional_median_deg": 1.0, "elevation_median_m": -4000.0})
    s2, _ = make_site("b", {})
    res, warnings = scoring_engine.evaluate([s1, s2], {"a": p1}, mission({"terrain_safety": 1, "elevation_suitability": 1}))
    by = {r.site_id: r for r in res}
    assert by["a"].status == "ok" and by["a"].score == pytest.approx(100.0)
    assert by["b"].status == "insufficient_data" and all(f.is_missing for f in by["b"].factor_scores)
    assert any("'b'" in w and "no environmental profile" in w for w in warnings)


def test_extra_profiles_not_in_site_list_do_not_affect_common_feature_set():
    s1, p1 = make_site("a", {"slope_regional_median_deg": 1.0, "elevation_median_m": -4000.0})
    _, p_other = make_site("other", {"slope_regional_median_deg": None, "elevation_median_m": None})
    res, warnings = scoring_engine.evaluate([s1], {"a": p1, "other": p_other}, mission({"terrain_safety": 1, "elevation_suitability": 1}))
    assert res[0].status == "ok" and res[0].completeness.excluded_criteria == [] and warnings == []


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), -float("inf"), True])
def test_nonfinite_or_boolean_values_are_treated_as_missing(bad):
    s, p = make_site("a", {"slope_regional_median_deg": 1.0, "elevation_median_m": -4000.0, "roughness_regional_m": 10.0})
    p.get("roughness_regional_m").value = bad
    hc = HardConstraint(constraint_id="rough", feature_id="roughness_regional_m", operator="<=", threshold=100, rationale="test")
    res, _ = scoring_engine.evaluate([s], {s.id: p}, mission({"terrain_safety": 1, "elevation_suitability": 1, "surface_roughness": 1}, hard_constraints=[hc]))
    r = res[0]
    f = next(f for f in r.factor_scores if f.criterion_id == "surface_roughness")
    assert f.is_missing and f.suitability is None and f.feature_value is None
    assert r.eligibility.eligible and [c.constraint_id for c in r.eligibility.unevaluated_constraints] == ["rough"]
    json.dumps(r.model_dump(), allow_nan=False)  # must be strictly JSON-serialisable


def test_results_are_strict_json_on_real_data():
    sites, profiles = _real()
    res, _ = scoring_engine.evaluate(sites, profiles, scoring_engine.default_mission())
    for r in ranking_engine.rank(res):
        text = json.dumps(r.model_dump(), allow_nan=False)
        assert "NaN" not in text and "Infinity" not in text


def test_score_is_clamped_to_0_100_under_float_noise():
    s, p = make_site("a", {"slope_regional_median_deg": 0.0, "elevation_median_m": -5000.0, "roughness_regional_m": 0.0})
    res, _ = scoring_engine.evaluate([s], {s.id: p}, mission({"terrain_safety": 0.1, "elevation_suitability": 0.2, "surface_roughness": 0.7}))
    assert res[0].score == 100.0
    assert math.isclose(sum(f.weighted_contribution for f in res[0].factor_scores), 100.0, abs_tol=1e-9)


def test_default_mission_matches_spec():
    m = scoring_engine.default_mission()
    assert [c.criterion_id for c in m.criteria] == CRITERION_IDS
    assert [c.weight for c in m.criteria] == [c["default_weight"] for c in CRITERIA]
    assert [h.constraint_id for h in m.hard_constraints] == [h["constraint_id"] for h in SPEC["default_hard_constraints"]]
    assert m.missing_data_policy == SPEC["missing_data_policy"]["default"]
    assert SPEC["version"].startswith("landing-")
    for c in CRITERIA:
        assert c["rationale"] and c["label"] and c["feature_id"] and c["unit"]


# --- explainability strings -----------------------------------------------------------
def test_favorable_and_risk_lines_read_well():
    s, p = make_site("a", {"slope_regional_median_deg": 0.16, "elevation_median_m": -3624.0, "roughness_regional_m": 290.0})
    res, _ = scoring_engine.evaluate([s], {s.id: p}, mission({"terrain_safety": 1, "elevation_suitability": 1, "surface_roughness": 1}))
    r = res[0]
    assert r.favorable[0] == "Terrain safety 0.16 deg (median over ~59 km footprint) - fully suitable (1.00)"
    assert r.favorable[1] == "Elevation suitability -3,624 m (median over ~59 km footprint) - fully suitable (1.00)"
    assert len(r.risks) == 1 and r.risks[0].startswith("Surface roughness 290 m (~59 km footprint) - poor (0.04)")
    by = {f.criterion_id: f for f in r.factor_scores}
    assert by["terrain_safety"].rationale.startswith("0.16 deg is at or below the 2.00 deg fully-suitable knee, so q = 1.00.")
    assert by["surface_roughness"].rationale.startswith("290 m lies between the knees (20 m -> 1.0, 300 m -> 0.0), so q = 0.04")
    assert SPEC["_by_id"]["terrain_safety"]["rationale"] in by["terrain_safety"].rationale, "the spec's documented assumption is kept"


def test_missing_factor_rationale_says_weight_is_renormalised():
    s, p = make_site("a", {"slope_regional_median_deg": 1.0, "elevation_median_m": -4000.0})
    res, _ = scoring_engine.evaluate([s], {s.id: p}, mission({"terrain_safety": 1, "elevation_suitability": 1, "thermal_conditions": 1}))
    f = next(f for f in res[0].factor_scores if f.criterion_id == "thermal_conditions")
    assert "renormalised" in f.rationale and "not scored" in f.rationale
    assert f.is_missing and f.feature_value is None and f.excluded_reason
