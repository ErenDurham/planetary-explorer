"""Analog engine tests: the distance/similarity algebra, its invariants, the
edge cases, and the behaviour on the committed Mars and Earth profiles.
Engine-level tests call analog_engine directly; two HTTP-level tests confirm
the router wiring with real data.
"""
import json

import pytest

from app.models import AnalogWeight
from app.services import analog_engine
from app.services.analog_engine import feature_distance, jaccard_distance, match, match_all
from app.services.data_loader import get_store
from tests.factories import make_candidate, make_site

SPEC = analog_engine.load_spec()
FEATURES = {fs["feature_id"]: fs for fs in SPEC["features"]}
SLOPE, ROUGH, TERRAIN, MINERAL, PRECIP, INSOL = ("slope_regional_median_deg", "roughness_regional_m", "terrain_morphology", "mineralogy_tags",
                                                 "precipitation_mm_day", "insolation_toa_annual_mean_wm2")

MARS_FULL = {SLOPE: 1.0, ROUGH: 100.0, TERRAIN: ["impact_crater", "delta"], MINERAL: ["basalt", "clays"], PRECIP: 0.0, INSOL: 170.0}


def _weights(**kw):
    return [AnalogWeight(feature_id=k, weight=v) for k, v in kw.items()]


def _default_weights() -> dict[str, float]:
    return {fid: fs["default_weight"] for fid, fs in FEATURES.items()}


# --- Jaccard properties ------------------------------------------------------------
def test_jaccard_properties():
    assert jaccard_distance(["a", "b"], ["a", "b"]) == 0.0                      # identity
    assert jaccard_distance(["a", "b"], ["b", "a"]) == 0.0                      # order-free
    assert jaccard_distance(["a", "a", "b"], ["b", "a"]) == 0.0                 # multiset-insensitive
    assert jaccard_distance(["a"], ["b"]) == 1.0                                # disjoint
    assert jaccard_distance(["a", "b"], ["b", "c"]) == pytest.approx(1 - 1 / 3)
    assert jaccard_distance([], []) == 0.0                                      # both empty: nothing to disagree about
    assert jaccard_distance(["a"], []) == 1.0                                   # one empty: fully different
    for a, b in ((["a", "b"], ["b", "c"]), (["x"], ["y", "z"]), ([], ["q"])):
        assert jaccard_distance(a, b) == jaccard_distance(b, a)                 # symmetry
        assert 0.0 <= jaccard_distance(a, b) <= 1.0


# --- feature distance algebra ------------------------------------------------------
def test_numeric_distance_is_scaled_absolute_difference_and_symmetric():
    _, mp = make_site("m", {SLOPE: 1.0})
    _, ep = make_candidate("e", {SLOPE: 2.5})
    d1 = feature_distance(FEATURES[SLOPE], mp, ep, 10)
    d2 = feature_distance(FEATURES[SLOPE], ep, mp, 10)  # swap sides
    assert d1.comparable and d1.distance == pytest.approx(1.5 / FEATURES[SLOPE]["scale"])
    assert d1.distance == pytest.approx(d2.distance)
    assert d1.scale == FEATURES[SLOPE]["scale"] and d1.unit == "deg" and d1.method == "scaled_absolute_difference"
    assert "d 1.00" in d1.note and "Mars 1.00 deg vs Earth 2.50 deg" in d1.note


def test_tag_distance_note_names_shared_and_unshared_tags():
    _, mp = make_site("m", {TERRAIN: ["impact_crater", "delta", "crater_floor"]})
    _, ep = make_candidate("e", {TERRAIN: ["impact_crater", "polar_desert"]})
    d = feature_distance(FEATURES[TERRAIN], mp, ep, 20)
    assert d.comparable and d.distance == pytest.approx(1 - 1 / 4)
    assert d.note == "shared 1 of 4 distinct tags (impact crater); Mars only: crater floor, delta; Earth only: polar desert; Jaccard distance 0.75"
    assert d.mars_value == ["impact_crater", "delta", "crater_floor"] and d.earth_value == ["impact_crater", "polar_desert"]


