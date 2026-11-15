"""Bounded conversational contract; scientific facts are resolved server-side."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .analog import AnalogWeight
from .mission import MissionProfile
from .mission_assessment import MissionAssessmentRequest
from .research import Citation


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AstroRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=1000)
    history: list[Turn] = Field(default_factory=list, max_length=12)
    active_tab: Literal["mission", "explore", "analyze", "compare", "research"] = (
        "explore"
    )
    viewed_body: Literal["earth", "mars"] = "mars"
    map_mode: Literal["landing_suitability", "analog_match", "mission_browse"] = (
        "landing_suitability"
    )
    selected_mars_id: str | None = Field(None, max_length=100)
    selected_earth_id: str | None = Field(None, max_length=100)
    candidate_body: Literal["earth", "mars"] = "mars"
    objective: str = Field("", max_length=500)
    mission: MissionProfile | None = None
    assessment: MissionAssessmentRequest | None = None
    analog_weights: list[AnalogWeight] | None = Field(None, max_length=10)


class AstroAction(BaseModel):
    id: str
    label: str
    tab: Literal["mission", "explore", "analyze", "compare", "research"]
    body: Literal["earth", "mars"] | None = None
    location_id: str | None = None


class EvidenceQuote(BaseModel):
    citation_id: str
    quote: str = Field(min_length=20, max_length=700)


class AstroDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    focus: Literal[
        "ranking", "evidence_gaps", "analogs", "next_steps", "mission", "clarify"
    ]
    explanation: str | None = Field(default=None, min_length=1, max_length=1600)
    fact_ids: list[str] = Field(max_length=5)
    evidence_ids: list[str] | None = Field(default=None, max_length=2)
    evidence: list[EvidenceQuote] = Field(max_length=4)
    action_ids: list[str] = Field(max_length=3)


class AstroResponse(BaseModel):
    answer: str
    context_label: str
    generated_by: Literal["llm", "deterministic_fallback", "local"]
    fallback_reason: Literal["not_configured", "rate_limit", "provider_error", "validation_error"] | None = None
    facts: list[str]
    evidence: list[EvidenceQuote]
    citations: list[Citation]
    actions: list[AstroAction]
    limitations: list[str]
