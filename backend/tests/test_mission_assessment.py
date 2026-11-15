import pytest
from pydantic import ValidationError
from app.models.mission_assessment import MissionAssessmentRequest
from app.services.mission_assessment import evaluate
from factories import make_site

def rover(**kw):
    return MissionAssessmentRequest(body="mars",mission_type="rover_field_test",**kw)

def test_rover_scores_targets_not_always_flatter_is_better():
    pool=[make_site("flat",{"slope_regional_median_deg":0,"roughness_regional_m":0}),make_site("target",{"slope_regional_median_deg":1,"roughness_regional_m":100})]
    result=evaluate(rover(),pool)
    assert result.results[0].site_id=="target"
    assert result.results[0].score==100
    assert result.results[1].score<100
    for s in result.results:
        assert sum(f.contribution or 0 for f in s.factors)==pytest.approx(s.score)
        assert sum(f.normalized_weight or 0 for f in s.factors)==pytest.approx(1)

def test_common_basis_drops_missing_or_unit_mismatched_factor_for_all():
    a=make_site("a",{"slope_regional_median_deg":1,"roughness_regional_m":100})
    b=make_site("b",{"slope_regional_median_deg":2,"roughness_regional_m":None})
    result=evaluate(rover(),[a,b])
    assert result.warnings
    assert all(s.coverage_fraction==.5 for s in result.results)
    assert all(s.factors[1].q is None for s in result.results)
    b[1].measurements[0].unit="radians"
    assert all(s.score is None for s in evaluate(rover(),[a,b]).results)

def test_research_target_coverage_deduplicates_and_preserves_unreported_semantics():
    pool=[make_site("a",{"mineralogy_tags":["basalt"],"terrain_morphology":["impact_crater"]}),make_site("b",{"mineralogy_tags":["clays"],"terrain_morphology":["lava_plain"]})]
    req=MissionAssessmentRequest(body="mars",mission_type="research",weights={"materials":100,"landforms":0},requirements={"material_targets":["basalt","basalt","clays"]})
    result=evaluate(req,pool)
    assert all(s.score==50 and s.rank==1 for s in result.results)
    assert "not confirmed absent" in result.results[0].factors[0].note
    assert result.results[0].factors[0].source.source_id=="test_source"

def test_research_needs_targets_and_rejects_unknown_vocabulary():
    pool=[make_site("a",{"mineralogy_tags":["basalt"],"terrain_morphology":["impact_crater"]})]
    result=evaluate(MissionAssessmentRequest(body="mars",mission_type="research"),pool)
    assert result.results[0].status=="needs_requirements" and result.results[0].score is None
    with pytest.raises(ValueError,match="Unknown"):
        evaluate(MissionAssessmentRequest(body="mars",mission_type="research",requirements={"material_targets":["made_up"]}),pool)

def test_zero_is_data_and_missing_is_not_zero():
    pool=[make_site("a",{"slope_regional_median_deg":0,"roughness_regional_m":0})]
    result=evaluate(rover(requirements={"slope_target_deg":0,"relief_target_m":0}),pool)
    assert result.results[0].score==100
    pool[0][1].measurements[0].is_missing=True
    assert evaluate(rover(),pool).results[0].factors[0].q is None

@pytest.mark.parametrize("kwargs",[{"weights":{"unknown":100}},{"weights":{"slope":-1}},{"weights":{"slope":0,"relief":0}},{"requirements":{"slope_tolerance_deg":0}},{"requirements":{"slope_target_deg":float("nan")}}])
def test_invalid_requirements_and_weights_rejected(kwargs):
    with pytest.raises(ValidationError): rover(**kwargs)

def test_base_planning_has_no_fabricated_score(client):
    data=client.post("/api/v1/missions/evaluate",json={"body":"earth","mission_type":"base_planning"}).json()
    assert len(data["results"])==17
    assert all(s["score"] is None and s["rank"] is None and s["status"]=="not_supported" for s in data["results"])
    assert data["results"][0]["evidence_gaps"]

@pytest.mark.parametrize("body,count",[("earth",17),("mars",17)])
def test_live_profiles_score_both_bodies_and_echo_request(client,body,count):
    data=client.post("/api/v1/missions/evaluate",json={"body":body,"mission_type":"rover_field_test","client_request_id":"test"}).json()
    assert len(data["results"])==count
    assert data["client_request_id"]=="test"
    assert all(s["body"]==body and 0<=s["score"]<=100 for s in data["results"])
    assert data["spec_version"]=="mission-screening-v1.0"


def test_generic_overview_is_flagged_and_never_claimed_as_high_quality_geological_evidence():
    pair=make_site("a",{"mineralogy_tags":["basalt"],"terrain_morphology":["impact_crater"]})
    m=pair[1].get("mineralogy_tags");m.source_id="nasa_analogs_overview"
    pair[1].sources["nasa_analogs_overview"]=pair[1].sources["test_source"]
    req=MissionAssessmentRequest(body="mars",mission_type="research",weights={"materials":100,"landforms":0},requirements={"material_targets":["basalt"]})
    result=evaluate(req,[pair]).results[0]
    assert result.factors[0].quality=="low_confidence"
    assert any("site-specific" in gap for gap in result.evidence_gaps)

def test_demo_measurements_are_excluded_from_the_entire_pool():
    a=make_site("a",{"slope_regional_median_deg":1,"roughness_regional_m":100})
    b=make_site("b",{"slope_regional_median_deg":2,"roughness_regional_m":100})
    b[1].get("slope_regional_median_deg").measurement_type="demo_fixture"
    result=evaluate(rover(),[a,b])
    assert all(r.factors[0].q is None for r in result.results)
    assert all(r.coverage_fraction==.5 for r in result.results)
