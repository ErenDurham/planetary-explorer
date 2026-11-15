"""Weight-sensitivity sweep: redistribution arithmetic, scenario normalisation,
breakpoints, too-few-criteria, ineligible/insufficient-data focus sites, and
the decomposition identities the Analyze view relies on (contributions sum to
the score; per-factor comparator deltas sum to the gap; saturation at q = 1).
Synthetic sites only; no network, no model."""
from __future__ import annotations

import math

import pytest

from app.models import HardConstraint, SensitivityRequest
from app.services import ranking_engine, scoring_engine, sensitivity_engine
from app.services.sensitivity_engine import base_shares, deltas, scenario_weights, sweep
from tests.factories import make_site, mission

FULL = {"slope_regional_median_deg": 0.5, "elevation_median_m": -3500.0, "roughness_regional_m": 10.0, "insolation_toa_annual_mean_wm2": 178.5}
W = {"terrain_safety": 65, "elevation_suitability": 45, "surface_roughness": 55, "thermal_conditions": 0, "solar_illumination": 75}


def _three_sites():
    a = make_site("alpha", {**FULL, "surface_temperature_mean_c": None}, lat=10.0)                      # saturates everything
    b = make_site("bravo", {**FULL, "elevation_median_m": -500.0, "surface_temperature_mean_c": None}, lat=20.0)  # elevation q = 0.5
    c = make_site("charlie", {**FULL, "insolation_toa_annual_mean_wm2": 129.0, "surface_temperature_mean_c": None}, lat=40.0)  # solar q = 0.5
    sites = [a[0], b[0], c[0]]
    profiles = {a[0].id: a[1], b[0].id: b[1], c[0].id: c[1]}
    return sites, profiles


# --- redistribution arithmetic ------------------------------------------------
def test_base_shares_are_normalised_over_active_criteria_only():
    sites, profiles = _three_sites()
    m = mission(W)
    kept, dropped = scoring_engine.valid_criteria(m, profiles)
    assert "thermal_conditions" in dropped and set(kept) == {"terrain_safety", "elevation_suitability", "surface_roughness", "solar_illumination"}
    s = base_shares(m, kept)
    assert sum(s.values()) == pytest.approx(1.0)
    assert s["terrain_safety"] == pytest.approx(65 / 240)


def test_scenario_keeps_other_ratios_and_sums_to_100():
    sites, profiles = _three_sites()
    m = mission(W)
    kept, _ = scoring_engine.valid_criteria(m, profiles)
    w, target = scenario_weights(m, kept, "terrain_safety", 5.0)
    s = base_shares(m, kept)
    assert target == pytest.approx(s["terrain_safety"] + 0.05)
    assert sum(w[c] for c in kept) == pytest.approx(100.0)
    # the others keep their mutual ratios
    assert w["elevation_suitability"] / w["surface_roughness"] == pytest.approx(45 / 55)
    assert w["solar_illumination"] / w["surface_roughness"] == pytest.approx(75 / 55)
    # inactive criterion untouched
    assert w["thermal_conditions"] == 0.0


def test_scenario_clamps_at_zero_and_one():
    sites, profiles = _three_sites()
    m = mission({"terrain_safety": 10, "solar_illumination": 90})
    kept, _ = scoring_engine.valid_criteria(m, profiles)
    w, target = scenario_weights(m, kept, "terrain_safety", -50.0)
    assert target == 0.0 and w["terrain_safety"] == 0.0 and w["solar_illumination"] == pytest.approx(100.0)
    w, target = scenario_weights(m, kept, "solar_illumination", 50.0)
    assert target == 1.0 and w["solar_illumination"] == pytest.approx(100.0) and w["terrain_safety"] == 0.0


def test_scenario_requires_two_active_criteria():
    sites, profiles = _three_sites()
    m = mission({"terrain_safety": 10})
    with pytest.raises(ValueError):
        scenario_weights(m, ["terrain_safety"], "terrain_safety", 1.0)


def test_delta_grid_is_symmetric_and_contains_zero():
    d = deltas(5.0, 1.0)
    assert d == [-5.0, -4.0, -3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0, 4.0, 5.0]
    assert 0.0 in deltas(2.5, 0.5) and len(deltas(2.5, 0.5)) == 11


