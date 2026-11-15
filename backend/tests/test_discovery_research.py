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