@pytest.mark.parametrize("mars,earth,where", [(None, 1.0, "the Mars site"), (1.0, None, "the Earth site"), (None, None, "both")])
def test_missing_on_either_side_is_noncomparable_never_imputed(mars, earth, where):
    _, mp = make_site("m", {SLOPE: mars})
    _, ep = make_candidate("e", {SLOPE: earth})
    d = feature_distance(FEATURES[SLOPE], mp, ep, 10)
    assert not d.comparable and d.distance is None and d.normalized_weight is None and d.contribution is None
    assert where in d.note and "not estimated" in d.note


def test_earth_profile_absent_is_noncomparable():
    _, mp = make_site("m", {SLOPE: 1.0})
    d = feature_distance(FEATURES[SLOPE], mp, None, 10)
    assert not d.comparable and "the Earth site" in d.note


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), "1.0", True])
def test_nonfinite_or_nonnumeric_values_are_noncomparable(bad):
    _, mp = make_site("m", {SLOPE: 1.0})
    _, ep = make_candidate("e", {SLOPE: 1.0})
    ep.get(SLOPE).value = bad
    d = feature_distance(FEATURES[SLOPE], mp, ep, 10)
    assert not d.comparable and d.distance is None
    json.dumps(d.model_dump(), allow_nan=False)


@pytest.mark.parametrize("scale", [0, -1.0, None, float("nan")])
def test_zero_or_invalid_scale_is_noncomparable_not_a_crash(scale):
    fs = dict(FEATURES[SLOPE], scale=scale)
    _, mp = make_site("m", {SLOPE: 1.0})
    _, ep = make_candidate("e", {SLOPE: 2.0})
    d = feature_distance(fs, mp, ep, 10)
    assert not d.comparable and "scale" in d.note


def test_tag_feature_holding_prose_is_noncomparable_not_split_into_characters():
    _, mp = make_site("m", {TERRAIN: "impact crater with a delta"})
    _, ep = make_candidate("e", {TERRAIN: ["impact_crater"]})
    d = feature_distance(FEATURES[TERRAIN], mp, ep, 20)
    assert not d.comparable and "lists of labels" in d.note


def test_unknown_method_is_noncomparable():
    fs = dict(FEATURES[SLOPE], method="cosine")
    _, mp = make_site("m", {SLOPE: 1.0})
    _, ep = make_candidate("e", {SLOPE: 2.0})
    assert not feature_distance(fs, mp, ep, 10).comparable


# --- match-level invariants ------------------------------------------------------------
def test_identical_profiles_give_similarity_100_and_distance_0():
    s, mp = make_site("m", MARS_FULL)
    c, ep = make_candidate("twin", MARS_FULL)
    m = match(s, mp, c, ep, _default_weights())
    assert m.distance == 0.0 and m.similarity == 100.0
    assert all(f.distance == 0.0 for f in m.feature_distances if f.comparable)
    assert m.important_differences == []
    assert any(x.startswith("Shared landforms") for x in m.shared_characteristics)
    assert any(x.startswith("Shared minerals") for x in m.shared_characteristics)


