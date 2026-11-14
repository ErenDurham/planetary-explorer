"""Evidence digests, study cards, source deduplication, exact chunk
citations, retrieval diversification and stale-cache keys."""
import json

import pytest

from app.models import Citation, EvidenceChunk, Site
from app.services import digest_engine as de
from app.services import explanation_engine as ee
from app.services import llm_client
from app.services.data_loader import get_store
from app.services.retrieval_engine import Retriever, get_retriever
from app.services.text_cleaning import clean_passage, select_sentences, support_overlap

DEBRIS = "Explore Resources | Learn More | NASA/JPL-Caltech | Launch Vehicle: Atlas V | This image shows the rover. Credit: NASA | "
PROSE = ("Jezero Crater holds an ancient lake basin with a well-preserved river delta on its western margin. "
         "The delta deposits contain clays and carbonates that record the crater's aqueous history. ")


def _chunk(cid, doc, text, url, title="Doc"):
    return EvidenceChunk(chunk_id=cid, document_id=doc, title=title, institution="NASA Science", url=url, excerpt=text, geographic_relevance=["jezero_crater"])


@pytest.fixture
def ctx():
    store = get_store()
    site = store.site("jezero_crater")
    prof = store.profile(site.id)
    return site, prof


def test_clean_passage_strips_navigation_captions_and_credits():
    out = clean_passage(DEBRIS + PROSE)
    assert "Explore Resources" not in out and "Launch Vehicle" not in out and "Credit:" not in out and "This image shows" not in out
    assert "river delta" in out
    assert clean_passage("Learn More | Downloads | Share") == ""


def test_support_overlap_is_lexical_only():
    assert support_overlap("delta deposits contain clays and carbonates", PROSE) >= 0.8
    assert support_overlap("basalt plains with no water history", PROSE) < 0.4


def test_extractive_digest_picks_relevant_sentence_and_reports_insufficient(ctx):
    site, prof = ctx
    good = _chunk("a#1", "a", DEBRIS + PROSE, "https://x.test/a")
    noise = _chunk("b#1", "b", "Downloads. Share this page. Launch Vehicle: Atlas V. Featured Video.", "https://x.test/b")
    cits = ee.citations_for([good, noise])
    digests, notes = de.build_digests([good, noise], site, None, "find a safe landing near the delta", cits)
    assert len(digests) == 2
    d0, d1 = digests
    assert d0.support_level in ("supports", "context") and "delta" in d0.what_it_tells_us.lower() and d0.generated_by == "extractive"
    assert d0.chunk_ids == ["a#1"] and d0.citation_ids == ["[C1]"]
    assert d1.support_level == "insufficient" and "Insufficient relevant evidence" in d1.what_it_tells_us
    assert "Credit" not in d0.what_it_tells_us and "Explore" not in d0.what_it_tells_us


def test_digests_group_by_source_url_and_keep_exact_chunk_ids(ctx):
    site, prof = ctx
    chunks = [_chunk("a#1", "a", PROSE, "https://x.test/a#top"), _chunk("a#2", "a", PROSE + "More about the delta.", "https://x.test/a/"), _chunk("c#1", "c", PROSE, "https://x.test/c")]
    cits = ee.citations_for(chunks)
    digests, _ = de.build_digests(chunks, site, None, None, cits)
    assert [d.document_id for d in digests] == ["a", "c"]
    assert digests[0].chunk_ids == ["a#1", "a#2"] and digests[0].citation_ids == ["[C1]", "[C2]"]
    assert digests[1].citation_ids == ["[C3]"]


def test_llm_digest_is_rejected_when_not_grounded_or_wrong_chunks(ctx):
    site, prof = ctx
    chunks = [_chunk("a#1", "a", PROSE, "https://x.test/a"), _chunk("c#1", "c", PROSE, "https://x.test/c")]
    cits = ee.citations_for(chunks)
    good = {"document_id": "a", "chunk_ids": ["a#1"], "purpose_label": "Mission context", "what_it_tells_us": "Jezero holds an ancient lake basin with a preserved river delta on its western margin.",
            "why_it_matters": "Delta deposits are the site's main science target.", "limitation": "Overview only.", "support_level": "supports"}
    wrong_chunk = {**good, "document_id": "c", "chunk_ids": ["a#1"]}
    invented = {**good, "document_id": "c", "chunk_ids": ["c#1"], "what_it_tells_us": "Radiation shielding of 12 cm regolith protects habitats from cosmic rays."}
    digests, notes = de.build_digests(chunks, site, None, None, cits, llm_items=[good, wrong_chunk, invented])
    assert digests[0].generated_by == "llm" and digests[0].chunk_ids == ["a#1"]
    assert digests[1].generated_by == "extractive"
    assert any("cites no passage" in n for n in notes) and any(("not worded" in n or "number" in n) for n in notes)


