"""Provider switch: a free local model through Ollama (schema-constrained,
repeatable, limited to mission interpretation by default) or the Claude API;
the app's startup default always uses the fast keyword reading; relative paths
in .env resolve from the repo root."""
import json
from pathlib import Path

import httpx
import pytest

from app.config.settings import REPO_DIR, Settings
from app.models import InterpretRequest
from app.services import evidence, llm_client
from app.services import objective_engine as oe

EXCL = ["thermal_conditions"]


@pytest.fixture(autouse=True)
def _fresh_cache():
    oe.clear_cache()
    yield
    oe.clear_cache()


@pytest.fixture
def ollama(monkeypatch):
    s = llm_client.get_settings()
    monkeypatch.setattr(s, "llm_provider", "ollama")
    monkeypatch.setattr(s, "ollama_model", "gemma4:26b-a4b-it-qat")
    monkeypatch.setattr(s, "ollama_url", "http://localhost:11434/")
    monkeypatch.setattr(s, "ollama_features", "interpret")
    monkeypatch.setattr(s, "ollama_think", False)
    monkeypatch.setattr(llm_client, "_last_error", None)   # failures recorded by other tests
    return s


class _Stream:
    """Stand-in for `httpx.stream(...)`: yields Ollama's NDJSON lines."""
    def __init__(self, status: int, lines: list[dict], sink: dict | None = None, delay: float = 0.0):
        self.status_code, self._lines, self._sink, self._delay = status, lines, sink, delay

    def __call__(self, method, url, json=None, timeout=None):
        if self._sink is not None:
            self._sink.update(method=method, url=url, body=json, timeout=timeout)
        return self

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("bad", request=httpx.Request("POST", "http://x"), response=httpx.Response(self.status_code))

    def iter_lines(self):
        import json as _json
        import time as _time
        for line in self._lines:
            if self._delay:
                _time.sleep(self._delay)
            yield _json.dumps(line)


def _tokens(*pieces: str, done_reason: str = "stop") -> list[dict]:
    return [{"message": {"content": p}, "done": False} for p in pieces] + [{"message": {"content": ""}, "done": True, "done_reason": done_reason}]


def test_ollama_request_is_schema_constrained_repeatable_and_kept_loaded(ollama, monkeypatch):
    sent = {}
    monkeypatch.setattr(httpx, "stream", _Stream(200, _tokens('{"ok"', ': true}'), sent))
    out = llm_client.call_json("sys", "user", {"type": "object", "properties": {"n": {"type": "integer", "minimum": 0, "maximum": 100}}})
    assert out == '{"ok": true}'
    b = sent["body"]
    assert sent["method"] == "POST" and sent["url"] == "http://localhost:11434/api/chat"
    assert b["model"] == "gemma4:26b-a4b-it-qat" and b["stream"] is True and b["think"] is False
    assert b["format"] == {"type": "object", "properties": {"n": {"type": "integer"}}}   # unsupported bounds stripped; validated in code
    assert b["options"]["temperature"] == 0 and b["options"]["num_ctx"] >= 8192 and b["keep_alive"]
    assert [m["role"] for m in b["messages"]] == ["system", "user"]


def test_ollama_failures_say_what_to_do(ollama, monkeypatch):
    monkeypatch.setattr(httpx, "stream", _Stream(404, []))
    with pytest.raises(RuntimeError, match="ollama pull gemma4:26b-a4b-it-qat"):
        llm_client.call_json("s", "u", {"type": "object"})

    def refused(*a, **k):
        raise httpx.ConnectError("refused")
    monkeypatch.setattr(httpx, "stream", refused)
    with pytest.raises(RuntimeError, match="Ollama is not running"):
        llm_client.call_json("s", "u", {"type": "object"})
    monkeypatch.setattr(httpx, "stream", _Stream(200, _tokens('{"a"', done_reason="length")))
    with pytest.raises(RuntimeError, match="truncated"):
        llm_client.call_json("s", "u", {"type": "object"})
    monkeypatch.setattr(httpx, "stream", _Stream(200, [{"error": "model runner has unexpectedly stopped"}]))
    with pytest.raises(RuntimeError, match="unexpectedly stopped"):
        llm_client.call_json("s", "u", {"type": "object"})


def test_provider_gating(ollama, monkeypatch):
    assert llm_client.enabled() and llm_client.enabled("interpret") and not llm_client.enabled("guidance") and not llm_client.enabled("astro")
    monkeypatch.setattr(ollama, "ollama_features", "interpret, astro")
    assert llm_client.enabled("astro")   # Astro chat uses the local model only when listed
    monkeypatch.setattr(ollama, "ollama_features", "interpret")
    assert llm_client.model_name() == "gemma4:26b-a4b-it-qat" and llm_client.status() == "configured"
    monkeypatch.setattr(ollama, "llm_provider", "anthropic")
    monkeypatch.setattr(ollama, "anthropic_api_key", "")
    assert not llm_client.enabled("interpret") and llm_client.status() == "unconfigured"