def test_normalised_weights_sum_to_one_over_comparable_features_and_similarity_formula():
    s, mp = make_site("m", MARS_FULL)
    c, ep = make_candidate("e", {SLOPE: 2.0, ROUGH: 250.0, TERRAIN: ["playa"], MINERAL: ["basalt"], PRECIP: None, INSOL: 400.0})
    m = match(s, mp, c, ep, _default_weights())
    comp = [f for f in m.feature_distances if f.comparable and f.raw_weight > 0]
    assert {f.feature_id for f in comp} == {SLOPE, ROUGH, TERRAIN, MINERAL}  # precipitation missing, insolation weight 0
    assert sum(f.normalized_weight for f in comp) == pytest.approx(1.0)
    wsum = sum(f.raw_weight for f in comp)
    D = sum(f.raw_weight * f.distance for f in comp) / wsum
    assert m.distance == pytest.approx(D, abs=1e-4)
    assert m.similarity == pytest.approx(100 / (1 + D), abs=0.01)
    assert 0 < m.similarity <= 100
    assert m.completeness_fraction == pytest.approx(4 / 5)  # five weighted features, four comparable
    for f in m.feature_distances:
        if f.comparable and f.raw_weight > 0:
            assert f.contribution == pytest.approx(f.normalized_weight * f.distance)
        else:
            assert f.normalized_weight is None and f.contribution is None
    precip = next(f for f in m.feature_distances if f.feature_id == PRECIP)
    assert any(precip.label in x for x in m.noncomparable_variables)
    assert any("pressure" in x.lower() for x in m.noncomparable_variables)  # fundamental disclosures always present


def test_similarity_is_in_zero_to_100_and_decreases_with_distance():
    s, mp = make_site("m", {SLOPE: 0.0, ROUGH: 0.0})
    sims = []
    for k in range(0, 6):
        c, ep = make_candidate(f"c{k}", {SLOPE: 1.5 * k, ROUGH: 100.0 * k})
        m = match(s, mp, c, ep, {SLOPE: 1, ROUGH: 1})
        assert m.distance == pytest.approx(k) and 0 < m.similarity <= 100
        sims.append(m.similarity)
    assert sims == sorted(sims, reverse=True) and sims[0] == 100.0


def test_zero_total_weight_gives_similarity_none_with_warning():
    s, mp = make_site("m", MARS_FULL)
    cands = [make_candidate("a", MARS_FULL), make_candidate("b", MARS_FULL)]
    matches, warnings = match_all(s, mp, cands, _weights(**{fid: 0 for fid in FEATURES}), 5)
    assert all(m.similarity is None and m.distance is None and m.rank is None for m in matches)
    assert any("All analog weights are zero" in w for w in warnings)
    assert [m.earth_candidate.id for m in matches] == ["a", "b"], "still deterministic by id"


def test_candidate_with_nothing_comparable_is_unranked_and_warned():
    s, mp = make_site("m", MARS_FULL)
    cands = [make_candidate("bare", None), make_candidate("ok", MARS_FULL)]
    matches, warnings = match_all(s, mp, cands, None, 5)
    assert [m.earth_candidate.id for m in matches] == ["ok", "bare"]
    assert matches[0].rank == 1 and matches[0].similarity == 100.0
    assert matches[1].rank is None and matches[1].similarity is None and matches[1].completeness_fraction == 0.0
    assert any("bare" in w and "can be compared" in w for w in warnings)
    assert any("no processed profile" in x for x in matches[1].limitations)
    json.dumps([m.model_dump() for m in matches], allow_nan=False)


def test_mars_site_lacking_tag_lists_still_matches_on_numeric_features():
    s, mp = make_site("m", {SLOPE: 1.0, ROUGH: 100.0})
    c, ep = make_candidate("e", {SLOPE: 1.0, ROUGH: 100.0, TERRAIN: ["playa"], MINERAL: ["halite"]})
    matches, warnings = match_all(s, mp, [(c, ep)], None, 5)
    m = matches[0]
    assert m.similarity is not None and m.rank == 1
    tag_fds = [f for f in m.feature_distances if f.feature_id in (TERRAIN, MINERAL)]
    assert all(not f.comparable and "the Mars site" in f.note for f in tag_fds)
    assert m.shared_characteristics and m.important_differences == []  # no tag diff claimed when one side has no tags
    assert warnings == []