def test_study_cards_need_motivating_passages_and_relevant_analog(ctx):
    site, prof = ctx
    store = get_store()
    mola = _chunk("m#1", "pds", "The MOLA topographic map at 16 pixels per degree gives elevations relative to the areoid for landing site selection.", "https://x.test/mola", "MOLA MEGDR")
    delta = _chunk("d#1", "lit", PROSE, "https://x.test/lit", "Jezero mineralogy")
    cits = ee.citations_for([mola, delta])
    from app.services import analog_engine
    analogs, _ = analog_engine.match_all(site, prof, [(c, store.earth_profile(c.id)) for c in store.earth_candidates()], None, 7)
    cards, gap = de.build_study_cards(site, prof, None, [mola, delta], analogs, cits, "land near the delta safely")
    assert gap is None and 1 <= len(cards) <= 3 and all(c.kind == "proposed_study" for c in cards)
    terrain = next(c for c in cards if "landing-scale" in c.title)
    assert terrain.motivating_citation_ids == ["[C1]"] and "cannot resolve lander-scale" in terrain.cannot_infer
    aqueous = next(c for c in cards if "past water" in c.title)
    assert aqueous.motivating_citation_ids == ["[C2]"]
    analog_cards = [c for c in cards if c.analog_candidate_id]
    for c in analog_cards:
        a = next(m for m in analogs if m.earth_candidate.id == c.analog_candidate_id)
        assert any("Terrain morphology" in s or "slope" in s.lower() or "relief" in s.lower() for s in a.shared_characteristics)
    # with no passages at all, nothing is proposed and the gap is explicit
    none, gap2 = de.build_study_cards(site, prof, None, [], None, [], None)
    assert none == [] and gap2 and "corpus" in gap2


def test_llm_card_rejected_for_unsupported_claim_or_documented_kind(ctx):
    site, prof = ctx
    mola = _chunk("m#1", "pds", "The MOLA topographic map gives elevations relative to the areoid for landing site selection.", "https://x.test/mola")
    cits = ee.citations_for([mola])
    base = {"kind": "proposed_study", "title": "Test MOLA statistics against landing-scale terrain", "research_question": "Do the MOLA topographic elevations predict landing site hazards at the areoid-relative scale used here?",
            "method": "Compare with HiRISE DTMs.", "why_here": "MOLA map and landing site selection documentation are retrieved.", "motivating_citation_ids": ["[C1]"], "cannot_infer": "Regional statistics only."}
    ok, why = de.accept_llm_card(base, [mola], cits, "")
    assert ok is not None and why is None
    bad, why2 = de.accept_llm_card({**base, "research_question": "Perchlorate toxicity limits greenhouse crop yields", "why_here": "Agriculture matters."}, [mola], cits, "")
    assert bad is None and "support" in why2
    camp, why3 = de.accept_llm_card({**base, "kind": "documented_campaign"}, [mola], cits, "")
    assert camp is None and "documented" in why3
    num, why4 = de.accept_llm_card({**base, "method": "Sample 500 rocks per ellipse."}, [mola], cits, "")
    assert num is None and "number" in why4


