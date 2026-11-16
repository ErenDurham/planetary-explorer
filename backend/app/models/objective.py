"""Structured interpretation of a free-text mission objective.

The model (or the rule engine) PROPOSES preference weights; deterministic code
validates criterion ids, bounds, data availability and the positive-total
rule. Hard constraints and scoring thresholds are never touched by free text.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field
from .mission_assessment import MissionRequirements

InterpretationSource = Literal["llm", "rule_based"]
Confidence = Literal["low", "medium", "high"]
MissionProfile = Literal["lander", "rover", "human", "other"]
SourceKind = Literal["nasa", "peer_reviewed"]


class EvidenceCitation(BaseModel):
    """One curated research finding (data/evidence). `fact` is the display line;
    every number in it appears in `quotes`, copied verbatim from the source."""
    evidence_id: str
    fact: str
    quotes: list[str] = Field(..., description="Verbatim excerpts from the source that carry the fact's numbers")
    cite: str = Field(..., description="Author-year citation, e.g. 'Golombek et al., 2017'")
    title: str
    venue: str
    url: str = Field(..., description="DOI or official NASA link to the source")
    source_kind: SourceKind


class InterpretRequest(BaseModel):
    objective: str = Field(..., min_length=1, max_length=500, description="Free text; treated as untrusted data")
    current_weights: dict[str, float] | None = Field(None, description="Slider state to start from; null = scoring spec defaults")
    excluded_criteria: list[str] = Field(default_factory=list, description="Criteria the client knows are unscorable (no data); forced to 0")
    use_llm: bool = Field(True, description="False = the fast keyword reading only (used for the app's startup default)")


class WeightSuggestion(BaseModel):
    criterion_id: str
    label: str
    weight: int = Field(..., ge=0, le=100)
    previous_weight: int = Field(..., ge=0, le=100)
    reason: str = Field(..., description="Why this weight was proposed; a preference, not a scientific finding")
    data_available: bool
    evidence: list[EvidenceCitation] = Field(default_factory=list, description="Research findings cited for this weight (0-3); empty = none in the registry applies")


TaskKind = Literal["landing_screening", "analog_site_selection", "ambiguous"]
BodyKind = Literal["earth", "mars"]


class SiteReference(BaseModel):
    body: BodyKind
    id: str
    name: str
    matched_text: str = Field(..., description="The words in the objective that named this site")


class SiteCandidate(BaseModel):
    """An ambiguous or partial site mention the user must resolve with a selector; never a guessed coordinate."""

    matched_text: str
    options: list[SiteReference]


class DirectionOption(BaseModel):
    task: TaskKind
    focus_body: BodyKind
    label: str
    description: str


class AnalogWeightSuggestion(BaseModel):
    feature_id: str
    label: str
    weight: int = Field(..., ge=0, le=100)
    reason: str


class ScreeningPlan(BaseModel):
    """Catalogue-backed intent, independent of model-generated landing weights."""
    body: BodyKind
    mission_type: Literal["landing", "research", "rover_field_test", "base_planning"]
    requirements: MissionRequirements
    weights: dict[str, float]
    limitations: list[str]


class TaskInterpretation(BaseModel):
    """What the objective asks for, separately from the landing-priority weights.
    `focus_body` is where the user is looking for a location; `mission_destination`
    is where the mission flies (a Mars mission can use Earth test sites)."""

    task: TaskKind
    screening: ScreeningPlan | None = None
    focus_body: BodyKind | None = None
    mission_destination: BodyKind | None = None
    reference_site: SiteReference | None = None
    unresolved_sites: list[SiteCandidate] = Field(default_factory=list)
    direction_options: list[DirectionOption] = Field(default_factory=list, description="Offered when the text does not settle the search direction")
    analog_suggestions: list[AnalogWeightSuggestion] = Field(default_factory=list, description="Proposed analog-match preferences (separate from landing priorities)")
    rationale: list[str] = Field(default_factory=list)


class AnalogFactorCheck(BaseModel):
    """One factor of the Earth <-> Mars cross-reference: both sites' measured values."""
    criterion_id: str
    earth_value: float | None = None
    mars_value: float | None = None
    unit: str
    difference: float | None = None
    tolerance: float | None = Field(None, description="A difference within this counts as comparable")
    comparable: bool | None = Field(None, description="null = the factor cannot be compared across planets")
    note: str


