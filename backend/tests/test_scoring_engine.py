import pytest

from app.models import EnvironmentalProfile, HardConstraint, MissionProfile, Site
from app.services import ranking_engine, scoring_engine
from app.services.scoring_engine import piecewise_linear


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
    mission = MissionProfile(criteria=[{"criterion_id": "terrain_safety", "weight": 30}, {"criterion_id": "elevation_suitability", "weight": 10}])
    res, _ = scoring_engine.evaluate([s], {s.id: p}, mission)
    r = res[0]
    assert r.status == "ok" and r.score == pytest.approx(50.0)
    nw = {f.criterion_id: f.normalized_weight for f in r.factor_scores}
    assert nw["terrain_safety"] == pytest.approx(0.75) and nw["elevation_suitability"] == pytest.approx(0.25)


def test_common_feature_set_drops_criterion_for_all_sites():
    s1, p1 = _site(1, slope_regional_median_deg=1.0, elevation_median_m=-3000.0, roughness_regional_m=10.0)
    s2, p2 = _site(2, slope_regional_median_deg=1.0, elevation_median_m=-3000.0, roughness_regional_m=None)
    mission = MissionProfile(criteria=[{"criterion_id": "terrain_safety", "weight": 1}, {"criterion_id": "elevation_suitability", "weight": 1}, {"criterion_id": "surface_roughness", "weight": 1}])
    res, warnings = scoring_engine.evaluate([s1, s2], {s1.id: p1, s2.id: p2}, mission)
    assert all("surface_roughness" in r.completeness.excluded_criteria for r in res)
    assert res[0].score == res[1].score == pytest.approx(100.0)
    assert any("surface_roughness" in w for w in warnings)
    # missing value is reported as missing, never scored as zero
    f = next(f for f in res[1].factor_scores if f.criterion_id == "surface_roughness")
    assert f.is_missing and f.suitability is None and f.feature_value is None


def test_insufficient_data_when_fewer_than_two_criteria():
    s, p = _site(1, slope_regional_median_deg=1.0)
    mission = MissionProfile(criteria=[{"criterion_id": "terrain_safety", "weight": 1}, {"criterion_id": "thermal_conditions", "weight": 1}])
    res, _ = scoring_engine.evaluate([s], {s.id: p}, mission)
    assert res[0].status == "insufficient_data" and res[0].score is None


def test_hard_constraint_makes_site_ineligible_despite_high_score():
    s, p = _site(1, slope_regional_median_deg=0.1, elevation_median_m=3000.0)
    mission = MissionProfile(criteria=[{"criterion_id": "terrain_safety", "weight": 1}, {"criterion_id": "elevation_suitability", "weight": 1}],
                             hard_constraints=[HardConstraint(constraint_id="max_elevation", feature_id="elevation_median_m", operator="<=", threshold=2000, rationale="test")])
    res, _ = scoring_engine.evaluate([s], {s.id: p}, mission)
    assert res[0].status == "ineligible" and not res[0].eligibility.eligible
    ranked = ranking_engine.rank(res)
    assert ranked[0].rank is None


def test_ranking_is_deterministic_and_orders_statuses():
    sa, pa = _site(1, slope_regional_median_deg=0.1, elevation_median_m=-3000.0)
    sb, pb = _site(2, slope_regional_median_deg=5.0, elevation_median_m=0.0)
    sc, pc = _site(3, slope_regional_median_deg=None, elevation_median_m=None)
    mission = MissionProfile(criteria=[{"criterion_id": "terrain_safety", "weight": 1}, {"criterion_id": "elevation_suitability", "weight": 1}], missing_data_policy="per_site_exclusion")
    res, _ = scoring_engine.evaluate([sa, sb, sc], {sa.id: pa, sb.id: pb, sc.id: pc}, mission)
    ranked = ranking_engine.rank(res)
    assert [r.site_id for r in ranked] == ["s1", "s2", "s3"] and ranked[2].status == "insufficient_data"
