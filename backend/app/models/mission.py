"""Mission profiles and suitability results (Phase 1: Landing)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

MissionPhase = Literal["landing"]  # V2 adds base_establishment, resource_utilization, habitation

MissingDataPolicy = Literal[
    "common_feature_set",   # drop a criterion for ALL sites if any site lacks it (fair ranking)
    "per_site_exclusion",   # drop it only for the sites lacking it (warn: inconsistent coverage)
]


class CriterionWeight(BaseModel):
    criterion_id: str
    weight: float = Field(..., ge=0, le=100)


class HardConstraint(BaseModel):
    """A mandatory requirement. A site failing one is ineligible whatever its score.
    Default thresholds are documented assumptions, not universal requirements."""

    constraint_id: str
    feature_id: str
    operator: Literal["<=", ">=", "<", ">", "abs<="]
    threshold: float
    rationale: str
    is_assumption: bool = True


class MissionProfile(BaseModel):
    mission_phase: MissionPhase = "landing"
    criteria: list[CriterionWeight]
    hard_constraints: list[HardConstraint] = Field(default_factory=list)
    missing_data_policy: MissingDataPolicy = "common_feature_set"

    @field_validator("criteria")
    @classmethod
    def at_least_one_positive_weight(cls, v: list[CriterionWeight]) -> list[CriterionWeight]:
        if not v or sum(c.weight for c in v) <= 0:
            raise ValueError("at least one criterion must carry a positive weight")
        ids = [c.criterion_id for c in v]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate criterion_id in criteria")
        return v


class FactorScore(BaseModel):
    criterion_id: str
    label: str
    feature_id: str
    feature_value: float | None
    unit: str | None
    suitability: float | None = Field(None, ge=0, le=1, description="q(s,i) in [0,1]; null if missing")
    raw_weight: float
    normalized_weight: float | None = Field(None, description="w_i / sum(w_j) over VALID criteria")
    weighted_contribution: float | None = Field(None, description="100 * normalized_weight * suitability")
    is_missing: bool
    excluded_reason: str | None = None
    rationale: str


class ConstraintResult(BaseModel):
    constraint_id: str
    feature_id: str
    passed: bool | None = Field(None, description="null when the feature is missing")
    feature_value: float | None
    operator: str
    threshold: float
    rationale: str
    is_assumption: bool


class Eligibility(BaseModel):
    eligible: bool
    failed_constraints: list[ConstraintResult] = Field(default_factory=list)
    unevaluated_constraints: list[ConstraintResult] = Field(default_factory=list)


class CriteriaCompleteness(BaseModel):
    criteria_requested: int
    criteria_supported: int
    fraction: float = Field(..., ge=0, le=1)
    excluded_criteria: list[str] = Field(default_factory=list)


SuitabilityStatus = Literal["ok", "insufficient_data", "ineligible"]


class SuitabilityResult(BaseModel):
    site_id: str
    site_name: str
    status: SuitabilityStatus
    score: float | None = Field(None, ge=0, le=100, description="Relative decision-support index, not a probability")
    rank: int | None = Field(None, description="1 = best among eligible sites with status ok")
    factor_scores: list[FactorScore]
    eligibility: Eligibility
    completeness: CriteriaCompleteness
    favorable: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class EvaluateRequest(BaseModel):
    planet: Literal["mars"] = "mars"
    site_ids: list[str] | None = Field(None, description="Subset to evaluate; null = all sites")
    mission: MissionProfile
    client_request_id: str | None = Field(None, description="Echoed back so the client can drop stale responses")


class EvaluateResponse(BaseModel):
    results: list[SuitabilityResult] = Field(..., description="Sorted: ok by score desc, then insufficient_data, then ineligible")
    scoring_spec_version: str
    profile_version: str
    mission: MissionProfile
    warnings: list[str] = Field(default_factory=list)
    client_request_id: str | None = None
