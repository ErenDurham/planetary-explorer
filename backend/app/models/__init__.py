"""Pydantic models: the single source of truth for the API contract.

The frontend's `src/types/api.ts` is generated from the OpenAPI document that
FastAPI builds from these models (`npm run gen:types` in frontend/). Change a
model here, regenerate, and both sides move together.
"""
from .analog import AnalogMatch, AnalogWeight, EarthCandidate, FeatureDistance, MatchRequest, MatchResponse
from .common import (
    ApiError,
    ApiErrorBody,
    GeographicFootprint,
    MeasurementCategory,
    MeasurementType,
    Planet,
    Provenance,
    QualityFlag,
)
from .health import HealthResponse, ServiceStatus
from .mission import (
    ConstraintResult,
    CriteriaCompleteness,
    CriterionWeight,
    Eligibility,
    EvaluateRequest,
    EvaluateResponse,
    FactorScore,
    HardConstraint,
    MissionProfile,
    SuitabilityResult,
)
from .research import Citation, EvidenceChunk, ExplainRequest, ExplanationSections, ResearchExplanation
from .site import (
    Completeness,
    EnvironmentalMeasurement,
    EnvironmentalProfile,
    Site,
    SiteListResponse,
    SiteWithProfile,
)

__all__ = [n for n in dir() if not n.startswith("_")]