def test_mission_interpretation_runs_on_the_local_model_but_the_startup_default_does_not(ollama, monkeypatch):
    answer = {"mission_profile": "human",
              "weights": {"terrain_safety": 30, "elevation_suitability": 40, "surface_roughness": 15, "thermal_conditions": 0, "solar_illumination": 15},
              "reasons": {k: "Weighted from the mission and the cited research." for k in ("terrain_safety", "elevation_suitability", "surface_roughness", "thermal_conditions", "solar_illumination")},
              "evidence": {"terrain_safety": ["mass_human"], "elevation_suitability": ["mass_human", "elev_limit_human"], "surface_roughness": ["traverse_human"],
                           "thermal_conditions": [], "solar_illumination": ["irradiance_mars"]},
              "rationale": [], "tradeoffs": [], "unsupported_needs": [], "clarifying_questions": [], "confidence": "medium"}
    calls = []
    monkeypatch.setattr(oe, "_call_llm", lambda system, user, schema: calls.append(1) or json.dumps(answer))
    text = "We want to land on Mars to establish a Research Base."
    r = oe.interpret(InterpretRequest(objective=text, excluded_criteria=EXCL))
    assert r.generated_by == "llm" and r.model == "gemma4:26b-a4b-it-qat" and len(calls) == 1
    assert {s.criterion_id: s.weight for s in r.suggestions}["elevation_suitability"] == 40
    fast = oe.interpret(InterpretRequest(objective=text, excluded_criteria=EXCL, use_llm=False))
    assert fast.generated_by == "rule_based" and len(calls) == 1


def test_relative_paths_in_env_resolve_from_the_repo_root():
    s = Settings(data_dir=Path("backend/data"), vector_index_dir=Path("backend/data/index"))
    assert s.data_dir == REPO_DIR / "backend" / "data" and s.data_dir.is_dir()
    assert Settings(data_dir=Path("/abs/elsewhere")).data_dir == Path("/abs/elsewhere")