class AnalogCheck(BaseModel):
    """The cross-reference behind the priorities: an Earth site research shows
    suits the mission, a Mars site, and how their measured data compare."""
    earth_site_id: str
    earth_site_name: str
    mars_site_id: str
    mars_site_name: str
    research: list[EvidenceCitation] = Field(default_factory=list, description="Recent research on the Earth site as a Mars analog")
    factors: list[AnalogFactorCheck]
    shared_landforms: list[str] = Field(default_factory=list, description="Landform tags both sites' literature reports")
    shared_minerals: list[str] = Field(default_factory=list, description="Mineral tags both sites' literature reports")
    chosen_by: Literal["llm", "rules"]


class EarthWeightSuggestion(BaseModel):
    """The same mission read for choosing an Earth site (field test / analog):
    the same criteria as Mars, weighted for Earth."""
    factor_id: str = Field(..., description="A scoring-spec criterion_id, as in `suggestions`")
    label: str
    weight: int = Field(..., ge=0, le=100)
    reason: str
    evidence: list[EvidenceCitation] = Field(default_factory=list)


class InterpretResponse(BaseModel):
    objective: str
    objective_hash: str = Field(..., description="Stable hash of the interpreted text; the client uses it to avoid stale 'interpreted' labels")
    generated_by: InterpretationSource
    model: str | None = None
    suggestions: list[WeightSuggestion]
    rationale: list[str] = Field(default_factory=list)
    tradeoffs: list[str] = Field(default_factory=list, description="Explicit 'X over Y' or negations found in the text")
    unsupported_needs: list[str] = Field(default_factory=list, description="Goals the landing-phase model cannot optimise")
    clarifying_questions: list[str] = Field(default_factory=list)
    confidence: Confidence
    confidence_note: str = Field(..., description="What the confidence refers to: the reading of the text, never the suitability science")
    validation_notes: list[str] = Field(default_factory=list, description="Deterministic corrections applied to the proposal")
    mission_profile: MissionProfile = Field("other", description="Mission type read from the text; selects which research applies")
    earth_suggestions: list[EarthWeightSuggestion] = Field(default_factory=list, description="Earth field-test site priorities from the same text (slope, relief)")
    analog_check: AnalogCheck | None = Field(None, description="Earth <-> Mars cross-reference used for the priorities")
    constraint_evidence: dict[str, list[EvidenceCitation]] = Field(default_factory=dict, description="Research behind each hard constraint, by constraint_id")
    evidence_version: str | None = None
    scoring_spec_version: str
    task_interpretation: TaskInterpretation | None = Field(None, description="Task / body / reference reading; additive to the landing-weight proposal")
    cached: bool = False
    generated_at: str


class GuidanceRequest(BaseModel):
    objective: str | None = Field(None, max_length=500)
    previous_weights: dict[str, float]
    new_weights: dict[str, float]
    changed_criterion_id: str | None = None
    client_request_id: str | None = None


class InfluenceDelta(BaseModel):
    criterion_id: str
    label: str
    previous_pct: float | None = Field(None, description="Effective normalised influence before (null = unscored)")
    new_pct: float | None = None
    excluded_reason: str | None = None


class RankDelta(BaseModel):
    site_id: str
    site_name: str
    previous_rank: int | None
    new_rank: int | None
    previous_score: float | None
    new_score: float | None


class GuidanceResponse(BaseModel):
    generated_by: Literal["llm", "rule_based"]
    model: str | None = None
    summary: str = Field(..., description="Short objective-aware guidance; phrased by the model or by rules, numbers from the scoring engine only")
    de_emphasised: list[str] = Field(default_factory=list)
    leader_changed: bool
    leader: str | None = None
    rank_changes: list[RankDelta] = Field(default_factory=list, description="Sites whose rank moved")
    influence: list[InfluenceDelta]
    missing_data_notes: list[str] = Field(default_factory=list)
    client_request_id: str | None = None
    cached: bool = False
    generated_at: str
