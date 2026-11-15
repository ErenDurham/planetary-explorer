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
    monkeypatch.setattr(llm_client, "enabled", lambda: False)
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
    monkeypatch.setattr(llm_client, "enabled", lambda: False)
    data = client.post(
        "/api/v1/astro/chat",
        json=request(viewed_body="earth", selected_earth_id="atacama_yungay"),
    ).json()
    assert "landing index" not in " ".join(data["facts"]).lower()


def test_invalid_model_output_falls_back(client, monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda: True)
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
    monkeypatch.setattr(llm_client, "enabled", lambda: True)
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
    monkeypatch.setattr(llm_client, "enabled", lambda: False)
    data = client.post(
        "/api/v1/astro/chat",
        json=request(
            active_tab="research",
            viewed_body="earth",
            selected_earth_id="atacama_yungay",
        ),
    ).json()
    assert data["context_label"].startswith("Mars · Jezero")
    assert any("Landing index" in f for f in data["facts"])


def test_model_selects_server_facts_without_rewriting_them(client, monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda: True)

    def model(system, user, schema, **kw):
        payload = json.loads(user)
        handle, excerpt = next(iter(payload["excerpts"].items()))
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
    monkeypatch.setattr(llm_client, "enabled", lambda: True)

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
    monkeypatch.setattr(llm_client, "enabled", lambda: False)
    data = client.post(
        "/api/v1/astro/chat",
        json=request(question="Which Earth analogs should I investigate?"),
    ).json()
    assert any("candidate body: earth" in f for f in data["facts"])
    assert any(a["body"] == "earth" for a in data["actions"])


def test_compare_uses_explicit_candidate_direction_and_selected_pair(
    client, monkeypatch
):
    monkeypatch.setattr(llm_client, "enabled", lambda: False)
    data = client.post(
        "/api/v1/astro/chat",
        json=request(
            active_tab="compare",
            candidate_body="mars",
            selected_earth_id="atacama_yungay",
            selected_mars_id="gale_crater",
        ),
    ).json()
    assert any("candidate body: mars" in f for f in data["facts"])
    assert any("Gale" in f and "analog rank" in f for f in data["facts"])
    assert all(
        "Gale" in f
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
    monkeypatch.setattr(llm_client, "enabled", lambda: False)
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
    monkeypatch.setattr(llm_client, "enabled", lambda: False)
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
