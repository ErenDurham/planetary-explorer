"""FastAPI entrypoint. Run from backend/:  uvicorn app.main:app --reload"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.comparison_routes import router as comparison_router
from app.api.mission_assessment_routes import router as mission_assessment_router
from app.api.analysis_routes import router as analysis_router
from app.api.imagery_routes import router as imagery_router
from app.api.routes import router
from app.config.settings import get_settings
from app.services.data_loader import DataError

settings = get_settings()

app = FastAPI(
    title="Planetary Explorer API",
    version=settings.app_version,
    description="Mars landing-site environmental profiles, explainable suitability scoring, Earth analog matching and citation-backed scientific explanations. Scores are relative decision-support indices under documented assumptions, not safety certifications.",
)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_methods=["*"], allow_headers=["*"])
app.include_router(router)
app.include_router(imagery_router)
app.include_router(analysis_router)
app.include_router(mission_assessment_router)
app.include_router(comparison_router)


def _envelope(code: str, message: str, details=None, status: int = 500) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, "details": details}})


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    d = exc.detail
    if isinstance(d, dict) and "code" in d:
        return _envelope(d["code"], d.get("message", ""), d.get("details"), exc.status_code)
    return _envelope("http_error", str(d), None, exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    return _envelope("validation_error", "request failed schema validation", jsonable_encoder(exc.errors()), 422)


@app.exception_handler(DataError)
async def data_error(_: Request, exc: DataError):
    return _envelope("data_unavailable", str(exc), None, 503)


@app.get("/", include_in_schema=False)
def root():
    return {"name": "Planetary Explorer API", "docs": "/docs", "health": "/api/v1/health"}
