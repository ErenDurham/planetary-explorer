"""Contextual priority guidance: facts from the scoring engine, rule phrasing,
mocked model phrasing with the numeric guard, stale/cached handling."""
import json

import pytest

from app.models import GuidanceRequest
from app.services import guidance_engine as ge
from app.services import llm_client
from app.services.data_loader import get_store

PREV = {"terrain_safety": 35, "elevation_suitability": 25, "surface_roughness": 20, "thermal_conditions": 10, "solar_illumination": 10}


@pytest.fixture(autouse=True)
def _fresh():
    ge.clear_cache()
    yield
    ge.clear_cache()


def test_facts_report_influence_rank_deltas_and_missing_data():
    new = {**PREV, "terrain_safety": 0, "elevation_suitability": 100}
    f = ge.facts(GuidanceRequest(objective="land safely", previous_weights=PREV, new_weights=new, changed_criterion_id="elevation_suitability"), get_store())
    inf = {d.criterion_id: d for d in f["influence"]}
    assert inf["thermal_conditions"].new_pct is None and inf["thermal_conditions"].excluded_reason
    assert inf["elevation_suitability"].new_pct > inf["elevation_suitability"].previous_pct
    assert inf["terrain_safety"].new_pct is None  # weight 0 => excluded this round
    assert "Terrain safety (regional slope)" in f["de_emphasised"] or inf["terrain_safety"].previous_pct is not None
    assert f["new_leader"] and f["missing"]
    assert all(c.new_rank is None or isinstance(c.new_rank, int) for c in f["rank_changes"])


def test_rule_summary_mentions_change_leader_and_missing():
    new = {**PREV, "solar_illumination": 100}
    out = ge.guide(GuidanceRequest(objective="reliable power", previous_weights=PREV, new_weights=new, changed_criterion_id="solar_illumination", client_request_id="g1"), get_store())
    assert out.generated_by == "rule_based" and out.client_request_id == "g1"
    assert "Solar illumination" in out.summary and "effective influence" in out.summary
    assert any("Thermal" in n or "thermal" in n for n in out.missing_data_notes) and "unscored" in out.summary
    assert out.leader is not None


def test_all_zero_weights_is_explained_not_crashed():
    out = ge.guide(GuidanceRequest(previous_weights=PREV, new_weights={k: 0 for k in PREV}), get_store())
    assert "no site can be ranked" in out.summary and out.leader is None and out.leader_changed


def test_llm_phrasing_is_number_guarded_and_cached(monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    monkeypatch.setattr(llm_client, "model_name", lambda: "mock-model")
    calls = []
    monkeypatch.setattr(ge, "_call_llm", lambda system, user, schema: calls.append(user) or json.dumps({"summary": "Elevation now dominates; terrain safety is de-emphasised and Chryse Planitia still leads."}))
    new = {**PREV, "elevation_suitability": 100}
    req = GuidanceRequest(objective="land safely", previous_weights=PREV, new_weights=new, changed_criterion_id="elevation_suitability", client_request_id="a")
    out = ge.guide(req, get_store())
    assert out.generated_by == "llm" and out.model == "mock-model" and "<<<" not in calls[0]
    again = ge.guide(req.model_copy(update={"client_request_id": "b"}), get_store())
    assert again.cached is True and again.client_request_id == "b" and len(calls) == 1
    # an invented number is rejected and the rule sentence used instead
    ge.clear_cache()
    monkeypatch.setattr(ge, "_call_llm", lambda system, user, schema: json.dumps({"summary": "Elevation now carries 99% and the leader scores 123."}))
    out2 = ge.guide(req, get_store())
    assert out2.generated_by == "rule_based" and "99%" not in out2.summary


def test_guidance_endpoint_and_independence_from_analog_weights(client):
    new = {**PREV, "surface_roughness": 90}
    body = client.post("/api/v1/mission/guidance", json={"objective": "rover mobility", "previous_weights": PREV, "new_weights": new, "changed_criterion_id": "surface_roughness", "client_request_id": "x9"}).json()
    assert body["client_request_id"] == "x9" and body["summary"] and body["influence"]
    assert "analog" not in json.dumps(body).lower()   # the Earth-comparison weights are never touched here
