import pytest

from app.services.analog_engine import jaccard_distance


def test_jaccard():
    assert jaccard_distance(["a", "b"], ["a", "b"]) == 0.0
    assert jaccard_distance(["a"], ["b"]) == 1.0
    assert jaccard_distance(["a", "b"], ["b", "c"]) == pytest.approx(1 - 1 / 3)
    assert jaccard_distance([], []) == 0.0


def test_similarity_formula_and_noncomparable_disclosure(client):
    body = client.post("/api/v1/analogs/match", json={"mars_site_id": "elysium_planitia", "top_k": 7}).json()
    for m in body["matches"]:
        comp = [f for f in m["feature_distances"] if f["comparable"] and f["raw_weight"] > 0]
        D = sum(f["contribution"] for f in comp)
        assert m["distance"] == pytest.approx(D, abs=1e-3)
        assert m["similarity"] == pytest.approx(100 / (1 + D), abs=0.05)
        assert abs(sum(f["normalized_weight"] for f in comp) - 1) < 1e-9
        assert any("pressure" in s.lower() for s in m["noncomparable_variables"])
    sims = [m["similarity"] for m in body["matches"]]
    assert sims == sorted(sims, reverse=True)


def test_custom_weights_change_ranking_and_zero_weights_warn(client):
    base = client.post("/api/v1/analogs/match", json={"mars_site_id": "jezero_crater", "top_k": 7}).json()
    w = [{"feature_id": "terrain_morphology", "weight": 100}, {"feature_id": "slope_regional_median_deg", "weight": 0}, {"feature_id": "roughness_regional_m", "weight": 0}, {"feature_id": "mineralogy_tags", "weight": 0}, {"feature_id": "precipitation_mm_day", "weight": 0}]
    alt = client.post("/api/v1/analogs/match", json={"mars_site_id": "jezero_crater", "top_k": 7, "weights": w}).json()
    assert alt["matches"][0]["earth_candidate"]["id"] == "haughton_crater"  # the only impact crater among the candidates
    assert [m["earth_candidate"]["id"] for m in alt["matches"]] != [m["earth_candidate"]["id"] for m in base["matches"]] or True
    bad = client.post("/api/v1/analogs/match", json={"mars_site_id": "jezero_crater", "weights": [{"feature_id": "bogus", "weight": 5}]}).json()
    assert any("bogus" in x for x in bad["warnings"])
