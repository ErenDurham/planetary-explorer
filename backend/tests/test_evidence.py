"""The research registry behind the mission priorities: only NASA or
peer-reviewed sources, every displayed number traceable to a verbatim quote,
every criterion and hard constraint covered, and the model held to it."""
import json
import re
from urllib.parse import urlparse

import pytest

from app.models import InterpretRequest
from app.services import analog_check, evidence, llm_client
from app.services import objective_engine as oe
from app.services.scoring_engine import default_mission, load_spec

EXCL = ["thermal_conditions"]
TRUSTED_HOSTS = {"doi.org", "ntrs.nasa.gov", "nssdc.gsfc.nasa.gov", "www.nasa.gov"}
_NUM = re.compile(r"\d+(?:\.\d+)?")


@pytest.fixture(autouse=True)
def _fresh_cache():
    oe.clear_cache()
    yield
    oe.clear_cache()


def _nums(text: str) -> set[float]:
    return {float(n) for n in _NUM.findall(text)}


def test_sources_are_nasa_or_peer_reviewed_with_trusted_links():
    reg = evidence.registry()
    for s in reg["sources"]:
        assert s["kind"] in ("nasa", "peer_reviewed"), s["source_id"]
        assert urlparse(s["url"]).scheme == "https" and urlparse(s["url"]).hostname in TRUSTED_HOSTS, s["url"]
        assert s["cite"] and s["title"] and s["venue"] and s["verified_from"].startswith("https://")
    assert any(s["kind"] == "nasa" for s in reg["sources"]) and any(s["kind"] == "peer_reviewed" for s in reg["sources"])


def test_every_number_in_a_fact_comes_from_its_verbatim_quote():
    for e in evidence.registry()["evidence"]:
        missing = _nums(e["fact"]) - _nums(" ".join(e["quotes"]))
        assert not missing, f"{e['evidence_id']}: {sorted(missing)} not in the quoted source text"


def test_registry_references_are_consistent_and_cover_every_factor_and_constraint():
    reg = evidence.registry()
    sources = {s["source_id"] for s in reg["sources"]}
    criteria = {c["criterion_id"] for c in load_spec()["criteria"]}
    constraints = {c.constraint_id for c in default_mission().hard_constraints}
    ids = [e["evidence_id"] for e in reg["evidence"]]
    assert len(ids) == len(set(ids))
    for e in reg["evidence"]:
        assert e["source_id"] in sources
        assert set(e["criteria"]) <= criteria and set(e["constraints"]) <= constraints
        assert e["criteria"] or e["constraints"] or e["sites"]
        assert set(e["sites"]) <= set(analog_check.earth_ids())
        assert set(e["missions"]) <= {"lander", "rover", "human", "any"} and e["missions"]
    for cid in criteria:
        assert evidence.for_criterion(cid, "other"), f"no research for {cid}"
    assert set(evidence.for_constraints()) == constraints


def test_for_criterion_prefers_the_mission_type():
    human = evidence.for_criterion("elevation_suitability", "human")
    assert human[0].evidence_id == "elev_limit_human"
    lander = evidence.for_criterion("terrain_safety", "lander")
    assert lander[0].evidence_id in {"slope_insight", "slope_mer"}
    c = human[0]
    assert c.url.startswith("https://") and c.cite and c.quotes and c.source_kind in ("nasa", "peer_reviewed")


def test_rule_reader_reads_the_mission_type_and_attaches_research():
    r = oe.rule_based(InterpretRequest(objective="We want to land on Mars to establish a Research Base.", excluded_criteria=EXCL))
    assert r.mission_profile == "human" and r.evidence_version == evidence.version()
    by_id = {s.criterion_id: s for s in r.suggestions}
    assert by_id["elevation_suitability"].evidence and by_id["solar_illumination"].evidence
    assert {"max_elevation", "latitude_band"} <= set(r.constraint_evidence)
    assert oe.mission_profile("Send a rover to traverse the delta") == "rover"
    assert oe.mission_profile("A stationary seismic lander") == "lander"
    assert oe.mission_profile("Study the dunes") == "other"


