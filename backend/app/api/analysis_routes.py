"""Analysis endpoints: weight-sensitivity sweeps for the Analyze view.

Thin, like routes.py: validate, call the engine, shape errors. The sweep is a
sandbox over the applied mission; it never writes anything.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models import ApiError, SensitivityRequest, SensitivityResponse
from app.services import sensitivity_engine
from app.services.data_loader import get_store

router = APIRouter(prefix="/api/v1")
ERR = {404: {"model": ApiError}, 422: {"model": ApiError}, 500: {"model": ApiError}, 503: {"model": ApiError}}


@router.post("/scoring/sensitivity", response_model=SensitivityResponse, responses=ERR)
def sensitivity(req: SensitivityRequest) -> SensitivityResponse:
    """One-at-a-time weight sweep around the applied mission for one focus site.
    Every point is re-scored by scoring_engine.evaluate + ranking_engine.rank."""
    store = get_store()
    sites = store.sites("mars")
    known = {s.id for s in sites}
    if req.site_ids is not None:
        unknown = [i for i in req.site_ids if i not in known]
        if unknown:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": "unknown site ids", "details": unknown})
        sites = [s for s in sites if s.id in set(req.site_ids)]
    if req.focus_site_id not in known:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": f"site '{req.focus_site_id}' not found", "details": None})
    if req.focus_site_id not in {s.id for s in sites}:
        raise HTTPException(status_code=422, detail={"code": "validation_error", "message": "focus_site_id must be in the evaluated candidate set", "details": {"focus_site_id": req.focus_site_id}})
    profiles = {s.id: store.profile(s.id) for s in sites}
    return sensitivity_engine.sweep(sites, profiles, req.mission, req.focus_site_id, req.range_pp, req.step_pp,
                                    profile_version=store.profile_version, client_request_id=req.client_request_id)
