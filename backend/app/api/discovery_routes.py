from fastapi import APIRouter, HTTPException
from app.models.discovery import DiscoveryCapabilities, DiscoveryRankRequest, DiscoveryRankResponse, DiscoveryCandidateDetail, DiscoveryExport
from app.services import discovery_engine as engine

router = APIRouter(prefix="/api/v1/discovery", tags=["discovery"])


def invoke(fn, *args):
    try:
        return fn(*args)
    except KeyError as exc:
        raise HTTPException(404, detail={"code":"not_found", "message":f"Unknown discovery ID: {exc.args[0]}"}) from exc
    except engine.DiscoveryUnavailable as exc:
        raise HTTPException(503, detail={"code":"data_unavailable", "message":str(exc)}) from exc


@router.get("/capabilities", response_model=DiscoveryCapabilities)
def capabilities():
    return engine.capabilities()


@router.post("/rank", response_model=DiscoveryRankResponse)
def rank(request: DiscoveryRankRequest):
    return invoke(engine.rank, request)


@router.get("/runs/{run_id}/candidates/{candidate_id}", response_model=DiscoveryCandidateDetail)
def detail(run_id: str, candidate_id: str):
    return invoke(engine.detail, run_id, candidate_id)


@router.get("/runs/{run_id}/export", response_model=DiscoveryExport)
def export(run_id: str):
    return invoke(engine.export, run_id)


from app.models.discovery_research import ResearchDossier, ResearchRecord, ResearchUpdate
from app.services import discovery_research
from fastapi import Query

@router.get("/runs/{run_id}/candidates/{candidate_id}/research", response_model=ResearchDossier)
def research_dossier(run_id: str, candidate_id: str, question: str = Query("", max_length=1000)):
    return invoke(discovery_research.dossier, run_id, candidate_id, question)

@router.post("/runs/{run_id}/candidates/{candidate_id}/research", response_model=ResearchRecord)
def save_research(run_id: str, candidate_id: str, request: ResearchUpdate):
    return invoke(discovery_research.save_record, run_id, candidate_id, request)
