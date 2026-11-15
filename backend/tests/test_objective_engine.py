"""Structured mission interpretation: rule reader, deterministic validation,
mocked LLM path, negation, trade-offs, unsupported needs, missing thermal."""
import json

import pytest

from app.models import InterpretRequest
from app.services import llm_client
from app.services import objective_engine as oe

EXCL = ["thermal_conditions"]


@pytest.fixture(autouse=True)
def _fresh_cache():
    oe.clear_cache()
    yield
    oe.clear_cache()


def _w(resp):
    return {s.criterion_id: s.weight for s in resp.suggestions}


def test_rule_reader_tradeoff_raises_x_and_lowers_y():
    r = oe.rule_based(InterpretRequest(objective="Prioritise landing safety over sunlight", excluded_criteria=EXCL))
    w = _w(r)
    assert w["terrain_safety"] > 60 and 0 < w["solar_illumination"] <= 15
    assert r.tradeoffs and r.generated_by == "rule_based" and r.confidence == "high"
    assert "Confidence describes" in r.confidence_note


def test_rule_reader_negation_sets_zero_and_is_not_a_contradiction():
    r = oe.rule_based(InterpretRequest(objective="Prioritise safety over sunlight; ignore solar.", excluded_criteria=EXCL))
    w = _w(r)
    assert w["solar_illumination"] == 0 and w["terrain_safety"] >= 60
    assert not r.clarifying_questions  # both clauses push solar the same way


def test_rule_reader_real_contradiction_asks_a_question():
    r = oe.rule_based(InterpretRequest(objective="Maximise solar power. Ignore solar.", excluded_criteria=EXCL))
    assert r.confidence == "low" and any("both emphasises and excludes" in q for q in r.clarifying_questions)


def test_rule_reader_unsupported_goals_are_disclosed_and_weights_untouched():
    r = oe.rule_based(InterpretRequest(objective="find ice for a permanent base on the moon", excluded_criteria=EXCL))
    assert _w(r)["thermal_conditions"] == 0
    joined = " ".join(r.unsupported_needs).lower()
    assert "ice" in joined and "permanent base" in joined and "moon" in joined
    assert r.confidence == "low" and r.clarifying_questions
    # nothing in the objective maps to a criterion, so weights are the defaults
    assert all(s.weight == s.previous_weight for s in r.suggestions if s.criterion_id != "thermal_conditions")


def test_missing_thermal_data_forces_zero_and_says_so():
    r = oe.rule_based(InterpretRequest(objective="Pick the warmest site", excluded_criteria=EXCL))
    assert _w(r)["thermal_conditions"] == 0
    assert any("no site carries a measured surface temperature" in u for u in r.unsupported_needs)
    assert next(s for s in r.suggestions if s.criterion_id == "thermal_conditions").data_available is False


def test_validate_proposal_rejects_unknown_ids_clamps_and_requires_positive_total():
    current = {"terrain_safety": 35, "elevation_suitability": 25, "surface_roughness": 20, "thermal_conditions": 10, "solar_illumination": 10}
    sugg, notes = oe.validate_proposal({"terrain_safety": 150, "radiation": 50, "solar_illumination": "x"}, current, EXCL)
    w = {s.criterion_id: s.weight for s in sugg}
    assert w["terrain_safety"] == 100 and w["thermal_conditions"] == 0 and "radiation" not in w
    assert any("unknown criterion 'radiation'" in n for n in notes) and any("Clamped" in n for n in notes)
    with pytest.raises(ValueError):
        oe.validate_proposal({k: 0 for k in current}, current, EXCL)


def test_hard_constraints_are_not_part_of_the_interpretation_contract():
    assert "hard_constraints" not in InterpretRequest.model_fields and "hard_constraints" not in oe.rule_based(InterpretRequest(objective="safe")).model_dump()


def test_llm_path_is_validated_and_numbers_in_rationale_are_guarded(monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    monkeypatch.setattr(llm_client, "model_name", lambda: "mock-model")
    answer = {"weights": {"terrain_safety": 90, "solar_illumination": 5, "thermal_conditions": 60, "bogus": 40},
              "reasons": {"terrain_safety": "Safety is the stated priority."}, "rationale": ["Safety first.", "Slopes above 12 deg are unsafe."],
              "tradeoffs": ["Safety over sunlight."], "unsupported_needs": [], "clarifying_questions": [], "confidence": "high"}
    calls = []
    monkeypatch.setattr(oe, "_call_llm", lambda system, user, schema: calls.append(user) or json.dumps(answer))
    r = oe.interpret(InterpretRequest(objective="safety over sunlight, and keep it warm", excluded_criteria=EXCL))
    w = _w(r)
    assert r.generated_by == "llm" and r.model == "mock-model"
    assert w["terrain_safety"] == 90 and w["solar_illumination"] == 5 and w["thermal_conditions"] == 0 and "bogus" not in w
    assert any("unknown criterion 'bogus'" in n for n in r.validation_notes)
    assert "Slopes above 12 deg are unsafe." not in r.rationale and any("stated numbers" in n for n in r.validation_notes)
    assert any("Temperature" in u for u in r.unsupported_needs)   # the rule detector still runs over the model's answer
    assert "<<<OBJECTIVE" in calls[0] and "UNTRUSTED" in calls[0]
    again = oe.interpret(InterpretRequest(objective="safety over sunlight, and keep it warm", excluded_criteria=EXCL))
    assert again.cached is True and len(calls) == 1


def test_llm_failure_falls_back_to_rules(monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    monkeypatch.setattr(llm_client, "model_name", lambda: "mock-model")

    def boom(system, user, schema):
        raise RuntimeError("network down")
    monkeypatch.setattr(oe, "_call_llm", boom)
    r = oe.interpret(InterpretRequest(objective="maximise solar power", excluded_criteria=EXCL))
    assert r.generated_by == "rule_based" and _w(r)["solar_illumination"] == 80
    assert any("rule-based reading used" in n for n in r.validation_notes)


def test_llm_all_zero_proposal_falls_back(monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    monkeypatch.setattr(llm_client, "model_name", lambda: "mock-model")
    answer = {"weights": {"terrain_safety": 0, "elevation_suitability": 0, "surface_roughness": 0, "solar_illumination": 0}, "reasons": {},
              "rationale": [], "tradeoffs": [], "unsupported_needs": [], "clarifying_questions": [], "confidence": "high"}
    monkeypatch.setattr(oe, "_call_llm", lambda system, user, schema: json.dumps(answer))
    r = oe.interpret(InterpretRequest(objective="ignore everything", excluded_criteria=EXCL))
    assert r.generated_by == "rule_based" and sum(_w(r).values()) > 0


def test_interpret_endpoint(client):
    body = client.post("/api/v1/mission/interpret", json={"objective": "Land safely, ignore solar", "excluded_criteria": EXCL}).json()
    assert body["generated_by"] in ("rule_based", "llm") and body["objective_hash"]
    w = {s["criterion_id"]: s["weight"] for s in body["suggestions"]}
    assert w["solar_illumination"] == 0 and w["terrain_safety"] >= 60 and w["thermal_conditions"] == 0
    assert client.post("/api/v1/mission/interpret", json={"objective": ""}).status_code == 422