def test_top_k_larger_than_candidate_count_and_ranks_are_consecutive():
    s, mp = make_site("m", MARS_FULL)
    cands = [make_candidate(f"c{k}", {**MARS_FULL, SLOPE: 1.0 + 0.3 * k}) for k in range(3)]
    matches, _ = match_all(s, mp, cands, None, 20)
    assert len(matches) == 3 and [m.rank for m in matches] == [1, 2, 3]
    assert [m.earth_candidate.id for m in matches] == ["c0", "c1", "c2"]
    matches, _ = match_all(s, mp, cands, None, 1)
    assert len(matches) == 1 and matches[0].earth_candidate.id == "c0"


def test_ties_break_by_candidate_id():
    s, mp = make_site("m", MARS_FULL)
    cands = [make_candidate("zed", MARS_FULL), make_candidate("amy", MARS_FULL), make_candidate("bob", MARS_FULL)]
    matches, _ = match_all(s, mp, cands, None, 5)
    assert [m.earth_candidate.id for m in matches] == ["amy", "bob", "zed"] and [m.rank for m in matches] == [1, 2, 3]


def test_unknown_weight_ids_warn_and_known_overrides_apply():
    s, mp = make_site("m", MARS_FULL)
    c, ep = make_candidate("e", {**MARS_FULL, INSOL: 400.0})
    matches, warnings = match_all(s, mp, [(c, ep)], _weights(bogus=5, insolation_toa_annual_mean_wm2=50), 5)
    assert any("bogus" in w for w in warnings)
    insol = next(f for f in matches[0].feature_distances if f.feature_id == INSOL)
    assert insol.raw_weight == 50 and insol.comparable and insol.normalized_weight is not None


def test_weight_scaling_leaves_similarity_unchanged():
    s, mp = make_site("m", MARS_FULL)
    c, ep = make_candidate("e", {SLOPE: 2.0, ROUGH: 250.0, TERRAIN: ["playa"], MINERAL: ["basalt"], PRECIP: 0.5, INSOL: 400.0})
    base = match(s, mp, c, ep, _default_weights())
    scaled = match(s, mp, c, ep, {k: v * 0.1 for k, v in _default_weights().items()})
    assert base.similarity == scaled.similarity and base.distance == scaled.distance


def test_difference_and_shared_wording_thresholds():
    s, mp = make_site("m", {SLOPE: 1.0, ROUGH: 100.0})
    c, ep = make_candidate("e", {SLOPE: 1.3, ROUGH: 400.0})  # d = 0.2 (close) and d = 3.0 (very different)
    m = match(s, mp, c, ep, {SLOPE: 1, ROUGH: 1})
    assert m.shared_characteristics == ["Regional slope: Mars 1.00 deg vs Earth 1.30 deg (difference 0.30 deg, within half the 1.50 deg comparison scale)"]
    assert m.important_differences == ["Detrended relief: Mars 100 m vs Earth 400 m (difference 300 m, 3.0x the 100 m comparison scale)"]


# --- committed data -----------------------------------------------------------------------
def _real(mars_id: str):
    store = get_store()
    return store.site(mars_id), store.profile(mars_id), [(c, store.earth_profile(c.id)) for c in store.earth_candidates()]


def test_committed_data_every_candidate_fully_comparable_and_deterministic():
    site, prof, cands = _real("elysium_planitia")
    a, w1 = match_all(site, prof, cands, None, 20)
    b, w2 = match_all(site, prof, cands, None, 20)
    assert [(m.earth_candidate.id, m.similarity, m.rank) for m in a] == [(m.earth_candidate.id, m.similarity, m.rank) for m in b]
    assert w1 == [] and len(a) == len(cands) == 7
    for m in a:
        assert m.completeness_fraction == 1.0, "every weighted feature exists on both planets in v1"
        assert 0 < m.similarity <= 100 and m.citations and m.limitations
        assert all(f.note for f in m.feature_distances), "every FeatureDistance.note is informative"
        json.dumps(m.model_dump(), allow_nan=False)


