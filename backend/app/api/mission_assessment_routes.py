from fastapi import APIRouter, HTTPException
from app.models.mission_assessment import MissionAssessmentRequest, MissionAssessmentResponse
from app.services.mission_assessment import evaluate, load_profiles

router = APIRouter(prefix="/api/v1")

@router.get("/missions/profiles")
def profiles():
    return load_profiles()

@router.post("/missions/evaluate", response_model=MissionAssessmentResponse)
def assess(req: MissionAssessmentRequest):
    try:
        return evaluate(req)
    except ValueError as exc:
        raise HTTPException(status_code=422,detail={"code":"validation_error","message":str(exc)}) from exc
