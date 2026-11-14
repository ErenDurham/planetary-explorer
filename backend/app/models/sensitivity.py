"""Weight-sensitivity (rank stability) sweep for one focus site.

POST /scoring/sensitivity answers: "would the choice of this site survive a
reasonable change in priorities?" It is a SANDBOX: the request carries the
applied mission, the response carries re-evaluations under scenario weights,
and nothing here changes the applied mission. Every number is produced by
scoring_engine.evaluate + ranking_engine.rank under the same spec, hard
constraints, candidate set, profile version and missing-data policy as the
applied evaluation. No new criteria, no imputation, no threshold changes.

Vocabulary: this is weight sensitivity / rank stability. It is not
confidence, not probability, and carries no measurement-error intervals.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .mission import MissionProfile, SuitabilityStatus


class SensitivityRequest(BaseModel):
    planet: Literal["mars"] = "mars"
    site_ids: list[str] | None = Field(None, description="Candidate subset; null = all sites. Must match the applied evaluation's set.")
    mission: MissionProfile = Field(..., description="The applied mission; it is read, never modified")
    focus_site_id: str = Field(..., description="The selected site whose rank and score are tracked across the sweep")
    range_pp: float = Field(5.0, gt=0, le=50, description="Half-width of the sweep in percentage points of effective share (default +/-5)")
    step_pp: float = Field(1.0, ge=0.25, le=10, description="Sweep resolution in percentage points; breakpoints are only located to this resolution")
    client_request_id: str | None = Field(None, description="Echoed back so the client can drop stale responses")


class ScenarioSiteOutcome(BaseModel):
    site_id: str
    site_name: str
    status: SuitabilityStatus
    score: float | None
    rank: int | None


class SensitivityPoint(BaseModel):
    delta_pp: float = Field(..., description="Requested change in the swept criterion's effective share, percentage points")
    share: float | None = Field(None, description="Realised normalised weight of the swept criterion under this scenario; null when it dropped out (weight 0)")
    weights: dict[str, float] = Field(..., description="Raw weights sent to the scoring engine for this scenario (active criteria sum to 100)")
    active_count: int = Field(..., description="Criteria actually scored under this scenario")
    focus_status: SuitabilityStatus | None = Field(None, description="null when the focus site is not in the candidate set")
    focus_score: float | None = None
    focus_rank: int | None = None
    leader_site_id: str | None = None
    leader_site_name: str | None = None
    leader_score: float | None = None
    runner_up_site_id: str | None = None
    runner_up_site_name: str | None = None
    runner_up_score: float | None = None
    gap_to_alternative: float | None = Field(None, description="focus score minus the leader's (or minus the runner-up's when the focus site leads); positive = focus ahead")
    ranking: list[ScenarioSiteOutcome]


class SensitivityBreakpoint(BaseModel):
    kind: Literal["leader", "focus_rank"]
    from_delta_pp: float
    to_delta_pp: float
    before: str
    after: str


class SensitivitySweep(BaseModel):
    criterion_id: str
    label: str
    base_share: float = Field(..., description="Effective share of this criterion under the applied mission")
    points: list[SensitivityPoint]
    breakpoints: list[SensitivityBreakpoint] = Field(default_factory=list, description="Changes located between adjacent sweep points, to the sweep resolution only")
    focus_rank_min: int | None = None
    focus_rank_max: int | None = None
    focus_rank_stable: bool = Field(..., description="True when the focus site's rank is the same at every point in the tested range")
    leader_stable: bool = Field(..., description="True when the same site leads at every point in the tested range")
    note: str = Field(..., description="Plain reading of the sweep, always qualified as 'within the tested range'")


class ExcludedCriterion(BaseModel):
    criterion_id: str
    label: str
    reason: str


class SensitivityResponse(BaseModel):
    focus_site_id: str
    focus_site_name: str | None
    active_criteria: list[str] = Field(..., description="Criteria scored under the applied mission (weight > 0 and data on every candidate)")
    inactive: list[ExcludedCriterion] = Field(default_factory=list)
    base_shares: dict[str, float] = Field(..., description="Effective normalised weights under the applied mission, active criteria only")
    base: SensitivityPoint = Field(..., description="The applied mission re-evaluated (delta 0); identical to POST /scoring/evaluate")
    sweeps: list[SensitivitySweep]
    range_pp: float
    step_pp: float
    assumption: str = Field(..., description="How the remaining share is redistributed, stated for display")
    too_few_active: bool = Field(..., description="True when fewer than two criteria are active, so no one-at-a-time sweep is possible")
    scoring_spec_version: str
    profile_version: str
    mission: MissionProfile
    warnings: list[str] = Field(default_factory=list)
    client_request_id: str | None = None