# --- sweep over the engine ------------------------------------------------------
def test_sweep_base_point_matches_evaluate_and_realised_share_matches_request():
    sites, profiles = _three_sites()
    m = mission(W)
    res = sweep(sites, profiles, m, "bravo", range_pp=5.0, step_pp=1.0, profile_version="test")
    ranked = ranking_engine.rank(scoring_engine.evaluate(sites, profiles, m)[0])
    mine = next(r for r in ranked if r.site_id == "bravo")
    assert res.base.focus_score == mine.score and res.base.focus_rank == mine.rank
    assert [o.site_id for o in res.base.ranking] == [r.site_id for r in ranked]
    assert not res.too_few_active and len(res.sweeps) == 4
    for sw in res.sweeps:
        assert len(sw.points) == 11
        zero = next(p for p in sw.points if p.delta_pp == 0.0)
        assert zero.focus_score == mine.score and zero.share == pytest.approx(sw.base_share)
        for p in sw.points:
            if p.share is not None:
                assert p.share == pytest.approx(min(1.0, max(0.0, sw.base_share + p.delta_pp / 100)))
                assert sum(p.weights[c] for c in res.active_criteria) == pytest.approx(100.0)
    assert res.inactive[0].criterion_id == "thermal_conditions"
    assert res.scoring_spec_version == scoring_engine.load_spec()["version"]


def test_sweep_finds_a_leader_breakpoint_when_one_exists():
    # Two sites that tie except on two criteria pulling opposite ways. Weighting
    # solar more makes the solar-rich site win; weighting elevation more flips it.
    a = make_site("lowland", {**FULL, "elevation_median_m": -3500.0, "insolation_toa_annual_mean_wm2": 129.0, "surface_temperature_mean_c": None})
    b = make_site("sunny", {**FULL, "elevation_median_m": -500.0, "insolation_toa_annual_mean_wm2": 178.5, "surface_temperature_mean_c": None})
    sites, profiles = [a[0], b[0]], {a[0].id: a[1], b[0].id: b[1]}
    m = mission({"elevation_suitability": 50, "solar_illumination": 50})
    res = sweep(sites, profiles, m, "lowland", range_pp=5.0, step_pp=1.0)
    sw = next(s for s in res.sweeps if s.criterion_id == "solar_illumination")
    # at delta 0 the two tie exactly (q = 0.5 each on the differing criterion); the tie breaks by site_id
    zero = next(p for p in sw.points if p.delta_pp == 0)
    assert zero.ranking[0].score == zero.ranking[1].score
    assert not sw.leader_stable and any(bp.kind == "leader" for bp in sw.breakpoints)
    assert any(bp.kind == "focus_rank" for bp in sw.breakpoints)
    assert sw.focus_rank_min == 1 and sw.focus_rank_max == 2
    assert "within the tested range" in sw.note
    # leaning toward solar favours 'sunny', leaning away favours 'lowland'
    assert next(p for p in sw.points if p.delta_pp == 5).leader_site_id == "sunny"
    assert next(p for p in sw.points if p.delta_pp == -5).leader_site_id == "lowland"


def test_gap_to_alternative_is_full_precision_and_signed():
    sites, profiles = _three_sites()
    res = sweep(sites, profiles, mission(W), "alpha", range_pp=1.0, step_pp=1.0)
    assert res.base.focus_rank == 1 and res.base.gap_to_alternative is not None and res.base.gap_to_alternative > 0
    ranked = ranking_engine.rank(scoring_engine.evaluate(sites, profiles, mission(W))[0])
    raw = {r.site_id: sum(f.weighted_contribution for f in r.factor_scores if f.weighted_contribution is not None) for r in ranked}
    assert res.base.gap_to_alternative == pytest.approx(raw["alpha"] - raw[ranked[1].site_id])
    res2 = sweep(sites, profiles, mission(W), ranked[-1].site_id, range_pp=1.0, step_pp=1.0)
    assert res2.base.gap_to_alternative is not None and res2.base.gap_to_alternative < 0


