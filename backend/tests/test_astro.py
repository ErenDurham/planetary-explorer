import json

import pytest
from app.services import llm_client


def request(**patch):
    return {
        "question": "Why this site?",
        "viewed_body": "mars",
        "selected_mars_id": "jezero_crater",
        **patch,
    }


def test_offline_guidance_has_context_and_real_actions(client, monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: False)
    response = client.post("/api/v1/astro/chat", json=request())
    assert response.status_code == 200
    data = response.json()
    assert data["generated_by"] == "deterministic_fallback"
    assert "Jezero" in data["context_label"]
    assert data["facts"]
    assert any(a["tab"] == "research" for a in data["actions"])


def test_unknown_location_and_unbounded_history_rejected(client):
    assert (
        client.post(
            "/api/v1/astro/chat", json=request(selected_mars_id="invented")
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/v1/astro/chat",
            json=request(history=[{"role": "user", "content": "x"}] * 13),
        ).status_code
        == 422
    )


def test_earth_never_gets_landing_score(client, monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: False)
    data = client.post(
        "/api/v1/astro/chat",
        json=request(viewed_body="earth", selected_earth_id="rio_tinto"),
    ).json()
    assert "landing index" not in " ".join(data["facts"]).lower()


def test_invalid_model_output_falls_back(client, monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    monkeypatch.setattr(
        llm_client,
        "call_json",
        lambda *a, **kw: json.dumps(
            {"answer": "Invented measurement 99999999", "evidence": [], "actions": []}
        ),
    )
    data = client.post("/api/v1/astro/chat", json=request()).json()
    assert data["generated_by"] == "deterministic_fallback"
    assert "99999999" not in data["answer"]


def test_model_cannot_create_actions_or_unsupported_evidence(client, monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    monkeypatch.setattr(
        llm_client,
        "call_json",
        lambda *a, **kw: json.dumps(
            {
                "answer": "Inspect the evidence before drawing conclusions.",
                "evidence": [{"citation_id": "[C999]", "quote": "Made up"}],
                "action_ids": ["execute_code"],
            }
        ),
    )
    data = client.post("/api/v1/astro/chat", json=request()).json()
    assert data["generated_by"] == "deterministic_fallback"


def test_research_uses_mars_after_earth_explore(client, monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: False)
    data = client.post(
        "/api/v1/astro/chat",
        json=request(
            active_tab="research",
            viewed_body="earth",
            selected_earth_id="rio_tinto",
        ),
    ).json()
    assert data["context_label"].startswith("Mars · Jezero")
    assert any("Landing index" in f for f in data["facts"])


def test_model_selects_server_facts_without_rewriting_them(client, monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)

    def model(system, user, schema, **kw):
        payload = json.loads(user)
        handle, excerpt = next(iter(payload["excerpts"].items()))
        properties = schema["$defs"]["EvidenceQuote"]["properties"]
        assert handle in schema["properties"]["evidence_ids"]["items"]["enum"]
        assert handle in properties["citation_id"]["enum"]
        assert all(len(text) <= 700 for text in payload["excerpts"].values())
        return json.dumps(
            {
                "focus": "ranking",
                "fact_ids": ["F1"],
                "evidence": [{"citation_id": handle, "quote": excerpt}],
                "action_ids": ["research"],
            }
        )

    monkeypatch.setattr(llm_client, "call_json", model)
    data = client.post("/api/v1/astro/chat", json=request()).json()
    assert data["generated_by"] == "llm"
    assert "Landing index" in data["answer"]
    assert data["actions"][0]["tab"] == "research"


@pytest.mark.parametrize(
    "answer",
    ["This site is certified safe to land.", "The regional slope is 88.7 degrees."],
)
def test_freeform_claims_rejected_even_with_valid_evidence(client, monkeypatch, answer):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)

    def model(system, user, schema, **kw):
        handle, excerpt = next(iter(json.loads(user)["excerpts"].items()))
        return json.dumps(
            {
                "answer": answer,
                "evidence": [{"citation_id": handle, "quote": excerpt}],
                "action_ids": ["research"],
            }
        )

    monkeypatch.setattr(llm_client, "call_json", model)
    data = client.post("/api/v1/astro/chat", json=request()).json()
    assert data["generated_by"] == "deterministic_fallback"
    assert answer not in data["answer"]


def test_mars_alone_can_suggest_earth_analogs(client, monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: False)
    data = client.post(
        "/api/v1/astro/chat",
        json=request(question="Which Earth analogs should I investigate?"),
    ).json()
    assert any("candidate body: earth" in f for f in data["facts"])
    assert any(a["body"] == "earth" for a in data["actions"])


def test_compare_uses_explicit_candidate_direction_and_selected_pair(
    client, monkeypatch
):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: False)
    data = client.post(
        "/api/v1/astro/chat",
        json=request(
            active_tab="compare",
            candidate_body="mars",
            selected_earth_id="rio_tinto",
            selected_mars_id="noctis_labyrinthus",
        ),
    ).json()
    assert any("candidate body: mars" in f for f in data["facts"])
    assert any("Noctis" in f and "analog rank" in f for f in data["facts"])
    assert all(
        "Noctis" in f
        for f in data["facts"]
        if "Landing index" in f or "; contribution:" in f
    )


