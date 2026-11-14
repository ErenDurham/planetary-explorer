"""Retrieval engine and corpus ingestion. No network: the ingestion test feeds a
tiny fixture page through the extractor by replacing `fetch`, and the
real-corpus test is skipped when data/documents/chunks.jsonl is absent."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

from app.services.retrieval_engine import Retriever, geo_terms
from scripts import ingest_documents as ing

FIXTURE_HTML = b"""<html><head><title>Jezero Test Page</title>
<meta property="article:published_time" content="2021-02-18T12:00:00Z"/></head>
<body><header><nav>Home | Missions | Search</nav></header>
<main>
<h1>Perseverance at Jezero Crater</h1>
<p>Jezero Crater is a 45-kilometre impact crater on the western edge of Isidis Planitia. Perseverance landed there in
February 2021 to study an ancient lake basin and the river delta that fed it. The delta preserves clay and carbonate minerals.</p>
<p>The rover's regional setting includes the Nili Fossae troughs, where olivine and carbonate bearing units are exposed, and the
crater floor shows basaltic lava flows. Scientists chose the site for its lacustrine and deltaic deposits, which are considered
among the best places on Mars to look for preserved signs of past microbial life.</p>
<p>Elsewhere, Gale Crater was explored by Curiosity, whose findings at Yellowknife Bay showed a habitable fluvio-lacustrine
environment. The two craters are often compared in discussions of landing site selection and sample return planning.</p>
<p>This paragraph pads the page past the minimum size so the extractor does not mistake it for a JavaScript shell. It repeats
the mission context: Perseverance collects rock cores and regolith samples in sealed tubes for potential return to Earth by
a later mission, and it carried the Ingenuity helicopter as a technology demonstration during its first year on Mars.</p>
<p>A final paragraph on the regional slope statistics: MOLA topography at 16 pixels per degree gives regional slopes of
about one degree inside the footprint, which is a regional figure and says nothing about metre-scale hazards.</p>
</main><footer>Contact | Privacy</footer></body></html>"""


def test_ingest_fixture_html_produces_chunks_with_metadata(monkeypatch):
    monkeypatch.setattr(ing, "fetch", lambda url: (FIXTURE_HTML, "text/html; charset=utf-8", url))
    spec = ing.DocSpec("fixture_jezero", "https://example.test/jezero", "Test Institution", geographic_relevance=["jezero_crater"], expect=["Jezero"])
    aliases, regions = ing.load_geo_aliases()
    doc, chunks, reason = ing.process(spec, aliases, regions, offline=False)
    assert reason is None and doc is not None
    assert doc["title"] == "Jezero Test Page" and doc["publication_date"] == "2021-02-18"
    assert "Home | Missions" not in doc["text"] and "Contact | Privacy" not in doc["text"]  # chrome dropped
    assert chunks, "chunking produced nothing"
    required = {"chunk_id", "document_id", "title", "institution", "url", "publication_date", "geographic_relevance", "text", "char_start", "char_end", "retrieved_at"}
    for c in chunks:
        assert required <= set(c)
        assert c["document_id"] == "fixture_jezero" and c["institution"] == "Test Institution"
        assert doc["text"][c["char_start"]:c["char_end"]] == c["text"]
        assert len(c["text"]) <= 1000 or "\n\n" not in c["text"]  # over 1000 only when one paragraph is itself that long
        assert "jezero_crater" in c["geographic_relevance"] and "Nili Fossae / Isidis basin rim" in c["geographic_relevance"]
    assert any("gale_crater" in c["geographic_relevance"] for c in chunks), "alias detection should tag the Gale paragraph"
    assert len(chunks) >= 2 and chunks[1]["char_start"] < chunks[0]["char_end"], "consecutive chunks overlap"


def test_js_shell_is_rejected_not_invented(monkeypatch):
    monkeypatch.setattr(ing, "fetch", lambda url: (b"<html><body><div id=app></div><script>render()</script></body></html>", "text/html", url))
    spec = ing.DocSpec("shell", "https://example.test/shell", "X", expect=["Jezero"])
    aliases, regions = ing.load_geo_aliases()
    doc, chunks, reason = ing.process(spec, aliases, regions, offline=False)
    assert doc is None and chunks == [] and "too short" in reason


def test_chunker_bounds_and_overlap():
    text = "\n\n".join(f"Paragraph {i} " + " ".join(f"word{j}" for j in range(60)) + "." for i in range(20))
    spans = ing.chunk_text(text)
    assert spans[0][0] == 0 and spans[-1][1] == len(text)
    lengths = [e - s for s, e in spans]
    assert max(lengths) <= 1000 and sum(lengths) / len(lengths) > 500
    for (s1, e1), (s2, e2) in zip(spans, spans[1:]):
        assert s1 < s2 <= e1 and 100 <= e1 - s2 <= 200  # ~150 chars of overlap, always advancing


def test_crossref_record_has_date_and_no_invented_abstract():
    body = json.dumps({"message": {"DOI": "10.1000/x", "title": ["A Paper"], "author": [{"given": "A", "family": "B"}],
                                   "container-title": ["J. Test"], "publisher": "Pub", "issued": {"date-parts": [[2015, 4]]}}}).encode()
    text, title, date, inst = ing.crossref_to_document(body, ing.DocSpec("d", "u", "Crossref", kind="crossref"))
    assert title == "A Paper" and date == "2015-04" and inst == "J. Test / Pub"
    assert "Abstract" not in text and "not the paper's full text" in text


def _write_chunks(path: Path, chunks: list[dict]) -> None:
    path.write_text("\n".join(json.dumps(c) for c in chunks) + "\n")


def _chunk(cid: str, text: str, geo: list[str]) -> dict:
    return {"chunk_id": cid, "document_id": cid.split("#")[0], "title": "T", "institution": "I", "url": "https://example.test/" + cid,
            "publication_date": None, "geographic_relevance": geo, "text": text, "char_start": 0, "char_end": len(text), "retrieved_at": "2026-01-01"}


def test_metadata_boost_prefers_matching_geography(tmp_path):
    same = "regional slope statistics for the landing ellipse computed from gridded topography at a coarse baseline"
    p = tmp_path / "chunks.jsonl"
    _write_chunks(p, [_chunk("a#001", same, ["gale_crater"]), _chunk("b#001", same, ["jezero_crater"])])
    r = Retriever(p, backend="local")
    assert r.status() == "ok"
    plain = r.retrieve("regional slope landing ellipse", k=2)
    assert [e.chunk_id for e in plain] == ["a#001", "b#001"]  # tie broken by order, no boost
    boosted = r.retrieve("regional slope landing ellipse", k=2, geographic_relevance=["jezero_crater"])
    assert boosted[0].chunk_id == "b#001" and boosted[0].score > boosted[1].score


def test_term_reranker_boosts_text_mentions(tmp_path):
    p = tmp_path / "chunks.jsonl"
    _write_chunks(p, [_chunk("a#001", "the crater floor shows basaltic lava flows and dunes", []),
                      _chunk("b#001", "the Jezero crater floor shows basaltic lava flows and dunes", [])])
    r = Retriever(p, backend="local")
    out = r.retrieve("crater floor basaltic lava", k=2, geographic_relevance=["jezero_crater"])
    assert out[0].chunk_id == "b#001"
    assert geo_terms(["jezero_crater", "Nili Fossae / Isidis basin rim"]) == {"jezero", "nili", "fossae", "isidis"}


def test_empty_index_is_unavailable(tmp_path):
    r = Retriever(tmp_path / "missing.jsonl", backend="local")
    assert r.status() == "unavailable" and r.retrieve("anything") == []


def test_chroma_backend_falls_back_to_local_when_missing(tmp_path, monkeypatch):
    monkeypatch.setitem(sys.modules, "chromadb", None)  # makes `import chromadb` raise ImportError
    p = tmp_path / "chunks.jsonl"
    _write_chunks(p, [_chunk("a#001", "olivine and carbonate bearing units in Nili Fossae", ["jezero_crater"])])
    r = Retriever(p, backend="chroma-default", index_dir=tmp_path / "idx")
    assert r.backend == "local" and r.backend_error and "chromadb" in r.backend_error
    assert r.status() == "ok" and r.retrieve("carbonate olivine")[0].chunk_id == "a#001"


REAL = Path(__file__).resolve().parents[1] / "data" / "documents" / "chunks.jsonl"


@pytest.mark.skipif(not REAL.exists(), reason="committed corpus not present")
def test_real_corpus_returns_jezero_chunk_first():
    r = Retriever(REAL, backend="local")
    assert r.status() == "ok" and len(r.chunks) >= 100
    out = r.retrieve("Jezero Crater ancient lake delta Perseverance landing site", k=5, geographic_relevance=["jezero_crater", "Nili Fossae / Isidis basin rim"])
    assert out, "no evidence returned"
    top = out[0]
    assert "jezero_crater" in top.geographic_relevance or "jezero" in top.excerpt.lower()
    assert top.url.startswith("http") and top.institution and top.chunk_id
    assert all(o.score is not None for o in out) and out[0].score >= out[-1].score


@pytest.mark.skipif(not REAL.exists(), reason="committed corpus not present")
def test_real_corpus_covers_every_site_and_manifest_is_consistent():
    sites = json.loads((REAL.parents[1] / "mars" / "sites.json").read_text())["sites"]
    tagged = {g for line in REAL.read_text().splitlines() if line.strip() for g in json.loads(line)["geographic_relevance"]}
    for s in sites:
        assert s["id"] in tagged, f"no chunk tagged for {s['id']}"
    manifest = json.loads((REAL.parent / "manifest.json").read_text())
    assert manifest["chunks"] == sum(1 for l in REAL.read_text().splitlines() if l.strip())
    assert manifest["documents_ingested"] >= 15
    for d in manifest["ingested"]:
        assert (REAL.parent / "corpus" / f"{d['document_id']}.json").exists()