def test_too_few_active_criteria_yields_no_sweep():
    sites, profiles = _three_sites()
    m = mission({"terrain_safety": 50, "thermal_conditions": 50})
    res = sweep(sites, profiles, m, "alpha")
    assert res.too_few_active and res.sweeps == [] and res.base.focus_status == "insufficient_data"
    assert any("fewer than two" in w for w in res.warnings)


def test_ineligible_focus_site_is_reported_not_ranked():
    sites, profiles = _three_sites()
    hc = [HardConstraint(constraint_id="elev", feature_id="elevation_median_m", operator="<=", threshold=-1000.0, rationale="test", is_assumption=True)]
    res = sweep(sites, profiles, mission(W, hard_constraints=hc), "bravo")
    assert res.base.focus_status == "ineligible" and res.base.focus_rank is None and res.base.gap_to_alternative is None
    for sw in res.sweeps:
        assert sw.focus_rank_min is None and all(p.focus_status == "ineligible" for p in sw.points)
        assert "not ranked at any point" in sw.note
        assert all(o.site_id != "bravo" or o.rank is None for p in sw.points for o in p.ranking)


def test_share_driven_to_zero_drops_the_criterion_and_renormalises():
    sites, profiles = _three_sites()
    m = mission({"terrain_safety": 4, "solar_illumination": 96})
    res = sweep(sites, profiles, m, "alpha", range_pp=5.0, step_pp=1.0)
    sw = next(s for s in res.sweeps if s.criterion_id == "terrain_safety")
    low = next(p for p in sw.points if p.delta_pp == -5)
    assert low.share is None and low.weights["terrain_safety"] == 0.0 and low.active_count == 1
    assert low.focus_status == "insufficient_data"  # one criterion left: the engine refuses to score, no fake rank
    high = next(p for p in sw.points if p.delta_pp == 5)
    assert high.active_count == 2 and high.share == pytest.approx(0.09)


# --- decomposition identities the Analyze view relies on ---------------------------
def test_contributions_sum_to_score_and_points_below_ideal_complement_it():
    sites, profiles = _three_sites()
    ranked = ranking_engine.rank(scoring_engine.evaluate(sites, profiles, mission(W))[0])
    for r in ranked:
        active = [f for f in r.factor_scores if f.weighted_contribution is not None]
        total = sum(f.weighted_contribution for f in active)
        below = sum(100 * f.normalized_weight * (1 - f.suitability) for f in active)
        assert total == pytest.approx(r.score, abs=0.006)
        assert total + below == pytest.approx(100.0)
        assert sum(f.normalized_weight for f in active) == pytest.approx(1.0)


def test_comparator_deltas_sum_to_the_gap_and_saturated_factors_contribute_zero_delta():
    sites, profiles = _three_sites()
    ranked = ranking_engine.rank(scoring_engine.evaluate(sites, profiles, mission(W))[0])
    alpha = next(r for r in ranked if r.site_id == "alpha")
    bravo = next(r for r in ranked if r.site_id == "bravo")
    by = lambda r: {f.criterion_id: f for f in r.factor_scores if f.weighted_contribution is not None}  # noqa: E731
    fa, fb = by(alpha), by(bravo)
    deltas_ = {c: fa[c].weighted_contribution - fb[c].weighted_contribution for c in fa}
    gap = sum(f.weighted_contribution for f in fa.values()) - sum(f.weighted_contribution for f in fb.values())
    assert sum(deltas_.values()) == pytest.approx(gap)
    # both saturate slope at q = 1: the largest contribution on alpha explains none of the gap
    assert fa["terrain_safety"].suitability == 1.0 and fb["terrain_safety"].suitability == 1.0
    assert deltas_["terrain_safety"] == pytest.approx(0.0)
    assert max(fa.values(), key=lambda f: f.weighted_contribution).criterion_id == "solar_illumination"
    assert deltas_["elevation_suitability"] == pytest.approx(gap)


