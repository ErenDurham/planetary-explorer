"""Mission reading time limit: the local model stops at the first check point
(30 s in production) once both the Mars and the Earth priorities are usable,
otherwise it runs to the hard limit (60 s) and the app fills any gap with best
guesses. The tests scale the seconds down."""
import json
import threading
import time

import httpx
import pytest

from app.models import InterpretRequest
from app.services import llm_client
from app.services import objective_engine as oe
from app.services.partial_json import parse_partial
from tests.test_llm_providers import EXCL, _Stream, _tokens, ollama  # noqa: F401 - fixture

IDS = ("terrain_safety", "elevation_suitability", "surface_roughness", "thermal_conditions", "solar_illumination")


@pytest.fixture(autouse=True)
def _fresh_cache():
    oe.clear_cache()
    yield
    oe.clear_cache()


def _full_answer() -> dict:
    return {"mission_profile": "rover",
            "weights": {"terrain_safety": 40, "elevation_suitability": 20, "surface_roughness": 30, "thermal_conditions": 0, "solar_illumination": 10},
            "reasons": {k: "From the text." for k in IDS}, "evidence": {},
            "earth_weights": {"terrain_safety": 10, "elevation_suitability": 5, "surface_roughness": 60, "thermal_conditions": 0, "solar_illumination": 25},
            "earth_reasons": {k: "Earth reason." for k in IDS},
            "unsupported_needs": [], "confidence": "high", "focus_body": "mars", "analog_pair": {"earth": "atacama_desert"}, "site_guess": "none"}


