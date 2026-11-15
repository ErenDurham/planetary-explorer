from fastapi import APIRouter, HTTPException
from app.models.expedition import Body, PlanRequest, PlanResponse, ServiceCapabilities, TerrainContext
from app.services.expedition.engine import capabilities, plan
from app.services.expedition.terrain import load_terrain

router=APIRouter(prefix="/api/v1/expedition",tags=["expedition"])

def invalid(exc):
    return HTTPException(status_code=422,detail={"code":"validation_error","message":str(exc)})

@router.get("/capabilities",response_model=ServiceCapabilities)
def get_capabilities():
    return capabilities()

@router.get("/terrain",response_model=TerrainContext)
def get_terrain(body: Body,site_id: str):
    try:return load_terrain(body,site_id)[0]
    except ValueError as exc:raise invalid(exc) from exc

@router.post("/plan",response_model=PlanResponse)
def post_plan(req: PlanRequest):
    try:return plan(req)
    except ValueError as exc:raise invalid(exc) from exc