def test_exact_tie_versus_display_rounding_tie():
    a = make_site("one", {**FULL, "surface_temperature_mean_c": None})
    b = make_site("two", {**FULL, "surface_temperature_mean_c": None})
    c = make_site("three", {**FULL, "slope_regional_median_deg": 2.0004, "surface_temperature_mean_c": None})  # q = 0.99995: rounds to 100.00
    sites = [a[0], b[0], c[0]]
    profiles = {s.id: p for s, p in (a, b, c)}
    ranked = ranking_engine.rank(scoring_engine.evaluate(sites, profiles, mission({"terrain_safety": 50, "solar_illumination": 50}))[0])
    raw = {r.site_id: sum(f.weighted_contribution for f in r.factor_scores if f.weighted_contribution is not None) for r in ranked}
    assert raw["one"] == raw["two"]                                   # actual tie in full precision
    r3 = next(r for r in ranked if r.site_id == "three")
    assert r3.score == 100.0 and not math.isclose(raw["three"], raw["one"])  # equal only after rounding to 0.01
    # The ranking engine orders on the ROUNDED score and breaks ties by site_id, so
    # a display-rounding tie is also a rank tie: one, three, two alphabetically.
    assert [r.site_id for r in ranked] == ["one", "three", "two"]
    assert [r.rank for r in ranked] == [1, 2, 3]
    # The UI therefore distinguishes: full-precision gap (non-zero for 'three')
    # from the engine's rounded tie-break, and says so rather than calling it a win.
    assert abs(raw["one"] - raw["three"]) < 0.005 and raw["one"] - raw["three"] > 0


# --- HTTP surface ------------------------------------------------------------
def test_endpoint_round_trip_and_errors(client):
    m = scoring_engine.default_mission().model_dump()
    r = client.post("/api/v1/scoring/sensitivity", json={"mission": m, "focus_site_id": "jezero_crater", "client_request_id": "s1"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["client_request_id"] == "s1" and body["focus_site_id"] == "jezero_crater" and not body["too_few_active"]
    assert set(body["active_criteria"]) == {"terrain_safety", "elevation_suitability", "surface_roughness", "solar_illumination"}
    ev = client.post("/api/v1/scoring/evaluate", json={"planet": "mars", "mission": m}).json()
    mine = next(x for x in ev["results"] if x["site_id"] == "jezero_crater")
    assert body["base"]["focus_score"] == mine["score"] and body["base"]["focus_rank"] == mine["rank"]
    assert [o["site_id"] for o in body["base"]["ranking"]] == [x["site_id"] for x in ev["results"]]
    for sw in body["sweeps"]:
        assert len(sw["points"]) == 11 and "within the tested range" in sw["note"]
        assert abs(sum(sw["base_share"] for _ in [0]) - sw["base_share"]) < 1e-12
    assert sum(body["base_shares"].values()) == pytest.approx(1.0)
    assert "ratios" in body["assumption"]
    # errors
    assert client.post("/api/v1/scoring/sensitivity", json={"mission": m, "focus_site_id": "nope"}).json()["error"]["code"] == "not_found"
    assert client.post("/api/v1/scoring/sensitivity", json={"mission": m, "focus_site_id": "jezero_crater", "site_ids": ["noctis_labyrinthus"]}).status_code == 422
    assert client.post("/api/v1/scoring/sensitivity", json={"mission": m, "focus_site_id": "jezero_crater", "range_pp": 0}).status_code == 422
    SensitivityRequest(mission=scoring_engine.default_mission(), focus_site_id="x")  # model builds with defaults


def test_sweep_is_deterministic(client):
    m = scoring_engine.default_mission().model_dump()
    a = client.post("/api/v1/scoring/sensitivity", json={"mission": m, "focus_site_id": "noctis_labyrinthus"}).json()
    b = client.post("/api/v1/scoring/sensitivity", json={"mission": m, "focus_site_id": "noctis_labyrinthus"}).json()
    assert a == b


def test_sweep_never_touches_the_request_mission():
    sites, profiles = _three_sites()
    m = mission(W)
    before = m.model_dump()
    sweep(sites, profiles, m, "alpha")
    assert m.model_dump() == before
    assert sensitivity_engine.ASSUMPTION


def test_non_divisible_step_stays_inside_advertised_range():
    assert sensitivity_engine.deltas(5, 3) == [-5, -3, 0, 3, 5]
    assert sensitivity_engine.deltas(2, 10) == [-2, 0, 2]
