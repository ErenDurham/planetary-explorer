"""Earth rover-test ranking against the paired Mars site: the same full analog
similarity (slope, relief, landforms, minerals, dryness) as POST /analogs/rank,
in the mission-assessment shape the Explore views use."""
import math

import pytest

from app.models.analog_rank import AnalogRankRequest
from app.models.mission_assessment import MissionAssessmentRequest
from app.services.analog_rank_engine import rank_pool
from app.services.data_loader import get_store
from app.services.mission_assessment import analog_weights, evaluate


def _req(mars="jezero_crater", weights=None, **kw):
    return MissionAssessmentRequest(body="earth", mission_type="rover_field_test", weights=weights or {"slope": 50, "relief": 50},
                                    requirements={"analog_reference_id": mars}, **kw)


@pytest.mark.parametrize("mars", ["jezero_crater", "gale_crater", "elysium_planitia", "utopia_planitia"])
def test_scores_and_order_equal_the_explore_analog_ranking(mars):
    r = evaluate(_req(mars))
    ref = rank_pool(AnalogRankRequest(reference_body="mars", reference_id=mars, candidate_body="earth"), get_store())
    assert [x.site_id for x in r.results] == [c.location.id for c in ref.candidates]
    for x, c in zip(r.results, ref.candidates):
        assert x.rank == c.rank and round(x.score, 2) == c.similarity


def test_factor_points_add_up_to_the_score():
    for x in evaluate(_req("gale_crater")).results:
        assert math.isclose(100 + sum(f.contribution for f in x.factors), x.score, abs_tol=1e-9)
        assert all(f.contribution <= 0 and 0 < f.q <= 1 for f in x.factors)


def test_the_earth_sliders_only_split_the_terrain_share():
    w = analog_weights({"slope": 75, "relief": 25})
    assert w["slope_regional_median_deg"] + w["roughness_regional_m"] == 50
    assert w["slope_regional_median_deg"] == 37.5 and w["terrain_morphology"] == 20 and w["mineralogy_tags"] == 20 and w["precipitation_mm_day"] == 10
    assert analog_weights({"slope": 50, "relief": 50})["slope_regional_median_deg"] == 25
    a, b = evaluate(_req(weights={"slope": 90, "relief": 10})), evaluate(_req(weights={"slope": 10, "relief": 90}))
    assert [x.score for x in a.results] != [x.score for x in b.results]


def test_a_missing_feature_is_dropped_for_every_site_and_disclosed():
    r = evaluate(_req("utopia_planitia"))   # no recent mineral source at the Viking 2 site
    assert all("mineralogy_tags" not in {f.feature_id for f in x.factors} for x in r.results)
    assert all(any("Mineralogy" in g for g in x.evidence_gaps) for x in r.results)


def test_method_names_the_mars_site_and_requirements_echo_it():
    r = evaluate(_req("gale_crater"))
    assert "Gale Crater" in r.profile_label and "Gale Crater" in r.method
    assert r.requirements.analog_reference_id == "gale_crater"


def test_rejects_a_reference_outside_the_earth_rover_test(client):
    bad = client.post("/api/v1/missions/evaluate", json={"body": "mars", "mission_type": "rover_field_test", "requirements": {"analog_reference_id": "gale_crater"}})
    assert bad.status_code == 422
    unknown = client.post("/api/v1/missions/evaluate", json={"body": "earth", "mission_type": "rover_field_test", "requirements": {"analog_reference_id": "nowhere"}})
    assert unknown.status_code == 422


def test_without_a_reference_the_target_ranking_is_unchanged():
    r = evaluate(MissionAssessmentRequest(body="earth", mission_type="rover_field_test"))
    assert r.profile_label == "Regional rover test fit" and r.results[0].factors[0].method == "target_distance"