def _cut_before(key: str) -> str:
    """The streamed text of a full answer, stopped just as `key` begins."""
    text = json.dumps(_full_answer())
    return text[: text.index(f'"{key}"') + len(key) // 2]


# ---- partial JSON --------------------------------------------------------
def test_a_cut_off_answer_keeps_only_finished_values():
    assert parse_partial('{"weights": {"a": 40, "b": 2') == {"weights": {"a": 40}}        # "2" may be a cut-off "25"
    assert parse_partial('{"a": 1, "r": {"x": "Gentle sl') == {"a": 1}                    # an unfinished sentence is dropped
    assert parse_partial('{"e": ["s1", "s') == {"e": ["s1"]}
    assert parse_partial("") == {} and parse_partial('{"mission_pro') == {}


def test_good_enough_needs_mars_weights_and_reasons_and_earth_weights():
    assert oe.good_enough(_cut_before("earth_reasons"))
    assert not oe.good_enough(_cut_before("earth_weights"))     # Earth still missing
    assert not oe.good_enough(_cut_before("reasons"))           # Mars reasons still missing


# ---- the client's two-step limit ----------------------------------------
def _pieces(text: str, size: int = 8) -> list[str]:
    return [text[i:i + size] for i in range(0, len(text), size)]


def test_stops_at_the_check_point_once_both_planets_are_usable(ollama, monkeypatch):
    text = json.dumps(_full_answer())
    cut = text.index('"earth_reasons"')
    # usable after the first part, then the model would keep writing for ~4 s more
    monkeypatch.setattr(httpx, "stream", _Stream(200, _tokens(*_pieces(text[:cut]), *[" "] * 400, *_pieces(text[cut:])), delay=0.01))
    start = time.monotonic()
    out, complete = llm_client.call_json_within("s", "u", {}, ready_s=0.05, limit_s=10.0, ready=oe.good_enough)
    assert not complete and oe.good_enough(out)
    assert '"site_guess"' not in out and time.monotonic() - start < 2.0   # it did not wait for the rest


def test_keeps_going_past_the_check_point_until_the_limit_when_a_planet_is_missing(ollama, monkeypatch):
    text = json.dumps(_full_answer())
    head = text[: text.index('"earth_weights"')]
    monkeypatch.setattr(httpx, "stream", _Stream(200, _tokens(*_pieces(head), *["   "] * 400), delay=0.002))
    start = time.monotonic()
    out, complete = llm_client.call_json_within("s", "u", {}, ready_s=0.05, limit_s=0.4, ready=oe.good_enough)
    took = time.monotonic() - start
    assert not complete and out.startswith(head[:40])
    assert 0.38 < took < 0.6                                    # ran to the hard limit, not the check point


def test_the_hard_limit_holds_while_waiting_for_a_slow_token(ollama, monkeypatch):
    class Stuck(_Stream):
        def __init__(self):
            super().__init__(200, [])
            self._closed = threading.Event()

        def iter_lines(self):
            yield json.dumps({"message": {"content": '{"mission_profile": "rover", '}, "done": False})
            self._closed.wait(10)                                # the model goes quiet
            raise httpx.ReadError("closed")

        def close(self):
            self._closed.set()

    monkeypatch.setattr(httpx, "stream", Stuck())
    start = time.monotonic()
    out, complete = llm_client.call_json_within("s", "u", {}, ready_s=0.05, limit_s=0.3, ready=oe.good_enough)
    assert not complete and out.startswith('{"mission_profile"')
    assert time.monotonic() - start < 0.6


def test_a_finished_answer_is_complete(ollama, monkeypatch):
    monkeypatch.setattr(httpx, "stream", _Stream(200, _tokens('{"ok"', ": true}")))
    assert llm_client.call_json_within("s", "u", {}, ready_s=5, limit_s=10, ready=oe.good_enough) == ('{"ok": true}', True)


# ---- the mission reader fills gaps with guesses -----------------------------
def _interpret_with(monkeypatch, text: str, objective: str = "Send a rover across rough terrain"):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    monkeypatch.setattr(oe, "_call_llm", lambda system, user, schema: (text, False))
    return oe.interpret(InterpretRequest(objective=objective, excluded_criteria=EXCL))


def test_missing_earth_priorities_are_guessed_from_mars(monkeypatch):
    r = _interpret_with(monkeypatch, _cut_before("earth_weights"))
    mars = {s.criterion_id: s.weight for s in r.suggestions}
    earth = {e.factor_id: e for e in r.earth_suggestions}
    assert r.generated_by == "llm" and mars["terrain_safety"] == 40          # the model's Mars priorities are kept
    assert {k: e.weight for k, e in earth.items()} == mars
    assert earth["surface_roughness"].reason == oe.EARTH_GUESS_REASON
    assert any("time limit" in n for n in r.validation_notes)
    assert any("were ready" in n for n in _interpret_with(monkeypatch, _cut_before("earth_reasons"), "A different rover mission").validation_notes)


def test_missing_mars_factors_are_guessed_from_the_mission_keywords(monkeypatch):
    text = json.dumps(_full_answer())
    cut = text[: text.index('"surface_roughness"', text.index('"weights"'))]   # only two Mars weights arrived
    r = _interpret_with(monkeypatch, cut)
    by_id = {s.criterion_id: s for s in r.suggestions}
    assert r.generated_by == "llm" and by_id["terrain_safety"].weight == 40 and by_id["elevation_suitability"].weight == 20
    keywords = {s.criterion_id: s.weight for s in oe.rule_based(InterpretRequest(objective="Send a rover across rough terrain", excluded_criteria=EXCL)).suggestions}
    assert by_id["surface_roughness"].weight == keywords["surface_roughness"]
    assert all(s.reason for s in r.suggestions) and all(e.reason for e in r.earth_suggestions)
    assert len(r.earth_suggestions) == len(IDS)


def test_nothing_usable_by_the_limit_falls_back_to_a_guess_not_a_blank(monkeypatch):
    r = _interpret_with(monkeypatch, '{"mission_profile": "rov', objective="Plan a mission")
    assert r.generated_by == "rule_based" and r.suggestions and r.earth_suggestions
    text = " ".join([*r.rationale, *(s.reason for s in r.suggestions)]).lower()
    assert "no supported" not in text and "did not mention" not in text and "best guess" in text


def test_a_failed_reading_is_not_replayed_when_the_same_mission_is_sent_again(monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    calls = []

    def flaky(system, user, schema):
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("local model took longer than 60 s")
        return json.dumps(_full_answer())
    monkeypatch.setattr(oe, "_call_llm", flaky)
    req = InterpretRequest(objective="I want to land on mars with smooth terrain", excluded_criteria=EXCL)
    assert oe.interpret(req).generated_by == "rule_based"
    second = oe.interpret(req)
    assert second.generated_by == "llm" and not second.cached and len(calls) == 2
    assert oe.interpret(req).cached                                  # a good answer is still remembered
