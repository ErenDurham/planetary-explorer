import json
import pytest
from app.services import discovery_engine, discovery_research


@pytest.fixture
def notebook(monkeypatch,tmp_path):
    monkeypatch.setattr(discovery_research,"record_path",lambda run,candidate:tmp_path/run/(candidate+".json"))
    rid=discovery_engine.capabilities().runs[0].run_id
    return rid,"region-03-03"


def url(notebook):
    rid,cid=notebook
    return f'/api/v1/discovery/runs/{rid}/candidates/{cid}/research'


def test_desktop_review_never_implies_literature_review_and_get_is_read_only(client,notebook):
    before=(discovery_engine.root()/notebook[0]/"run.json").read_bytes()
    d=client.get(url(notebook)).json()
    assert d["record"]["status"]==d["candidate"]["research_status"]=="unresearched"
    assert d["candidate"]["novelty"]["review_status"]=="desktop_reviewed"
    assert d["record"]["updated_at"] is None
    assert len(d["research_questions"])>=5 and len(d["search_tasks"])>=5
    assert "background" in " ".join(d["limitations"]).lower()
    assert before==(discovery_engine.root()/notebook[0]/"run.json").read_bytes()


def test_saved_status_is_persistent_candidate_scoped_and_visible_in_rank(client,notebook):
    r=client.post(url(notebook),json={"status":"in_progress","notes":"Checking published geological maps and prior analog studies."})
    assert r.status_code==200 and r.json()["updated_at"]
    assert client.get(url(notebook)).json()["record"]["status"]=="in_progress"
    ranked=client.post('/api/v1/discovery/rank',json={"run_id":notebook[0]}).json()
    assert next(c for c in ranked["candidates"] if c["id"]==notebook[1])["research_status"]=="in_progress"
    assert client.get(url((notebook[0],"region-00-00"))).json()["record"]["status"]=="unresearched"


def test_reviewed_requires_summary_and_direct_or_contradictory_source(client,notebook):
    assert client.post(url(notebook),json={"status":"literature_reviewed"}).status_code==422
    finding={"title":"Regional geological context","url":"https://www.nasa.gov/","finding":"This source is regional context rather than direct evidence for the footprint.","scope":"regional_background"}
    payload={"status":"literature_reviewed","notes":"Reviewed the literature and identified remaining geological and field validation gaps.","findings":[finding]}
    assert client.post(url(notebook),json=payload).status_code==422
    # This checks an analyst's record, not automatic factual verification of the URL.
    finding["scope"]="contradictory"
    result=client.post(url(notebook),json=payload)
    assert result.status_code==200 and result.json()["status"]=="literature_reviewed"
    d=client.get(url(notebook)).json()
    assert "analyst supplied" in " ".join(d["limitations"]).lower()
    assert "field validation" in " ".join(d["limitations"]).lower()


def test_notebook_rejects_unsafe_urls_and_unknown_candidates(client,notebook):
    for value in ["javascript:alert(1)","file:///etc/passwd","https://user:pass@example.com"]:
        r=client.post(url(notebook),json={"status":"in_progress","findings":[{"title":"Source title","url":value,"finding":"A sufficiently detailed research finding.","scope":"regional_background"}]})
        assert r.status_code==422
    assert client.post(url((notebook[0],"unknown")),json={"status":"in_progress"}).status_code==404


def test_unavailable_library_stays_an_evidence_gap_not_a_review(client,notebook,monkeypatch):
    class Empty:
        def retrieve(self,*args,**kwargs):return []
    monkeypatch.setattr(discovery_research,"get_retriever",lambda:Empty())
    d=client.get(url(notebook)).json()
    assert d["retrieval_status"]=="unavailable" and d["background_evidence"]==[]
    assert d["record"]["status"]=="unresearched"


def test_malformed_notebook_fails_without_claiming_a_completed_review(client,notebook):
    path=discovery_research.record_path(*notebook);path.parent.mkdir(parents=True);path.write_text('{bad json')
    r=client.get(url(notebook))
    assert r.status_code==503 and r.json()["error"]["code"]=="data_unavailable"


def test_brief_export_is_read_only_deterministic_and_honest(client, notebook, monkeypatch):
    def forbidden():
        raise AssertionError("Export must not retrieve background literature")
    monkeypatch.setattr(discovery_research, "get_retriever", forbidden)
    endpoint = url(notebook) + "/export"
    first = client.get(endpoint)
    assert first.status_code == 200
    data = first.json()
    assert data == client.get(endpoint).json()
    assert data["record"]["status"] == "unresearched"
    assert data["record"]["updated_at"] is None
    assert not discovery_research.record_path(*notebook).exists()
    assert "draft" in data["markdown"].lower()
    assert "not the current UI ranking" in " ".join(data["limitations"])
    assert data["discovery"]["provenance"]
    assert data["discovery"]["reference_profile"]
    assert "candidate_research" not in data["discovery"]["validation"]


def test_brief_includes_saved_contradictions_without_changing_status(client, notebook):
    payload = {"status": "literature_reviewed",
        "notes": "Reviewed candidate evidence and found reasons this proposed analogy may not transfer.",
        "findings": [{"title": "Contradictory observation", "url": "https://example.org/study",
            "finding": "An analyst records a contradiction requiring independent verification.", "scope": "contradictory"}]}
    saved = client.post(url(notebook), json=payload).json()
    brief = client.get(url(notebook) + "/export").json()
    assert brief["record"] == saved
    assert payload["notes"] in brief["markdown"]
    assert "https://example.org/study" in brief["markdown"]
    assert "contradictory" in brief["markdown"]
    assert client.get(url((notebook[0], "unknown")) + "/export").status_code == 404
    other = discovery_research.record_path(notebook[0], "region-00-00")
    other.parent.mkdir(parents=True, exist_ok=True)
    other.write_text("broken unrelated notebook")
    assert client.get(url(notebook) + "/export").status_code == 200
    discovery_research.record_path(*notebook).write_text("broken selected notebook")
    assert client.get(url(notebook) + "/export").status_code == 503


def test_failed_atomic_save_preserves_previous_notebook(client, notebook, monkeypatch):
    original = client.post(url(notebook), json={"status": "in_progress", "notes": "Original saved evidence."}).json()
    def fail_replace(*args):
        raise OSError("Storage full")
    monkeypatch.setattr(discovery_research.os, "replace", fail_replace)
    response = client.post(url(notebook), json={"status": "in_progress", "notes": "New unsaved evidence."})
    assert response.status_code == 503
    assert "could not be saved" in response.json()["error"]["message"]
    assert discovery_research.get_record(*notebook).model_dump() == original
    assert not list(discovery_research.record_path(*notebook).parent.glob("*.tmp"))
