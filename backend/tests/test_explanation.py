"""Explanation engine: deterministic fallback, the LLM path with a mocked
client, citation validation, structured-output parsing, the numeric guard and
the cache. Nothing here touches the network and no API key is needed."""
from __future__ import annotations

import json

import pytest

from app.models import EvidenceChunk, ExplanationSections
from app.services import explanation_engine as ee
from app.services import scoring_engine
from app.services.data_loader import get_store


@pytest.fixture
def ctx():
    store = get_store()
    site = store.site("jezero_crater")
    prof = store.profile("jezero_crater")
    sites = store.sites("mars")
    results, _ = scoring_engine.evaluate(sites, {s.id: store.profile(s.id) for s in sites}, scoring_engine.default_mission())
    result = next(r for r in results if r.site_id == "jezero_crater")
    evidence = [
        EvidenceChunk(chunk_id="docA#001", document_id="docA", title="Perseverance Science", institution="NASA", url="https://example.test/a",
                      geographic_relevance=["jezero_crater"], excerpt="Perseverance is exploring Jezero Crater, an ancient lake basin with a river delta.", score=0.9),
        EvidenceChunk(chunk_id="docB#004", document_id="docB", title="MOLA MEGDR label", institution="NASA PDS", url="https://example.test/b",
                      geographic_relevance=[], excerpt="MAP_RESOLUTION = 16 pixels per degree; elevations relative to the areoid.", score=0.5),
    ]
    return site, prof, result, evidence


@pytest.fixture
def llm_on(monkeypatch):
    """Pretend a key is configured; tests replace _call_llm themselves."""
    ee.clear_cache()
    ee._last_llm_error = None
    monkeypatch.setattr(ee, "_llm_enabled", lambda: True)
    yield
    ee.clear_cache()
    ee._last_llm_error = None


def _good_sections(result, extra: str = "") -> str:
    f = result.factor_scores[0]
    return json.dumps({
        "favorable": [f"{f.label} is {f.feature_value} {f.unit}, which the scoring spec treats as fully suitable [C1]." + extra],
        "unfavorable": [],
        "risks": ["Regional slopes cannot certify lander-scale hazards."],
        "influential_factors": [f"{f.label} carries the largest weight."],
        "research_applications": ["The delta deposits are the focus of sample collection [C1]."],
        "missing_evidence": ["No thermal measurements are available for this profile."],
        "future_investigation": ["Acquire HiRISE DTMs over the ellipse."],
    })


def test_without_key_is_deterministic(ctx, monkeypatch):
    monkeypatch.setattr(ee, "_llm_enabled", lambda: False)
    site, prof, result, evidence = ctx
    out = ee.explain(site, prof, result, evidence, None, None)
    assert out.generated_by == "deterministic_fallback" and out.model is None and out.cached is False
    assert out.sections.influential_factors and out.sections.missing_evidence
    assert [c.chunk_id for c in out.citations] == ["docA#001", "docB#004"]
    assert ee.llm_status() == "unconfigured"


def test_llm_path_parses_valid_json_and_caches(ctx, llm_on, monkeypatch):
    site, prof, result, evidence = ctx
    calls = []
    monkeypatch.setattr(ee, "_call_llm", lambda system, user: calls.append(user) or _good_sections(result))
    out = ee.explain(site, prof, result, evidence, None, "What about the delta?")
    assert out.generated_by == "llm" and out.model == ee.get_settings().llm_model and out.cached is False
    assert out.sections.favorable[0].endswith("[C1].")
    assert not any("unverifiable" in l for l in out.limitations) and not any("No citations" in l for l in out.limitations)
    assert ee.llm_status() == "configured"
    # prompt hygiene: question and evidence are delimited and labelled untrusted
    user = calls[0]
    assert "<<<USER_QUESTION" in user and "UNTRUSTED" in user and "<<<EVIDENCE" in user and "[C1] Perseverance Science" in user
    assert '"score"' in user  # the structured result is passed read-only
    # cache hit: same site, mission, analogs flag and question -> cached=True and no second call
    again = ee.explain(site, prof, result, evidence, None, "What about the delta?")
    assert again.cached is True and len(calls) == 1 and again.sections == out.sections
    # a different question is a different key
    ee.explain(site, prof, result, evidence, None, "Different question")
    assert len(calls) == 2


def test_invalid_json_falls_back_and_marks_error(ctx, llm_on, monkeypatch):
    site, prof, result, evidence = ctx
    monkeypatch.setattr(ee, "_call_llm", lambda system, user: "Sure! Here is my narrative, not JSON.")
    out = ee.explain(site, prof, result, evidence, None, None)
    assert out.generated_by == "deterministic_fallback"
    assert any("invalid answer" in l or "unavailable" in l for l in out.limitations)
    assert ee.llm_status() == "error"