def test_llm_path_keeps_only_registry_citations_for_that_factor_and_strips_numbers(monkeypatch):
    monkeypatch.setattr(llm_client, "enabled", lambda feature=None: True)
    monkeypatch.setattr(llm_client, "model_name", lambda: "mock-model")
    answer = {
        "mission_profile": "human",
        "weights": {"terrain_safety": 30, "elevation_suitability": 40, "surface_roughness": 15, "thermal_conditions": 0, "solar_illumination": 15},
        "reasons": {"terrain_safety": "Large crewed landers need benign terrain.", "elevation_suitability": "Heavy landers need 40 t of drag.",
                    "surface_roughness": "Crews traverse far from the lander.", "thermal_conditions": "No data.", "solar_illumination": "Power matters."},
        "evidence": {"terrain_safety": ["slope_msl", "irradiance_mars", "not_real", "mass_human"],   # irradiance is not a terrain finding; mass_human (2006) is too old
                     "elevation_suitability": ["elev_limit_human", "pressure_mars", "elev_msl", "elev_insight", "elev_limit_human"],
                     "surface_roughness": ["traverse_human"], "thermal_conditions": [], "solar_illumination": ["irradiance_mars"]},
        "rationale": ["Crewed base."], "tradeoffs": [], "unsupported_needs": [], "clarifying_questions": [], "confidence": "medium",
    }
    seen = {}
    monkeypatch.setattr(oe, "_call_llm", lambda system, user, schema: seen.update(system=system, schema=schema) or json.dumps(answer))
    r = oe.interpret(InterpretRequest(objective="We want to land on Mars to establish a Research Base.", excluded_criteria=EXCL))
    by_id = {s.criterion_id: s for s in r.suggestions}
    assert r.generated_by == "llm" and r.mission_profile == "human"
    assert [c.evidence_id for c in by_id["terrain_safety"].evidence] == ["slope_msl"]
    assert [c.evidence_id for c in by_id["elevation_suitability"].evidence] == ["elev_limit_human", "pressure_mars", "elev_msl"]  # capped at 3
    assert by_id["thermal_conditions"].evidence == [] and by_id["thermal_conditions"].weight == 0
    assert any("citation(s) were removed" in n for n in r.validation_notes)
    assert "40 t" not in by_id["elevation_suitability"].reason and any("stated numbers" in n for n in r.validation_notes)
    assert {"max_elevation", "latitude_band"} <= set(r.constraint_evidence)
    # the model sees the registry and may only answer with its ids
    assert "elev_limit_human" in seen["system"] and "Golombek et al., 2017" in seen["system"]
    assert "mass_human" not in seen["system"] and "Golombek et al., 2003" not in seen["system"]   # older than 15 years
    assert seen["schema"]["properties"]["evidence"]["properties"]["terrain_safety"]["items"]["enum"] == list(evidence.items())


def test_interpret_schema_uses_only_keywords_structured_outputs_accepts():
    dumped = json.dumps(oe._schema())
    for kw in ("minimum", "maximum", "maxItems", "minLength", "maxLength"):
        assert f'"{kw}"' not in dumped
    assert llm_client.api_schema({"type": "object", "properties": {"minimum": {"type": "integer", "minimum": 0, "maximum": 9}},
                                  "minItems": 2}) == {"type": "object", "properties": {"minimum": {"type": "integer"}}}


class _FakeMessages:
    def __init__(self, sink):
        self.sink = sink

    def create(self, **params):
        self.sink.append(params)

        class Block:
            type = "text"
            text = '{"ok": true}'

        class Resp:
            stop_reason = "end_turn"
            content = [Block()]
        return Resp()


def test_call_json_uses_the_current_model_with_fallback_effort_cache_and_room_to_think(monkeypatch):
    anthropic = pytest.importorskip("anthropic")
    sent: list[dict] = []

    class FakeClient:
        def __init__(self, **kwargs):
            self.messages = _FakeMessages(sent)
            self.beta = type("Beta", (), {"messages": _FakeMessages(sent)})()
    monkeypatch.setattr(anthropic, "Anthropic", FakeClient)
    settings = llm_client.get_settings()
    monkeypatch.setattr(settings, "llm_model", "claude-opus-5-5")
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    assert llm_client.call_json("sys", "user", {"type": "object", "properties": {"n": {"type": "integer", "minimum": 0}}}, max_tokens=300) == '{"ok": true}'
    p = sent[0]
    assert p["model"] == "claude-opus-5-5" and p["max_tokens"] >= 16000
    assert p["fallbacks"] == "default" and p["betas"] == ["server-side-fallback-2026-07-01"]
    assert p["output_config"]["effort"] == "medium" and "minimum" not in json.dumps(p["output_config"]["format"]["schema"])
    assert p["system"][0]["cache_control"] == {"type": "ephemeral"}


def test_only_sources_from_the_last_fifteen_years_are_used():
    cutoff = evidence.cutoff_year()
    sources = {s["source_id"]: s for s in evidence.registry()["sources"]}
    used = {e["source_id"] for e in evidence.active()}
    assert used and all(isinstance(sources[s]["year"], int) and sources[s]["year"] >= cutoff for s in used)
    assert "golombek2003_mer" not in used and "braun_manning2006" not in used
    assert not ({"slope_mer", "rocks_mer", "mass_human", "elev_heritage"} & set(evidence.items()))
    block = evidence.prompt_block()
    assert "Golombek et al., 2003" not in block and "Braun & Manning" not in block
    assert not evidence.supports("slope_mer", "terrain_safety")
