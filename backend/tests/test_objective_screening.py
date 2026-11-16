"""Prompt-to-catalogue regression: no LLM or new scientific measurements."""
import pytest
from app.models import InterpretRequest
from app.models.mission_assessment import MissionAssessmentRequest
from app.services.objective_engine import rule_based
from app.services.mission_assessment import evaluate
from factories import make_site

WATER = "Screen the catalogued Mars sites for water-related mineralogy: favour hydrated minerals such as clays, sulfates, jarosite, opal or carbonates that sit closest to known subsurface ice or water-equivalent hydrogen, then rank the sites by how accessible that water is, and explain the trade-offs."

def plan(text):
    return rule_based(InterpretRequest(objective=text,use_llm=False)).task_interpretation.screening

def test_water_prompt_configures_research_and_discloses_unmeasured_goals():
    p=plan(WATER)
    assert p.body=="mars" and p.mission_type=="research"
    assert set(p.requirements.material_targets)=={"clays","sulfates","carbonates"}
    assert p.requirements.material_match=="any"
    assert p.weights=={"materials":100,"landforms":0}
    assert any("jarosite" in n and "opal" in n for n in p.limitations)
    assert any("accessibility" in n and "distance" in n for n in p.limitations)

def test_water_screen_reaches_real_supported_matches_and_leaves_unknown_sites_unranked():
    p=plan(WATER)
    r=evaluate(MissionAssessmentRequest(body=p.body,mission_type=p.mission_type,weights=p.weights,requirements=p.requirements))
    matches={s.site_id for s in r.results if s.score==100}
    assert matches=={"mawrth_vallis","hebrus_valles","columbus_crater","oxia_planum","jezero_crater"}
    assert all(s.rank==1 for s in r.results if s.site_id in matches)
    assert any(s.score is None and s.rank is None for s in r.results)
    assert all(f.source for s in r.results if s.score==100 for f in s.factors if f.q is not None)

def test_missing_research_data_does_not_erase_known_matches_or_get_a_score():
    pool=[make_site("known",{"mineralogy_tags":["clays"]}),make_site("unknown",{"mineralogy_tags":None})]
    r=evaluate(MissionAssessmentRequest(body="mars",mission_type="research",weights={"materials":100,"landforms":0},requirements={"material_targets":["clays"]}),pool)
    assert r.results[0].site_id=="known" and r.results[0].score==100
    assert r.results[1].score is None and r.results[1].coverage_fraction==0

@pytest.mark.parametrize("text,kind,materials,landforms",[
    ("Find Mars sites with clay minerals", "research", {"clays"},set()),
    ("Screen Mars for sulphate or carbonate minerals", "research", {"sulfates","carbonates"},set()),
    ("Study ancient deltas on Mars", "research",set(),{"delta"}),
    ("Find a Mars site to study basalt", "research",{"basalt"},set()),
    ("Find a safe Mars landing site with reliable sunlight", "landing",set(),set()),
    ("Plan a permanent Mars base near water", "base_planning",set(),set()),
])
def test_supported_prompt_matrix(text,kind,materials,landforms):
    p=plan(text)
    assert p.mission_type==kind
    assert set(p.requirements.material_targets)==materials
    assert set(p.requirements.landform_targets)==landforms

def test_analog_search_remains_directional_not_a_material_screen():
    r=rule_based(InterpretRequest(objective="Find Earth analogs for Jezero with similar clay minerals",use_llm=False))
    assert r.task_interpretation.task=="analog_site_selection"
    assert r.task_interpretation.screening is None

def test_a_new_landing_objective_clears_research_requirements_in_its_plan():
    p=plan("Screen Mars for a safe solar-powered lander")
    assert p.mission_type=="landing" and not p.requirements.material_targets

def test_material_exclusions_are_not_reversed_into_preferences():
    p=plan("Study Mars clays, but exclude sulfates")
    assert p.requirements.material_targets==["clays"]
    assert p.requirements.excluded_material_targets==["sulfates"]
    r=evaluate(MissionAssessmentRequest(body="mars",mission_type="research",weights=p.weights,requirements=p.requirements))
    by_id={s.site_id:s for s in r.results}
    assert by_id["oxia_planum"].score==100 and by_id["columbus_crater"].score==0

def test_unrecognised_minerals_do_not_revert_to_landing_scores():
    p=plan("Find Mars mineral sites for jarosite or opal")
    assert p.mission_type=="research" and not p.requirements.material_targets
    r=evaluate(MissionAssessmentRequest(body="mars",mission_type=p.mission_type,weights=p.weights,requirements=p.requirements))
    assert all(s.score is None and s.status=="needs_requirements" for s in r.results)

def test_and_target_coverage_remains_distinct_from_alternative_materials():
    p=plan("Study both clays and sulfates on Mars")
    assert p.requirements.material_match=="coverage"
    r=evaluate(MissionAssessmentRequest(body=p.body,mission_type=p.mission_type,weights=p.weights,requirements=p.requirements))
    assert r.results[0].site_id=="columbus_crater" and r.results[0].score==100