def test_llm_exception_falls_back(ctx, llm_on, monkeypatch):
    site, prof, result, evidence = ctx

    def boom(system, user):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(ee, "_call_llm", boom)
    out = ee.explain(site, prof, result, evidence, None, None)
    assert out.generated_by == "deterministic_fallback" and any("RuntimeError" in l for l in out.limitations)
    assert ee.llm_status() == "error"


def test_invalid_citation_handles_are_stripped(ctx, llm_on, monkeypatch):
    site, prof, result, evidence = ctx
    monkeypatch.setattr(ee, "_call_llm", lambda system, user: _good_sections(result, " Also see [C99] and [C7]."))
    out = ee.explain(site, prof, result, evidence, None, None)
    assert out.generated_by == "llm"
    text = "\n".join(out.sections.favorable)
    assert "[C99]" not in text and "[C7]" not in text and "[C1]" in text
    assert "2 citation handles that could not be checked were removed" in out.limitations


def test_no_citations_adds_note(ctx, llm_on, monkeypatch):
    site, prof, result, evidence = ctx
    body = json.loads(_good_sections(result))
    body = {k: [s.replace(" [C1]", "") for s in v] for k, v in body.items()}
    monkeypatch.setattr(ee, "_call_llm", lambda system, user: json.dumps(body))
    out = ee.explain(site, prof, result, evidence, None, None)
    assert out.generated_by == "llm" and "No citations were produced. See the supporting evidence." in out.limitations


def test_numeric_guard_rejects_invented_number(ctx, llm_on, monkeypatch):
    site, prof, result, evidence = ctx
    monkeypatch.setattr(ee, "_call_llm", lambda system, user: _good_sections(result, " The crater is 123456.7 km wide."))
    out = ee.explain(site, prof, result, evidence, None, None)
    assert out.generated_by == "deterministic_fallback"
    assert any("123456.7" in l and "numbers that are not in the data" in l for l in out.limitations)


def test_check_numbers_accepts_formatting_and_rounding():
    payload = {"elevation": -2129.0, "contribution": 38.88888888, "count": 289, "resolution": "~3.7 km cells (16 ppd)"}
    assert ee.check_numbers("elevation -2,129 m contributing 38.9 of the points over 289 cells at 3.7 km and 16 ppd [C1]", payload) == []
    assert ee.check_numbers("about 2129.0 metres", payload) == []
    assert ee.check_numbers("a slope of 1.5 deg", payload) == ["1.5"]
    assert ee.check_numbers("38.89 points", payload) == []        # correct rounding to two decimals
    assert ee.check_numbers("38.95 points", payload) == ["38.95"]  # wrong at the precision written


def test_validate_citations_unit():
    sec = ExplanationSections(favorable=["Good [C1] and bad [C3]."], risks=["[C2]"])
    allowed = ee.citations_for([EvidenceChunk(chunk_id="x#1", document_id="x", title="t", institution="i", url="https://e.test", excerpt="e")])
    cleaned, notes = ee.validate_citations(sec, allowed)
    assert cleaned.favorable == ["Good [C1] and bad."] and cleaned.risks == []
    assert notes == ["2 citation handles that could not be checked were removed"]


def test_question_is_truncated_in_prompt(ctx):
    site, prof, result, evidence = ctx
    msg = ee.build_user_message(site, prof, result, evidence, None, "x" * 2000)
    start = msg.index("<<<USER_QUESTION\n") + len("<<<USER_QUESTION\n")
    end = msg.index("\nUSER_QUESTION>>>")
    assert end - start == ee.QUESTION_MAX_CHARS


def test_health_reports_llm_state(client):
    body = client.get("/api/v1/health").json()
    assert body["services"]["llm"] in ("configured", "unconfigured", "error")
    assert body["services"]["retrieval"] in ("ok", "unavailable")


def test_research_applications_are_proposals_not_scraped_excerpts(ctx):
    site, prof, result, evidence = ctx
    evidence[0].excerpt = "Explore Resources. View raw images. Launch Vehicle: example."
    out = ee.deterministic(site, prof, result, evidence, None)
    assert out.sections.research_applications
    assert all(line.startswith("Proposed") for line in out.sections.research_applications)
    assert "Explore Resources" not in " ".join(out.sections.research_applications)
    assert "has not been performed" in " ".join(out.sections.research_applications)
