"""Task-specific regional screening, independent of cross-body analog distance."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from .common import Provenance

MissionKind = Literal["research", "rover_field_test", "base_planning"]

class MissionRequirements(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    material_targets: list[str] = Field(default_factory=list, max_length=30)
    excluded_material_targets: list[str] = Field(default_factory=list, max_length=30)
    material_match: Literal["coverage", "any"] = "coverage"
    landform_targets: list[str] = Field(default_factory=list, max_length=30)
    slope_target_deg: float = Field(1.0, ge=0, le=90)
    slope_tolerance_deg: float = Field(5.0, gt=0, le=90)
    relief_target_m: float = Field(100.0, ge=0, le=10000)
    relief_tolerance_m: float = Field(300.0, gt=0, le=10000)
    analog_reference_id: str | None = Field(None, max_length=100, description="Earth rover field test only: a Mars site id. When set, Earth sites are ranked by their analog similarity to that Mars site (the Explore analog calculation) instead of by the slope/relief targets.")

class MissionAssessmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    body: Literal["earth", "mars"]
    mission_type: MissionKind
    weights: dict[str, float] = Field(default_factory=dict)
    requirements: MissionRequirements = Field(default_factory=MissionRequirements)
    client_request_id: str | None = Field(None, max_length=100)

    @model_validator(mode="after")
    def weights_valid(self):
        allowed = {"research": {"materials", "landforms"}, "rover_field_test": {"slope", "relief"}, "base_planning": set()}[self.mission_type]
        if any(k not in allowed or not 0 <= v <= 100 for k,v in self.weights.items()):
            raise ValueError("Weights must be supported criteria for this mission type, in 0..100")
        if self.weights and sum(self.weights.values()) <= 0:
            raise ValueError("At least one priority must be above zero")
        return self

class MissionFactor(BaseModel):
    criterion_id: str
    label: str
    feature_id: str
    value: float | list[str] | None = None
    unit: str | None = None
    q: float | None = None
    normalized_weight: float | None = None
    contribution: float | None = None
    source: Provenance | None = None
    method: str
    note: str
    quality: str | None = None

class MissionAssessmentResult(BaseModel):
    site_id: str
    site_name: str
    body: Literal["earth", "mars"]
    score: float | None = None
    rank: int | None = None
    status: Literal["scored", "needs_requirements", "insufficient_data", "not_supported"]
    coverage_fraction: float
    factors: list[MissionFactor]
    evidence_gaps: list[str]

class MissionAssessmentResponse(BaseModel):
    body: Literal["earth", "mars"]
    mission_type: MissionKind
    spec_version: str
    profile_label: str
    method: str
    assumptions: list[str]
    warnings: list[str]
    requirements: MissionRequirements
    results: list[MissionAssessmentResult]
    client_request_id: str | None