def test_an_explicit_exclusion_in_the_text_holds_whatever_the_model_proposes(monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    answer = {"mission_profile": "other",
              "weights": {"terrain_safety": 40, "elevation_suitability": 30, "surface_roughness": 20, "thermal_conditions": 0, "solar_illumination": 10},
              "reasons": {k: "Weighted from the text." for k in ("terrain_safety", "elevation_suitability", "surface_roughness", "thermal_conditions", "solar_illumination")},
              "evidence": {}, "unsupported_needs": [], "confidence": "high"}
    monkeypatch.setattr(oe, "_call_llm", lambda system, user, schema: json.dumps(answer))
    r = oe.interpret(InterpretRequest(objective="Prioritise landing safety over sunlight; ignore solar", excluded_criteria=EXCL))
    by_id = {s.criterion_id: s for s in r.suggestions}
    assert r.generated_by == "llm" and by_id["solar_illumination"].weight == 0
    assert by_id["solar_illumination"].reason == "The objective says to leave this factor out."
    assert any("says to leave it out" in n for n in r.validation_notes)
    assert by_id["terrain_safety"].weight == 40   # everything else is the model's


def test_ollama_timeout_falls_back_and_keep_alive_is_sent_as_ollama_expects(ollama, monkeypatch):
    sent = {}

    def slow(method, url, json=None, timeout=None):
        sent.update(body=json, timeout=timeout)
        raise httpx.ReadTimeout("slow")
    monkeypatch.setattr(httpx, "stream", slow)
    monkeypatch.setattr(ollama, "ollama_keep_alive", "-1")
    monkeypatch.setattr(ollama, "ollama_timeout_s", 30.0)
    with pytest.raises(RuntimeError, match="longer than 30 s"):
        llm_client.call_json("s", "u", {"type": "object"})
    assert sent["body"]["keep_alive"] == -1 and sent["timeout"].read == 30.0
    monkeypatch.setattr(ollama, "ollama_keep_alive", "30m")
    with pytest.raises(RuntimeError):
        llm_client.call_json("s", "u", {"type": "object"})
    assert sent["body"]["keep_alive"] == "30m"


def test_interpret_schema_asks_only_for_what_the_tab_shows():
    req = oe._schema()["required"]
    assert set(req) == {"mission_profile", "weights", "reasons", "evidence", "unsupported_needs", "confidence", "earth_weights", "earth_reasons", "focus_body", "site_guess", "analog_pair"}


def test_one_reading_gives_earth_priorities_on_the_same_factors(monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    ids = ("terrain_safety", "elevation_suitability", "surface_roughness", "thermal_conditions", "solar_illumination")
    answer = {"mission_profile": "rover",
              "weights": {"terrain_safety": 40, "elevation_suitability": 20, "surface_roughness": 30, "thermal_conditions": 0, "solar_illumination": 10},
              "reasons": {k: "Weighted from the text." for k in ids},
              "evidence": {"terrain_safety": ["slope_msl", "relief_msl"], "surface_roughness": ["relief_msl", "rocks_insight", "rocks_mer"], "solar_illumination": ["irradiance_mars"]},
              "unsupported_needs": [], "confidence": "high",
              "earth_weights": {"terrain_safety": 20, "elevation_suitability": 5, "surface_roughness": 50, "thermal_conditions": 40, "solar_illumination": 25},
              "earth_reasons": {"terrain_safety": "Gentle tilt is easy to find.", "surface_roughness": "Delta terrain is bumpy at 30 m scale.",
                                "elevation_suitability": "Elevation barely matters on Earth.", "thermal_conditions": "n/a", "solar_illumination": "Power tests need sun."}}
    monkeypatch.setattr(oe, "_call_llm", lambda system, user, schema: json.dumps(answer))
    r = oe.interpret(InterpretRequest(objective="Send a rover across a rough ancient delta", excluded_criteria=EXCL))
    earth = {e.factor_id: e for e in r.earth_suggestions}
    assert set(earth) == set(ids)                                                   # the same factors as Mars
    assert earth["surface_roughness"].weight == 50 and earth["solar_illumination"].weight == 25
    assert earth["thermal_conditions"].weight == 0                                  # no data: forced to 0 on Earth too
    assert [c.evidence_id for c in earth["terrain_safety"].evidence] == ["slope_msl"]   # Mars citations reused; a relief finding is not a terrain finding
    assert [c.evidence_id for c in earth["surface_roughness"].evidence] == ["relief_msl", "rocks_insight"]  # rocks_mer (2003) is too old
    assert earth["surface_roughness"].reason == "Weighted from the mission."         # stated a number, so dropped
    assert earth["solar_illumination"].reason == "Power tests need sun."


def test_keyword_reading_gives_earth_the_same_factors_with_research():
    r = oe.rule_based(InterpretRequest(objective="Smooth terrain for a rover with solar power", excluded_criteria=EXCL))
    mars = {s.criterion_id: s.weight for s in r.suggestions}
    earth = {e.factor_id: e for e in r.earth_suggestions}
    assert {k: e.weight for k, e in earth.items()} == mars
    assert earth["surface_roughness"].evidence and all(evidence.supports(c.evidence_id, "surface_roughness") for c in earth["surface_roughness"].evidence)


def test_the_timeout_is_a_total_limit_even_while_tokens_keep_arriving(ollama, monkeypatch):
    import time
    monkeypatch.setattr(ollama, "ollama_timeout_s", 0.3)
    monkeypatch.setattr(httpx, "stream", _Stream(200, _tokens(*["x"] * 50), delay=0.02))   # ~1 s of steady tokens
    start = time.monotonic()
    with pytest.raises(RuntimeError, match="longer than 0.3 s"):
        llm_client.call_json("s", "u", {"type": "object"})
    assert time.monotonic() - start < 0.6


def _answer(**extra):
    ids = ("terrain_safety", "elevation_suitability", "surface_roughness", "thermal_conditions", "solar_illumination")
    base = {"mission_profile": "other", "weights": {k: 20 for k in ids}, "reasons": {k: "From the text." for k in ids}, "evidence": {},
            "earth_weights": {k: 20 for k in ids}, "earth_reasons": {k: "From the text." for k in ids}, "unsupported_needs": [], "confidence": "medium"}
    base.update(extra)
    return base


def test_the_model_guesses_direction_and_site_instead_of_asking(monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    monkeypatch.setattr(oe, "_call_llm", lambda system, user, schema: json.dumps(_answer(focus_body="mars", site_guess="haughton_crater")))
    r = oe.interpret(InterpretRequest(objective="Compare the crater on Earth and Mars", excluded_criteria=EXCL))
    ti = r.task_interpretation
    assert ti.task == "analog_site_selection" and ti.focus_body == "mars"       # the model's direction
    assert ti.reference_site and ti.reference_site.id == "haughton_crater"       # the model's site
    assert not ti.direction_options and not ti.unresolved_sites                  # nothing left for the user to answer


def test_without_a_usable_guess_the_common_case_is_assumed(monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    monkeypatch.setattr(oe, "_call_llm", lambda system, user, schema: json.dumps(_answer(focus_body="earth", site_guess="none")))
    ti = oe.interpret(InterpretRequest(objective="Compare the crater on Earth and Mars", excluded_criteria=EXCL)).task_interpretation
    assert ti.task == "analog_site_selection" and ti.focus_body == "earth"
    assert ti.reference_site and ti.reference_site.body == "mars"                # an Earth search needs a Mars reference
    assert not ti.direction_options and not ti.unresolved_sites


def test_the_model_sees_the_site_list_and_may_only_answer_with_its_ids():
    schema = oe._schema()
    assert "gale_crater" in schema["properties"]["site_guess"]["enum"] and "none" in schema["properties"]["site_guess"]["enum"]
    assert "Gale" in oe.system_prompt() and "Never ask the user to clarify" in oe.system_prompt()
