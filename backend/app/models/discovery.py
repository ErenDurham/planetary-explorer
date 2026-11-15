"""Public discovery contract. Discovery never modifies curated profiles.

discovery-v2 keeps every v1 artifact loadable: the scored basis is whatever the
run's own specification registers, so a two-feature v1 run and a six-feature v2
run are both served by one engine.
"""
from __future__ import annotations

import math
import re
from typing import Any, Literal

EngineVersion = Literal["discovery-v1", "discovery-v2"]

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class DiscoveryReference(Record):
    body: Literal["mars"] = "mars"
    id: Literal["jezero_crater"] = "jezero_crater"
    name: str = "Jezero Crater"
    lat: float = 18.4447
    lon_east: float = 77.4508


class DiscoveryBounds(Record):
    west: float
    south: float
    east: float
    north: float


class DiscoverySource(Record):
    source_id: str
    title: str
    institution: str
    url: str
    license: str
    retrieved_at: str
    observation_period: str
    sha256: str | None = None
    etag: str | None = None


class TerrainMeasurement(Record):
    """One scored quantity. Units are closed: a new unit is a contract change."""
    value: float
    unit: Literal["deg", "m", "W/m2", "mm/day"]
    measurement_type: Literal["derived", "measured"] = "derived"


class DiscoveryProfile(Record):
    measurements: dict[str, TerrainMeasurement]
    grid: dict[str, Any]
    terrain_valid_fraction: float = Field(ge=0, le=1)
    gradient_valid_fraction: float = Field(ge=0, le=1)


class DiscoveryNovelty(Record):
    catalog_version: str
    nearest_known_site_id: str
    nearest_known_site_distance_km: float = Field(ge=0)
    buffer_rule: str
    outside_catalog_buffer: bool
    review_status: Literal["not_reviewed", "desktop_reviewed"] = "not_reviewed"


class DiscoveryContextMeasurement(Record):
    """An Earth dimension carried for honesty, never for scoring.

    `mars_value` is null whenever this release holds no measured Mars counterpart;
    the UI must present these as differences it cannot rank, not as a match.
    """
    feature_id: str
    label: str
    group: str
    earth_value: float
    mars_value: float | None = None
    unit: str
    comparable: bool = False
    note: str


class DiscoveryContext(Record):
    climate: dict[str, Any] | None = None
    land_cover: dict[str, Any] | None = None
    geology_status: Literal["not_assessed"] = "not_assessed"
    measurements: list[DiscoveryContextMeasurement] = Field(default_factory=list)


class DiscoveryFeatureDistance(Record):
    feature_id: str
    earth_value: float
    mars_value: float
    unit: str
    scale: float = Field(gt=0)
    normalized_weight: float = Field(ge=0, le=1)
    distance: float = Field(ge=0)
    contribution: float = Field(ge=0)


class DiscoveryDimensionScore(Record):
    """Similarity restricted to one dimension group, on the same index as the total."""
    group: str
    label: str
    feature_ids: list[str]
    weight_share: float = Field(ge=0, le=1)
    distance: float = Field(ge=0)
    similarity_index: float = Field(ge=0, le=100)


class DiscoveryCandidate(Record):
    id: str
    name: str
    region_id: str | None = None
    region_name: str | None = None
    lat: float = Field(ge=-90, le=90)
    lon_east: float = Field(ge=-180, le=180)
    footprint_geojson: dict[str, Any]
    research_status: Literal["unresearched", "in_progress", "literature_reviewed"] = "unresearched"
    raw_rank: int | None = None
    display_rank: int | None = None
    distance: float | None = None
    similarity_index: float | None = None
    feature_distances: list[DiscoveryFeatureDistance] = Field(default_factory=list)
    dimension_scores: list[DiscoveryDimensionScore] = Field(default_factory=list)
    terrain_valid_fraction: float = Field(ge=0, le=1)
    novelty: DiscoveryNovelty
    context: DiscoveryContext = Field(default_factory=DiscoveryContext)
    sources: list[DiscoverySource]
    limitations: list[str]


class DiscoveryCandidateDetail(DiscoveryCandidate):
    profile: DiscoveryProfile | None
    screening_reasons: list[str]
    source_manifest: list[DiscoverySource]
    proposed_field_validation: list[str]


class DiscoveryCriterion(Record):
    feature_id: str
    label: str
    unit: str
    scale: float = Field(gt=0)
    group: str = "terrain"
    group_label: str = "Terrain and landform"
    rationale: str = ""


class DiscoveryRunSummary(Record):
    run_id: str
    label: str
    created_at: str
    bounds: DiscoveryBounds
    total_sampled: int
    eligible_count: int
    region_count: int = 1
    regions: list[dict[str, Any]] = Field(default_factory=list)
    criteria: list["DiscoveryCriterion"] = Field(default_factory=list)
    default_weights: dict[str, float] = Field(default_factory=dict)


DiscoveryRunSummary.model_rebuild()


class DiscoveryCapabilities(Record):
    engine_version: EngineVersion = "discovery-v2"
    state: Literal["ready", "unavailable"]
    reference: DiscoveryReference = Field(default_factory=DiscoveryReference)
    runs: list[DiscoveryRunSummary]
    criteria: list[DiscoveryCriterion]
    default_weights: dict[str, float]
    limitations: list[str]


