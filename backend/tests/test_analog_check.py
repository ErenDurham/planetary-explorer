"""The Earth <-> Mars cross-reference behind the priorities: measured data from
the profiles (never the model's numbers), recent Earth-analog research, the
model's choice of pair when valid, and a sensible pair without the model."""
import json

import pytest

from app.models import InterpretRequest
from app.services import analog_check, evidence, llm_client
from app.services import objective_engine as oe
from app.services.data_loader import get_store

EXCL = ["thermal_conditions"]


@pytest.fixture(autouse=True)
def _fresh_cache():
    oe.clear_cache()
    yield
    oe.clear_cache()


def _measured(profile, feature):
    v, _ = get_store().feature_value(profile, feature)
    return round(float(v), 2)


def test_comparison_uses_measured_profile_data_and_the_analog_scales():
    c = analog_check.check("atacama_yungay", "jezero_crater", "rules")
    store = get_store()
    slope = next(f for f in c.factors if f.criterion_id == "terrain_safety")
    assert slope.earth_value == _measured(store.earth_profile("atacama_yungay"), "slope_regional_median_deg")
    assert slope.mars_value == _measured(store.profile("jezero_crater"), "slope_regional_median_deg")
    # "comparable" = what the Earth ranking and Explore's analog view call close or
    # moderately different: within the analog spec's scale (slope 1.5 deg, relief 100 m)
    assert slope.tolerance == 1.5 and slope.comparable == (slope.difference <= 1.5)
    relief = next(f for f in c.factors if f.criterion_id == "surface_roughness")
    assert relief.tolerance == 100.0
    # elevation and sunlight are reported but never called comparable across planets
    for cid in ("elevation_suitability", "solar_illumination"):
        f = next(x for x in c.factors if x.criterion_id == cid)
        assert f.comparable is None and "compared" in f.note.lower()


def test_a_large_difference_is_not_comparable():
    c = analog_check.check("mauna_kea_summit", "gale_crater", "rules")
    relief = next(f for f in c.factors if f.criterion_id == "surface_roughness")
    assert relief.difference > 100 and relief.comparable is False and relief.note.startswith("Not comparable")


def test_earth_sites_carry_only_recent_research_and_say_when_there_is_none():
    for cid in analog_check.earth_ids():
        for r in analog_check.check(cid, "jezero_crater", "rules").research:
            year = next(s["year"] for s in evidence.registry()["sources"] if s["cite"] == r.cite)
            assert year >= evidence.cutoff_year()
    assert analog_check.check("atacama_yungay", "jezero_crater", "rules").research    # NASA ARADS, Warren-Rhodes et al.
    assert analog_check.check("haughton_crater", "jezero_crater", "rules").research == []   # no source in the last 15 years


def test_the_model_chooses_the_pair_and_sees_the_data_to_cross_reference(monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    ids = ("terrain_safety", "elevation_suitability", "surface_roughness", "thermal_conditions", "solar_illumination")
    answer = {"mission_profile": "rover", "weights": {k: 20 for k in ids}, "reasons": {k: "From the text." for k in ids}, "evidence": {},
              "earth_weights": {k: 20 for k in ids}, "earth_reasons": {k: "From the text." for k in ids}, "unsupported_needs": [], "confidence": "high",
              "focus_body": "mars", "site_guess": "none", "analog_pair": {"earth": "atacama_yungay"}}
    seen = {}
    monkeypatch.setattr(oe, "_call_llm", lambda system, user, schema: seen.update(system=system, schema=schema) or json.dumps(answer))
    r = oe.interpret(InterpretRequest(objective="A rover to drill for signs of life", excluded_criteria=EXCL))
    assert r.analog_check.chosen_by == "llm"
    # the model picks the proven Earth site; the Mars site is computed: the one most similar to it
    assert r.analog_check.earth_site_id == "atacama_yungay"
    assert r.analog_check.mars_site_id == analog_check.closest_mars("atacama_yungay")
    assert "slope_regional_median_deg" in seen["system"] and "atacama_yungay" in seen["system"] and "Cross-reference" in seen["system"]
    assert "analog_atacama_drill" in seen["system"]                       # Earth research is in front of the model
    assert seen["schema"]["properties"]["analog_pair"]["properties"]["earth"]["enum"] == analog_check.earth_ids()
    assert "mars" not in seen["schema"]["properties"]["analog_pair"]["properties"]


def test_an_invalid_pair_falls_back_to_research_and_data(monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    ids = ("terrain_safety", "elevation_suitability", "surface_roughness", "thermal_conditions", "solar_illumination")
    answer = {"mission_profile": "rover", "weights": {k: 20 for k in ids}, "reasons": {k: "x" for k in ids}, "evidence": {},
              "earth_weights": {k: 20 for k in ids}, "earth_reasons": {k: "x" for k in ids}, "unsupported_needs": [], "confidence": "high",
              "focus_body": "mars", "site_guess": "none", "analog_pair": {"earth": "nowhere"}}
    monkeypatch.setattr(oe, "_call_llm", lambda system, user, schema: json.dumps(answer))
    c = oe.interpret(InterpretRequest(objective="A rover traverse", excluded_criteria=EXCL)).analog_check
    assert c.chosen_by == "rules" and c.earth_site_id in analog_check.earth_ids()
    assert c.mars_site_id == analog_check.closest_mars(c.earth_site_id)


def test_the_keyword_reading_also_cross_references():
    r = oe.rule_based(InterpretRequest(objective="Find Mars sites resembling Haughton", excluded_criteria=EXCL))
    assert r.analog_check and r.analog_check.earth_site_id == "haughton_crater"   # the named reference
    assert r.analog_check.mars_site_id == analog_check.closest_mars("haughton_crater")


def test_a_mars_site_named_in_the_text_is_the_one_compared(monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    ids = ("terrain_safety", "elevation_suitability", "surface_roughness", "thermal_conditions", "solar_illumination")
    answer = {"mission_profile": "rover", "weights": {k: 20 for k in ids}, "reasons": {k: "x" for k in ids}, "evidence": {},
              "earth_weights": {k: 20 for k in ids}, "earth_reasons": {k: "x" for k in ids}, "unsupported_needs": [], "confidence": "high",
              "focus_body": "earth", "site_guess": "none", "analog_pair": {"earth": "mauna_kea_summit"}}
    monkeypatch.setattr(oe, "_call_llm", lambda system, user, schema: json.dumps(answer))
    c = oe.interpret(InterpretRequest(objective="Find an Earth field site to test a rover for Elysium Planitia", excluded_criteria=EXCL)).analog_check
    assert c.mars_site_id == "elysium_planitia" and c.earth_site_id == "mauna_kea_summit"


def test_closest_mars_is_the_top_of_the_full_analog_ranking():
    from app.models.analog_rank import AnalogRankRequest
    from app.services.analog_rank_engine import rank_pool
    for cid in analog_check.earth_ids():
        ranked = rank_pool(AnalogRankRequest(reference_body="earth", reference_id=cid), get_store())
        assert analog_check.closest_mars(cid) == next(c.location.id for c in ranked.candidates if c.rank == 1)


def test_shared_landforms_and_minerals_come_from_both_profiles():
    c = analog_check.check("holuhraun_iceland", "elysium_planitia", "rules")
    assert c.shared_landforms == ["lava_plain"] and c.shared_minerals == ["basalt"]