def test_claude_schema_has_only_supported_constraints():
    from app.services.astro_engine import output_schema

    schema = output_schema()

    def visit(value):
        if isinstance(value, dict):
            assert (
                not {"maxLength", "minLength", "maxItems", "minimum", "maximum"}
                & value.keys()
            )
            if value.get("type") == "object":
                assert value["additionalProperties"] is False
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(schema)


def test_no_selection_offers_mission_level_candidates(client, monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: False)
    data = client.post(
        "/api/v1/astro/chat",
        json=request(
            selected_mars_id=None, question="Help me find a Mars site for my research."
        ),
    ).json()
    assert data["generated_by"] == "deterministic_fallback"
    assert any("Leading Mars candidate:" in f for f in data["facts"])
    assert any(a["tab"] == "explore" and a["body"] == "mars" for a in data["actions"])
    assert "Select an Earth or Mars location to ground" not in data["answer"]


def test_no_earth_selection_or_reference_offers_catalog_without_ranks(
    client, monkeypatch
):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: False)
    data = client.post(
        "/api/v1/astro/chat",
        json=request(
            viewed_body="earth", selected_mars_id=None, selected_earth_id=None
        ),
    ).json()
    assert any("Earth catalog location:" in f for f in data["facts"])
    assert all(
        "Landing index" not in f and "analog rank" not in f for f in data["facts"]
    )


