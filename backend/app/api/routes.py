"""HTTP surface. Thin: validates input, calls services, shapes errors.

Owner: Engineer 5 (integration). Every non-2xx response is an ApiError
envelope so the frontend has one error shape to handle.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.config.settings import get_settings
from app.models.astro import AstroRequest, AstroResponse
from app.services import astro_engine
from app.models import (
    ApiError,
    DefaultMissionResponse,
    EvaluateRequest,
    EvaluateResponse,
    ExplainRequest,
    GuidanceRequest,
    GuidanceResponse,
    InterpretRequest,
    InterpretResponse,
    HealthResponse,
    MatchRequest,
    MatchResponse,
    ResearchExplanation,
    ServiceStatus,
    SiteListResponse,
    SiteWithProfile,
)
from app.models import AnalogRankRequest, AnalogRankResponse
from app.services import analog_rank_engine
from app.services import analog_engine, explanation_engine, guidance_engine, llm_client, objective_engine, ranking_engine, scoring_engine
from app.services.data_loader import DataError, get_store
from app.services.retrieval_engine import get_retriever

router = APIRouter(prefix="/api/v1")
ERR = {404: {"model": ApiError}, 422: {"model": ApiError}, 500: {"model": ApiError}, 503: {"model": ApiError}}


def _not_found(what: str, ident: str) -> HTTPException:
    return HTTPException(status_code=404, detail={"code": "not_found", "message": f"{what} '{ident}' not found", "details": None})


@router.get("/health", response_model=HealthResponse, responses=ERR)
def health() -> HealthResponse:
    s = get_settings()
    try:
        get_store()
        data = "ok"
    except DataError:
        data = "error"
    retrieval = get_retriever().status()
    llm = explanation_engine.llm_status()   # configured | unconfigured | error (a call failed recently)
    if llm == "unconfigured" and llm_client.enabled():
        llm = llm_client.status()          # a local model reads mission objectives even when explanations stay deterministic
    return HealthResponse(status="ok" if data == "ok" else "degraded", version=s.app_version, profile_version=s.profile_version,
                          scoring_spec_version=scoring_engine.load_spec()["version"], services=ServiceStatus(data=data, retrieval=retrieval, llm=llm))


@router.get("/sites", response_model=SiteListResponse, responses=ERR)
def list_sites(planet: str = Query("mars", pattern="^(mars|earth)$")) -> SiteListResponse:
    store = get_store()
    if planet != "mars":
        raise HTTPException(status_code=422, detail={"code": "unsupported_planet", "message": "Version 1 serves Mars sites only; Earth locations are analog candidates under /analogs/match", "details": None})
    return SiteListResponse(planet="mars", sites=store.sites("mars"), profile_version=store.profile_version)


@router.get("/sites/{site_id}", response_model=SiteWithProfile, responses=ERR)
def get_site(site_id: str) -> SiteWithProfile:
    store = get_store()
    site = store.site(site_id)
    prof = store.profile(site_id)
    if site is None or prof is None:
        raise _not_found("site", site_id)
    return SiteWithProfile(site=site, profile=prof)


@router.get("/scoring/default-mission", response_model=DefaultMissionResponse, responses=ERR)
def default_mission() -> DefaultMissionResponse:
    """The scoring spec's default criteria, weights and hard constraints, so the
    frontend can initialise its sliders from the backend rather than hard-coding."""
    spec = scoring_engine.load_spec()
    return DefaultMissionResponse(mission=scoring_engine.default_mission(), scoring_spec_version=spec["version"],
                                  criteria=[{k: c[k] for k in ("criterion_id", "label", "feature_id", "unit", "default_weight", "rationale", "function")} for c in spec["criteria"]],
                                  notes=spec["notes"])


@router.post("/scoring/evaluate", response_model=EvaluateResponse, responses=ERR)
def evaluate(req: EvaluateRequest) -> EvaluateResponse:
    store = get_store()
    sites = store.sites("mars")
    if req.site_ids is not None:
        known = {s.id for s in sites}
        unknown = [i for i in req.site_ids if i not in known]
        if unknown:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": "unknown site ids", "details": unknown})
        sites = [s for s in sites if s.id in set(req.site_ids)]
    profiles = {s.id: store.profile(s.id) for s in sites}
    results, warnings = scoring_engine.evaluate(sites, profiles, req.mission)
    ranked = ranking_engine.rank(results)
    return EvaluateResponse(results=ranked, scoring_spec_version=scoring_engine.load_spec()["version"], profile_version=store.profile_version,
                            mission=req.mission, warnings=warnings, client_request_id=req.client_request_id)


@router.post("/analogs/match", response_model=MatchResponse, responses=ERR)
def match_analogs(req: MatchRequest) -> MatchResponse:
    store = get_store()
    site = store.site(req.mars_site_id)
    prof = store.profile(req.mars_site_id)
    if site is None or prof is None:
        raise _not_found("site", req.mars_site_id)
    cands = [(c, store.earth_profile(c.id)) for c in store.earth_candidates()]
    matches, warnings = analog_engine.match_all(site, prof, cands, req.weights, req.top_k)
    return MatchResponse(mars_site_id=site.id, matches=matches, analog_spec_version=analog_engine.load_spec()["version"],
                         planetary_differences=analog_engine.load_spec()["noncomparable_disclosures"], warnings=warnings)


@router.post("/research/explain", response_model=ResearchExplanation, responses=ERR)
def explain(req: ExplainRequest) -> ResearchExplanation:
    store = get_store()
    site = store.site(req.site_id)
    prof = store.profile(req.site_id)
    if site is None or prof is None:
        raise _not_found("site", req.site_id)
    mission = req.mission or scoring_engine.default_mission()
    all_sites = store.sites("mars")
    results, _ = scoring_engine.evaluate(all_sites, {s.id: store.profile(s.id) for s in all_sites}, mission)
    ranked = ranking_engine.rank(results)
    mine = next((r for r in ranked if r.site_id == site.id), None)
    analogs = None
    if req.include_analogs:
        analogs, _ = analog_engine.match_all(site, prof, [(c, store.earth_profile(c.id)) for c in store.earth_candidates()], None, 3)
    query = explanation_engine.build_query(site, prof, mine, req.question or req.objective)
    # k=8 with at most two passages per source: several useful passages, but
    # repeated links can never masquerade as independent corroboration.
    evidence = get_retriever().retrieve(query, k=8, geographic_relevance=[site.id, site.region])
    return explanation_engine.explain(site, prof, mine, evidence, analogs, req.question, objective=req.objective)


@router.post("/mission/interpret", response_model=InterpretResponse, responses=ERR)
def interpret_objective(req: InterpretRequest) -> InterpretResponse:
    """Free-text objective -> PROPOSED weights for the existing criteria, with
    rationale, trade-offs, unsupported needs and clarifying questions. The
    proposal is validated deterministically; hard constraints and thresholds
    are never exposed to free text."""
    return objective_engine.interpret(req)


@router.post("/mission/guidance", response_model=GuidanceResponse, responses=ERR)
def priority_guidance(req: GuidanceRequest) -> GuidanceResponse:
    """Objective-aware guidance after a priority change: effective influence
    before/after, de-emphasised factors, rank deltas and missing data, all
    computed by the scoring engine; a model may only phrase them."""
    return guidance_engine.guide(req, get_store())


@router.post("/analogs/rank", response_model=AnalogRankResponse, responses=ERR)
def rank_analogs(req: AnalogRankRequest) -> AnalogRankResponse:
    """Body-aware analog ranking: every candidate on one body ranked against a
    reference on the other, on a common positive-weight feature basis. The
    pairwise maths is the same as /analogs/match (unchanged)."""
    try:
        return analog_rank_engine.rank_pool(req, get_store())
    except KeyError as e:
        raise _not_found("location", str(e).strip("'")) from e
    except ValueError as e:
        raise HTTPException(status_code=422, detail={"code": "validation_error", "message": str(e), "details": None}) from e


@router.post('/astro/chat', response_model=AstroResponse, responses=ERR)
def astro_chat(req: AstroRequest) -> AstroResponse:
    try:
        return astro_engine.chat(req)
    except KeyError as exc:
        raise _not_found('location', str(exc).strip("'")) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={'code': 'validation_error', 'message': str(exc), 'details': None}) from exc