class DiscoveryRankRequest(Record):
    """Weights name features; the engine rejects any the chosen run does not score."""
    run_id: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    reference_id: Literal["jezero_crater"] = "jezero_crater"
    weights: dict[str, float] | None = None
    top_k: int = Field(6, ge=1, le=40)
    client_request_id: str | None = Field(None, max_length=200)

    @model_validator(mode="after")
    def usable_weights(self):
        if self.weights is None:
            return self
        if not self.weights:
            raise ValueError("weights need at least one feature")
        for feature, value in self.weights.items():
            if not re.fullmatch(r"[a-z0-9_]{1,60}", feature):
                raise ValueError(f"invalid feature id: {feature}")
            if not math.isfinite(value) or value < 0:
                raise ValueError("weights must be finite and non-negative")
        total = sum(self.weights.values())
        if not math.isfinite(total) or total <= 0:
            raise ValueError("weights need a finite positive total")
        return self


class DiscoveryProbeRequest(Record):
    """One user-chosen Earth point to score with a run's own pipeline and the caller's weights."""
    run_id: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    reference_id: Literal["jezero_crater"] = "jezero_crater"
    lat: float = Field(ge=-90, le=90)
    lon_east: float = Field(ge=-180, le=180)
    weights: dict[str, float] | None = None
    client_request_id: str | None = Field(None, max_length=200)

    @model_validator(mode="after")
    def usable_weights(self):
        if self.weights is None:
            return self
        if not self.weights:
            raise ValueError("weights need at least one feature")
        for feature, value in self.weights.items():
            if not re.fullmatch(r"[a-z0-9_]{1,60}", feature):
                raise ValueError(f"invalid feature id: {feature}")
            if not math.isfinite(value) or value < 0:
                raise ValueError("weights must be finite and non-negative")
        total = sum(self.weights.values())
        if not math.isfinite(total) or total <= 0:
            raise ValueError("weights need a finite positive total")
        return self


class DiscoveryProbePlacement(Record):
    """Where the probe sits relative to the survey: geography and, when scored, the pool."""
    inside_survey_bounds: bool
    nearest_survey_candidate_id: str | None = None
    nearest_survey_candidate_distance_km: float | None = Field(None, ge=0)
    # eligible candidates strictly closer to the reference under the same weights; None while unscored
    closer_survey_candidates: int | None = Field(None, ge=0)
    eligible_pool_count: int = Field(ge=0)


class DiscoveryProbeResponse(Record):
    """A probe is scored only when every feature the run scores was measured at the point."""
    engine_version: EngineVersion = "discovery-v2"
    run_id: str
    reference: DiscoveryReference
    status: Literal["scored", "terrain_unavailable", "insufficient_terrain_coverage", "features_unavailable"]
    reasons: list[str] = Field(default_factory=list)
    lat: float = Field(ge=-90, le=90)
    lon_east: float = Field(ge=-180, le=180)
    footprint_geojson: dict[str, Any] | None = None
    profile: DiscoveryProfile | None = None
    effective_weights: dict[str, float]
    feature_distances: list[DiscoveryFeatureDistance] = Field(default_factory=list)
    dimension_scores: list[DiscoveryDimensionScore] = Field(default_factory=list)
    distance: float | None = Field(None, ge=0)
    similarity_index: float | None = Field(None, ge=0, le=100)
    placement: DiscoveryProbePlacement | None = None
    novelty: DiscoveryNovelty | None = None
    sources: list[DiscoverySource] = Field(default_factory=list)
    limitations: list[str]
    client_request_id: str | None = None
    computed_at: str


class DiscoverySurvey(Record):
    bounds: DiscoveryBounds
    generated_count: int
    terrain_valid_count: int
    eligible_count: int
    exclusion_counts: dict[str, int]
    sampling_centres: list[dict[str, Any]]
    grid_specification: dict[str, Any]
    footprint_specification: dict[str, Any]
    dataset_versions: dict[str, str]
    spec_version: str
    diversification: dict[str, Any]
    regions: list[dict[str, Any]] = Field(default_factory=list)
    context_features: list[dict[str, Any]] = Field(default_factory=list)


class DiscoveryRankResponse(Record):
    engine_version: EngineVersion = "discovery-v2"
    run_id: str
    reference: DiscoveryReference
    survey: DiscoverySurvey
    basis_features: list[str]
    effective_weights: dict[str, float]
    eligible_pool_count: int
    returned_count: int
    candidates: list[DiscoveryCandidate]
    client_request_id: str | None = None
    limitations: list[str]


class DiscoveryAuditRow(Record):
    candidate: DiscoveryCandidate
    profile: DiscoveryProfile | None
    screening_reasons: list[str]


class DiscoveryRunArtifact(Record):
    engine_version: EngineVersion = "discovery-v1"
    run_id: str
    label: str
    created_at: str
    reference: DiscoveryReference
    reference_profile: DiscoveryProfile
    survey: DiscoverySurvey
    specification: dict[str, Any]
    audit_rows: list[DiscoveryAuditRow]
    provenance: list[DiscoverySource]
    validation: dict[str, Any]
    limitations: list[str]


class DiscoveryExport(Record):
    manifest: dict[str, Any]
    specification: dict[str, Any]
    survey: DiscoverySurvey
    reference_profile: DiscoveryProfile
    audit_rows: list[DiscoveryAuditRow]
    exclusions: dict[str, int]
    provenance: list[DiscoverySource]
    validation: dict[str, Any]
