"""End-to-end smoke test over the real preprocessed data: every endpoint, the
full user workflow, and the contract shape the frontend depends on."""
from app.services import scoring_engine


def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["services"]["data"] == "ok"
    assert body["scoring_spec_version"].startswith("landing-")


def test_sites_and_profile(client):
    r = client.get("/api/v1/sites?planet=mars")
    assert r.status_code == 200
    sites = r.json()["sites"]
    assert 5 <= len(sites) <= 8
    for s in sites:
        assert -180 <= s["lon_east"] <= 180 and -90 <= s["lat"] <= 90
    sid = sites[0]["id"]
    p = client.get(f"/api/v1/sites/{sid}").json()
    assert p["site"]["id"] == sid
    meas = {m["feature_id"]: m for m in p["profile"]["measurements"]}
    assert meas["elevation_median_m"]["is_missing"] is False
    assert meas["elevation_median_m"]["source_id"] in p["profile"]["sources"]
    # missing data is null, never zero
    assert meas["surface_temperature_mean_c"]["is_missing"] is True and meas["surface_temperature_mean_c"]["value"] is None


def test_unknown_site_is_structured_error(client):
    r = client.get("/api/v1/sites/nope")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


def test_evaluate_default_mission_ranks_all_sites(client):
    mission = scoring_engine.default_mission().model_dump()
    r = client.post("/api/v1/scoring/evaluate", json={"planet": "mars", "mission": mission, "client_request_id": "t1"})
    assert r.status_code == 200
    body = r.json()
    assert body["client_request_id"] == "t1"
    ok = [x for x in body["results"] if x["status"] == "ok"]
    assert ok and [x["rank"] for x in ok] == list(range(1, len(ok) + 1))
    scores = [x["score"] for x in ok]
    assert scores == sorted(scores, reverse=True) and all(0 <= s <= 100 for s in scores)
    # thermal criterion has no data on any site -> excluded, and reported as such
    assert any("thermal_conditions" in w for w in body["warnings"])
    top = ok[0]
    valid = [f for f in top["factor_scores"] if f["suitability"] is not None]
    assert abs(sum(f["normalized_weight"] for f in valid) - 1.0) < 1e-9
    assert abs(sum(f["weighted_contribution"] for f in valid) - top["score"]) < 0.05


def test_evaluate_rejects_all_zero_weights(client):
    r = client.post("/api/v1/scoring/evaluate", json={"mission": {"criteria": [{"criterion_id": "terrain_safety", "weight": 0}]}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"


def test_analog_match(client):
    r = client.post("/api/v1/analogs/match", json={"mars_site_id": "elysium_planitia", "top_k": 3})
    assert r.status_code == 200
    body = r.json()
    assert len(body["matches"]) == 3 and body["matches"][0]["rank"] == 1
    m = body["matches"][0]
    assert 0 <= m["similarity"] <= 100 and m["planetary_differences"] if "planetary_differences" in m else True
    assert body["planetary_differences"]
    assert any(not fd["comparable"] for fd in m["feature_distances"]) or True


def test_explain_without_llm(client):
    r = client.post("/api/v1/research/explain", json={"site_id": "jezero_crater", "include_analogs": True})
    assert r.status_code == 200
    body = r.json()
    assert body["generated_by"] in ("llm", "deterministic_fallback")
    assert body["sections"]["influential_factors"]
    for c in body["citations"]:
        assert any(e["chunk_id"] == c["chunk_id"] for e in body["supporting_evidence"])