def test_research_intent_never_calls_the_landing_weight_model(monkeypatch):
    from app.services import objective_engine as engine
    monkeypatch.setattr(engine.llm_client,"enabled",lambda *a:True)
    def forbidden(*a): raise AssertionError("irrelevant landing LLM call")
    monkeypatch.setattr(engine,"_call_llm",forbidden)
    engine.clear_cache()
    result=engine.interpret(InterpretRequest(objective=WATER))
    assert result.generated_by=="rule_based" and result.task_interpretation.screening.mission_type=="research"

def test_nearby_water_ice_does_not_qualify_ice_only_sites_as_clay_matches():
    p=plan("Find hydrated clays near water ice on Mars")
    assert p.requirements.material_targets==["clays"]

def test_hydrated_family_fallback_respects_exclusions():
    p=plan("Screen hydrated minerals without clays")
    assert "clays" not in p.requirements.material_targets
    assert p.requirements.excluded_material_targets==["clays"]

def test_explicit_minerals_take_priority_over_a_landform_match():
    p=plan("Study Mars sites with clays and deltas")
    assert p.weights=={"materials":98,"landforms":2}
    pool=[make_site("mineral",{"mineralogy_tags":["clays"],"terrain_morphology":["lava_plain"]}),make_site("landform",{"mineralogy_tags":["basalt"],"terrain_morphology":["delta"]})]
    r=evaluate(MissionAssessmentRequest(body="mars",mission_type="research",weights=p.weights,requirements=p.requirements),pool)
    assert r.results[0].site_id=="mineral" and r.results[0].score==98
    assert r.results[1].score==2

@pytest.mark.parametrize("text,excluded",[
    ("Find carbonates, exclude clays, sulfates",{"clays","sulfates"}),
    ("Find carbonates without clays, sulfates or olivine",{"clays","sulfates","olivine"}),
])
def test_exclusion_lists_keep_their_scope_across_commas(text,excluded):
    p=plan(text)
    assert p.requirements.material_targets==["carbonates"]
    assert set(p.requirements.excluded_material_targets)==excluded

def test_an_explicit_positive_clause_ends_exclusion_scope():
    p=plan("Exclude clays, sulfates; find carbonates")
    assert p.requirements.material_targets==["carbonates"]
    assert set(p.requirements.excluded_material_targets)=={"clays","sulfates"}

def test_specific_unsupported_minerals_do_not_expand_to_unrequested_minerals():
    p=plan("Find hydrated minerals, specifically jarosite or opal")
    assert p.requirements.material_targets==[]

def test_requiring_an_unsupported_mineral_does_not_claim_a_complete_match():
    p=plan("Find both clays and jarosite on Mars")
    r=evaluate(MissionAssessmentRequest(body="mars",mission_type=p.mission_type,weights=p.weights,requirements=p.requirements))
    assert all(s.score is None for s in r.results)

def test_hematite_named_in_approved_site_evidence_is_searchable():
    p=plan("Find a Mars site with hematite")
    assert p.requirements.material_targets==["hematite"]
    r=evaluate(MissionAssessmentRequest(body="mars",mission_type=p.mission_type,weights=p.weights,requirements=p.requirements))
    assert {s.site_id for s in r.results if s.score==100}=={"meridiani_planum"}
    assert r.results[0].factors[0].source.source_id=="hynek2017_meridiani"

@pytest.mark.parametrize('text', [
    'Screen Mars for water-equivalent hydrogen',
    'Rank Mars sites by ice accessibility',
])
def test_unmeasured_water_research_never_silently_becomes_landing(text):
    p=plan(text)
    assert p.mission_type=='research'
    assert any('accessibility' in line for line in p.limitations)
    r=evaluate(MissionAssessmentRequest(body=p.body,mission_type=p.mission_type,weights=p.weights,requirements=p.requirements))
    assert all(s.rank is None for s in r.results)

@pytest.mark.parametrize('text', ['Find clays but no sulfates on Mars', 'Find clays rather than sulfates on Mars'])
def test_plain_language_negative_minerals_are_exclusions(text):
    p=plan(text)
    assert p.requirements.material_targets==['clays']
    assert p.requirements.excluded_material_targets==['sulfates']


def test_research_cannot_silently_claim_safety_and_power_optimisation():
    p=plan('Find clays on Mars with safe slopes and reliable sunlight')
    assert any('terrain' in line.lower() and 'solar' in line.lower() for line in p.limitations)


def test_research_task_description_does_not_claim_landing_ranking():
    result=rule_based(InterpretRequest(objective=WATER,use_llm=False))
    assert any('research' in line.lower() for line in result.task_interpretation.rationale)
    assert not any('landing screening is assumed' in line for line in result.task_interpretation.rationale)


def test_water_only_research_never_calls_landing_llm_or_asks_landing_questions(monkeypatch):
    from app.services import objective_engine as engine
    monkeypatch.setattr(engine.llm_client,'enabled',lambda *a:True)
    calls=[]
    def forbidden(*a):
        calls.append(True)
        raise AssertionError('research cannot use a landing-weight model')
    monkeypatch.setattr(engine,'_call_llm',forbidden)
    engine.clear_cache()
    result=engine.interpret(InterpretRequest(objective='Screen Mars for water-equivalent hydrogen'))
    assert result.generated_by=='rule_based'
    assert not any('gentle slopes' in q for q in result.clarifying_questions)
    assert any('accessibility' in n for n in result.unsupported_needs)
    assert result.analog_check is None
    assert calls == []