def test_task_mission_context_uses_earth_assessment_not_landing(client, monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: False)
    assessment = {
        "body": "earth",
        "mission_type": "rover_field_test",
        "weights": {"slope": 50, "relief": 50},
    }
    response = client.post(
        "/api/v1/astro/chat",
        json=request(
            active_tab="analyze",
            viewed_body="mars",
            map_mode="mission_browse",
            selected_earth_id="rio_tinto",
            assessment=assessment,
        ),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["context_label"].startswith("Earth · Río Tinto")
    assert any("Task mission:" in f and "Earth" in f for f in data["facts"])
    assert all("Landing index" not in f for f in data["facts"])
    assert any(
        a["tab"] == "analyze"
        and a["body"] == "earth"
        and a["location_id"] == "rio_tinto"
        for a in data["actions"]
    )


def test_base_planning_chat_keeps_scores_unavailable(client, monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: False)
    data = client.post(
        "/api/v1/astro/chat",
        json=request(
            map_mode="mission_browse",
            assessment={"body": "mars", "mission_type": "base_planning"},
        ),
    ).json()
    assert any("not_supported" in f for f in data["facts"])
    assert all("Landing index" not in f for f in data["facts"])


def test_claude_schema_describes_locally_enforced_list_limits():
    from app.services.astro_engine import output_schema
    properties = output_schema()["properties"]
    for field, limit in [("fact_ids", 5), ("evidence", 4), ("action_ids", 3)]:
        assert f"at most {limit} items" in properties[field]["description"]


def test_model_can_explain_supported_factors_in_plain_language(client, monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    monkeypatch.setattr(llm_client, "call_json", lambda *a, **kw: json.dumps({
        "focus": "ranking", "explanation": "This ranking reflects your current mission priorities. Missing measurements cannot establish site safety.",
        "fact_ids": ["F1"], "evidence": [], "action_ids": [],
    }))
    data = client.post("/api/v1/astro/chat", json=request()).json()
    assert data["generated_by"] == "llm"
    assert data["answer"].startswith("This ranking reflects")
    assert "Here are the computed factors" not in data["answer"]


def test_explanation_rejects_invented_numbers(client, monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    monkeypatch.setattr(llm_client, "call_json", lambda *a, **kw: json.dumps({
        "focus": "ranking", "explanation": "The temperature is 987654 degrees.",
        "fact_ids": ["F1"], "evidence": [], "action_ids": [],
    }))
    data = client.post("/api/v1/astro/chat", json=request()).json()
    assert data["generated_by"] == "deterministic_fallback"
    assert "987654" not in data["answer"]


def test_explanation_allows_rounding_but_not_new_measurements(client, monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    def model(system, user, schema, **kwargs):
        payload = json.loads(user)
        import re
        fact_id, fact = next((k,v) for k,v in payload["facts"].items() if "Landing index:" in v)
        score = float(re.search(r"Landing index: ([0-9.]+)", fact).group(1))
        return json.dumps({"focus":"ranking", "explanation":f"The current index is {score:.1f}, reflecting these priorities rather than safety.", "fact_ids":[fact_id], "evidence":[], "action_ids":[]})
    monkeypatch.setattr(llm_client, "call_json", model)
    data=client.post("/api/v1/astro/chat", json=request()).json()
    assert data["generated_by"] == "llm"


def test_greeting_is_instant_and_does_not_spend_free_quota(client, monkeypatch):
    monkeypatch.setattr(llm_client, "call_json", lambda *a, **kw: pytest.fail("A greeting should not call the provider"))
    data = client.post("/api/v1/astro/chat", json=request(question="Hi")).json()
    assert data["generated_by"] == "local"
    assert "Hello" in data["answer"]
    assert data["fallback_reason"] is None


def test_location_overview_fallback_answers_the_question_without_repeating_name(client, monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: False)
    data = client.post("/api/v1/astro/chat", json=request(question="Tell me a little about this location?")).json()
    assert "ancient" in data["answer"].lower() or "crater" in data["answer"].lower()
    assert data["answer"].count("Jezero") <= 1
    assert "contribution:" not in data["answer"]
    assert data["fallback_reason"] == "not_configured"


def test_overview_sends_small_context_and_keeps_geographic_grounding(client, monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    def model(system, user, schema, **kwargs):
        payload = json.loads(user)
        assert len(payload["facts"]) <= 6
        assert "allowed_actions" not in payload
        assert any("Selected location:" in fact for fact in payload["facts"].values())
        return json.dumps({"focus":"evidence_gaps", "explanation":"This crater preserves evidence of an ancient lake and delta.", "fact_ids":[], "evidence_ids":[], "evidence":[], "action_ids":[]})
    monkeypatch.setattr(llm_client, "call_json", model)
    data=client.post("/api/v1/astro/chat", json=request(question="Tell me about this location")).json()
    assert data["generated_by"] == "llm"


def test_free_quota_failure_is_specific_and_summary_stays_readable(client, monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    def limited(*args, **kwargs):
        raise llm_client.ProviderUnavailable(429)
    monkeypatch.setattr(llm_client, "call_json", limited)
    data = client.post("/api/v1/astro/chat", json=request(question="Tell me about this site")).json()
    assert data["generated_by"] == "deterministic_fallback"
    assert data["fallback_reason"] == "rate_limit"
    assert "contribution:" not in data["answer"]
    assert data["answer"].count("Jezero") <= 1