def test_explain_endpoint_carries_digests_cards_and_dedups_sources(client):
    body = client.post("/api/v1/research/explain", json={"site_id": "jezero_crater", "include_analogs": True, "objective": "land safely near the delta"}).json()
    urls = [d["url"] for d in body["source_digests"]]
    assert len(urls) == len(set(urls)) and body["source_digests"]
    ev_ids = {e["chunk_id"] for e in body["supporting_evidence"]}
    for d in body["source_digests"]:
        assert set(d["chunk_ids"]) <= ev_ids and d["generated_by"] in ("extractive", "llm") and d["support_level"] in ("supports", "context", "insufficient")
        assert 1 <= len(d["what_it_tells_us"].split()) <= 70 and "Explore Resources" not in d["what_it_tells_us"]
    handles = {c["citation_id"] for c in body["citations"]}
    for card in body["research_studies"]:
        assert card["kind"] == "proposed_study" and set(card["motivating_citation_ids"]) <= handles and card["cannot_infer"]
    assert len(body["research_studies"]) <= 3
    assert all("Proposed study" in line for line in body["sections"]["research_applications"])
    from collections import Counter
    per_doc = Counter(e["document_id"] for e in body["supporting_evidence"])
    assert max(per_doc.values()) <= 2  # retrieval diversification


def test_retriever_max_per_document_and_debris_demotion(tmp_path):
    p = tmp_path / "chunks.jsonl"
    rows = []
    for i in range(4):
        rows.append({"chunk_id": f"a#{i}", "document_id": "a", "title": "A", "institution": "I", "url": "https://x.test/a", "publication_date": None, "geographic_relevance": [],
                     "text": "Jezero delta clays carbonates lake basin landing site " * 3, "char_start": 0, "char_end": 1, "retrieved_at": "2026-01-01"})
    rows.append({"chunk_id": "b#0", "document_id": "b", "title": "B", "institution": "I", "url": "https://x.test/b", "publication_date": None, "geographic_relevance": [],
                 "text": "Jezero delta clays carbonates lake basin landing site.", "char_start": 0, "char_end": 1, "retrieved_at": "2026-01-01"})
    rows.append({"chunk_id": "n#0", "document_id": "n", "title": "N", "institution": "I", "url": "https://x.test/n", "publication_date": None, "geographic_relevance": [],
                 "text": "Jezero delta | Learn More | Downloads | Share | Explore Resources | Jezero delta", "char_start": 0, "char_end": 1, "retrieved_at": "2026-01-01"})
    p.write_text("\n".join(json.dumps(r) for r in rows))
    r = Retriever(p, backend="local")
    out = r.retrieve("Jezero delta clays", k=4)
    docs = [o.document_id for o in out]
    assert docs.count("a") <= 2 and "b" in docs
    assert docs[-1] == "n" or "n" not in docs  # debris ranks last
    undiversified = r.retrieve("Jezero delta clays", k=4, max_per_document=None)
    assert [o.document_id for o in undiversified].count("a") == 4


def test_analog_match_separates_documented_use_from_proposals(client):
    body = client.post("/api/v1/analogs/match", json={"mars_site_id": "jezero_crater", "top_k": 7}).json()
    for m in body["matches"]:
        assert m["research_applications"] == m["documented_analog_use"]
        for s in m["proposed_studies"]:
            assert s["kind"] == "proposed_study" and "not been demonstrated" in s["cannot_infer"] or "no Mars counterpart" in s["cannot_infer"]
        if not m["shared_characteristics"]:
            assert m["proposed_studies"] == []


def test_explanation_cache_key_changes_with_objective_and_evidence(ctx, monkeypatch):
    site, prof = ctx
    monkeypatch.setattr(ee, "_llm_enabled", lambda: True)
    calls = []
    good = json.dumps({k: [] for k in ("favorable", "unfavorable", "risks", "influential_factors", "research_applications", "missing_evidence", "future_investigation")})
    monkeypatch.setattr(ee, "_call_llm", lambda system, user: calls.append(user) or good)
    ee.clear_cache()
    ev1 = [_chunk("a#1", "a", PROSE, "https://x.test/a")]
    ev2 = [_chunk("z#1", "z", PROSE, "https://x.test/z")]
    ee.explain(site, prof, None, ev1, None, None, objective="safe")
    ee.explain(site, prof, None, ev1, None, None, objective="safe")
    assert len(calls) == 1
    ee.explain(site, prof, None, ev1, None, None, objective="solar")   # new objective -> new digest
    ee.explain(site, prof, None, ev2, None, None, objective="solar")   # new evidence -> new digest
    assert len(calls) == 3
    assert "<<<OBJECTIVE" in calls[0] and "document_id=a chunk_id=a#1" in calls[0]