def test_terrain_only_weights_rank_haughton_first_for_jezero():
    """Haughton is the only impact-crater candidate, so with morphology as the
    sole criterion it must lead for Jezero; and the ordering must differ from
    the default-weight ordering, which MDRS leads (it shares clays, carbonates and
    sulfates with Jezero in the literature labels)."""
    site, prof, cands = _real("jezero_crater")
    base, _ = match_all(site, prof, cands, None, 7)
    w = _weights(terrain_morphology=100, slope_regional_median_deg=0, roughness_regional_m=0, mineralogy_tags=0, precipitation_mm_day=0)
    alt, warnings = match_all(site, prof, cands, w, 7)
    assert warnings == []
    assert alt[0].earth_candidate.id == "haughton_crater"
    assert [m.earth_candidate.id for m in alt] != [m.earth_candidate.id for m in base]
    assert base[0].earth_candidate.id == "mdrs_utah"
    terrain = next(f for f in alt[0].feature_distances if f.feature_id == TERRAIN)
    assert terrain.normalized_weight == 1.0 and "impact crater" in terrain.note
    assert any(x.startswith("Shared landforms: impact crater") for x in alt[0].shared_characteristics)
    # with only one comparable feature, similarity is 100/(1+d_terrain) exactly
    assert alt[0].similarity == pytest.approx(100 / (1 + terrain.distance), abs=0.01)


def test_basalt_only_mineralogy_weights_favour_volcanic_candidates_for_elysium():
    site, prof, cands = _real("elysium_planitia")
    w = _weights(mineralogy_tags=100, terrain_morphology=0, slope_regional_median_deg=0, roughness_regional_m=0, precipitation_mm_day=0)
    alt, _ = match_all(site, prof, cands, w, 7)
    assert alt[0].earth_candidate.id in {"holuhraun_iceland", "mauna_kea_summit"}  # both basalt + regolith


# --- HTTP wiring (router owned by Engineer 5; this only confirms the engine is reachable) ----
def test_http_similarity_formula_and_noncomparable_disclosure(client):
    body = client.post("/api/v1/analogs/match", json={"mars_site_id": "elysium_planitia", "top_k": 7}).json()
    assert len(body["matches"]) == 7 and body["analog_spec_version"] == SPEC["version"]
    for m in body["matches"]:
        comp = [f for f in m["feature_distances"] if f["comparable"] and f["raw_weight"] > 0]
        D = sum(f["contribution"] for f in comp)
        assert m["distance"] == pytest.approx(D, abs=1e-3)
        assert m["similarity"] == pytest.approx(100 / (1 + D), abs=0.05)
        assert sum(f["normalized_weight"] for f in comp) == pytest.approx(1.0)
        assert any("pressure" in s.lower() for s in m["noncomparable_variables"])
    sims = [m["similarity"] for m in body["matches"]]
    assert sims == sorted(sims, reverse=True) and [m["rank"] for m in body["matches"]] == list(range(1, 8))


def test_http_custom_weights_and_unknown_weight_warning(client):
    w = [{"feature_id": "terrain_morphology", "weight": 100}, {"feature_id": "slope_regional_median_deg", "weight": 0}, {"feature_id": "roughness_regional_m", "weight": 0},
         {"feature_id": "mineralogy_tags", "weight": 0}, {"feature_id": "precipitation_mm_day", "weight": 0}]
    alt = client.post("/api/v1/analogs/match", json={"mars_site_id": "jezero_crater", "top_k": 7, "weights": w}).json()
    assert alt["matches"][0]["earth_candidate"]["id"] == "haughton_crater" and alt["warnings"] == []
    bad = client.post("/api/v1/analogs/match", json={"mars_site_id": "jezero_crater", "weights": [{"feature_id": "bogus", "weight": 5}]}).json()
    assert any("bogus" in x for x in bad["warnings"])
    assert bad["matches"][0]["similarity"] is not None, "an unknown id is ignored, the defaults still apply"
