"""Semantic task reading: direction, bodies, references, ambiguity, analog preferences."""
from app.models import InterpretRequest
from app.services import objective_engine as oe
from app.services.task_interpreter import interpret_task


def test_mars_landing_objective_is_landing_screening_on_mars():
    t = interpret_task("Find a safe landing site on Mars with reliable solar energy")
    assert t.task == "landing_screening" and t.focus_body == "mars" and t.mission_destination == "mars" and t.reference_site is None


def test_earth_test_site_for_a_mars_mission_focuses_earth_without_changing_destination():
    t = interpret_task("Find an Earth field site to test a rover for Elysium Planitia")
    assert t.task == "analog_site_selection" and t.focus_body == "earth" and t.mission_destination == "mars"
    assert t.reference_site and t.reference_site.body == "mars" and t.reference_site.id == "elysium_planitia"
    assert {a.feature_id: a.weight for a in t.analog_suggestions}["slope_regional_median_deg"] > 25  # mobility emphasis
    assert sum(a.weight for a in t.analog_suggestions) == 100


def test_mars_sites_resembling_an_earth_site():
    t = interpret_task("Find Mars sites resembling Haughton")
    assert t.task == "analog_site_selection" and t.focus_body == "mars" and t.reference_site.id == "haughton_crater" and t.reference_site.body == "earth"


def test_compare_wording_is_ambiguous_and_offers_both_directions():
    t = interpret_task("Compare Earth and Mars geology")
    assert t.task == "ambiguous" and t.focus_body is None and len(t.direction_options) == 2
    assert {d.focus_body for d in t.direction_options} == {"earth", "mars"}


def test_partial_site_mention_yields_selector_not_coordinates():
    t = interpret_task("Test mineral spectroscopy at the crater")
    assert t.unresolved_sites and t.unresolved_sites[0].matched_text == "the crater" and len(t.unresolved_sites[0].options) >= 10
    assert t.reference_site is None
    assert {a.feature_id: a.weight for a in t.analog_suggestions}["mineralogy_tags"] >= 30


def test_analog_weights_never_include_elevation_or_thermal():
    for text in ("rover mobility test site on Earth", "warm low-elevation analog", "Find a dry Earth analog for Jezero"):
        ids = {a.feature_id for a in interpret_task(text).analog_suggestions}
        assert "elevation_median_m" not in ids and "surface_temperature_mean_c" not in ids and "insolation_toa_annual_mean_wm2" not in ids


def test_interpret_response_carries_task_interpretation(client):
    body = client.post("/api/v1/mission/interpret", json={"objective": "Find Mars sites resembling Haughton", "excluded_criteria": ["thermal_conditions"]}).json()
    ti = body["task_interpretation"]
    assert ti["task"] == "analog_site_selection" and ti["focus_body"] == "mars" and ti["reference_site"]["id"] == "haughton_crater"
    assert body["suggestions"]  # landing weights still proposed separately
    r = oe.rule_based(InterpretRequest(objective="Compare Earth and Mars geology"))
    assert r.task_interpretation and r.task_interpretation.task == "ambiguous"
