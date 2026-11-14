"""Body-aware analog ranking: symmetry with /analogs/match, common feature
basis, unrankable pools, colour positions over the full pool, tie rule."""
import pytest

from app.models import AnalogRankRequest, AnalogWeight
from app.services import analog_rank_engine as are
from app.services.data_loader import get_store


def _rank(**kw):
    return are.rank_pool(AnalogRankRequest(**kw), get_store())


def test_pair_similarity_is_direction_independent_and_matches_match_endpoint(client):
    a = _rank(reference_body="mars", reference_id="jezero_crater")
    b = _rank(reference_body="earth", reference_id="atacama_yungay")
    sa = next(c for c in a.candidates if c.location.id == "atacama_yungay").similarity
    sb = next(c for c in b.candidates if c.location.id == "jezero_crater").similarity
    assert sa == sb and sa is not None
    m = client.post("/api/v1/analogs/match", json={"mars_site_id": "jezero_crater", "top_k": 7}).json()
    assert next(x["similarity"] for x in m["matches"] if x["earth_candidate"]["id"] == "atacama_yungay") == sa
    assert a.candidate_body == "earth" and b.candidate_body == "mars" and a.pool_size == 7 and b.pool_size == 8
    # canonical values regardless of direction
    fd = next(f for f in next(c for c in b.candidates if c.location.id == "jezero_crater").feature_distances if f.feature_id == "slope_regional_median_deg")
    assert fd.mars_value == pytest.approx(1.077, abs=1e-3)


def test_full_pool_rank_and_colour_positions():
    r = _rank(reference_body="earth", reference_id="haughton_crater")
    ranked = [c for c in r.candidates if c.rank is not None]
    assert [c.rank for c in ranked] == list(range(1, len(ranked) + 1)) and r.ranked_count == len(ranked)
    assert ranked[0].rank_color_position == 0.0 and ranked[-1].rank_color_position == 1.0
    dists = [c.distance for c in ranked]
    assert dists == sorted(dists)
    assert abs(sum(r.effective_weights.values()) - 1) < 1e-9 and set(r.effective_weights) == set(r.basis_features)
    assert any(e.feature_id == "insolation_toa_annual_mean_wm2" and "weight is 0" in e.reason for e in r.excluded_features)


def test_single_ranked_candidate_is_position_zero_and_all_zero_weights_unrankable():
    r = _rank(reference_body="mars", reference_id="gale_crater", weights=[AnalogWeight(feature_id=f, weight=0) for f in ("slope_regional_median_deg", "roughness_regional_m", "terrain_morphology", "mineralogy_tags", "precipitation_mm_day")])
    assert r.ranked_count == 0 and all(c.rank is None and c.unrankable_reason for c in r.candidates) and r.warnings
    only_terrain = [AnalogWeight(feature_id=f, weight=(100 if f == "terrain_morphology" else 0)) for f in ("slope_regional_median_deg", "roughness_regional_m", "terrain_morphology", "mineralogy_tags", "precipitation_mm_day", "insolation_toa_annual_mean_wm2")]
    r1 = _rank(reference_body="mars", reference_id="gale_crater", weights=only_terrain)
    assert r1.basis_features == ["terrain_morphology"] and r1.ranked_count == 7
    # ties: Jaccard-only ranking produces equal distances; order is by id, documented
    tied = [c for c in r1.candidates if c.distance == r1.candidates[-1].distance]
    assert [c.location.id for c in tied] == sorted(c.location.id for c in tied) and "candidate id" in r1.tie_rule


def test_common_basis_drops_feature_missing_on_any_candidate(monkeypatch):
    store = get_store()
    prof = store.earth_profile("death_valley")
    m = prof.get("roughness_regional_m")
    original = (m.value, m.is_missing)
    m.value, m.is_missing = None, True
    try:
        r = _rank(reference_body="mars", reference_id="jezero_crater")
        assert "roughness_regional_m" not in r.basis_features
        assert any(e.feature_id == "roughness_regional_m" and "death_valley" in e.reason for e in r.excluded_features)
        assert r.ranked_count == 7  # every candidate still ranked on the common basis
    finally:
        m.value, m.is_missing = original


def test_endpoint_validation_and_request_id(client):
    ok = client.post("/api/v1/analogs/rank", json={"reference_body": "earth", "reference_id": "mdrs_utah", "client_request_id": "x1"}).json()
    assert ok["client_request_id"] == "x1" and ok["reference"]["body"] == "earth" and ok["planetary_differences"]
    assert client.post("/api/v1/analogs/rank", json={"reference_body": "earth", "reference_id": "nope"}).status_code == 404
    assert client.post("/api/v1/analogs/rank", json={"reference_body": "earth", "reference_id": "mdrs_utah", "candidate_body": "earth"}).status_code == 422
