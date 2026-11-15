"""Public discovery-v1 contract. Discovery never modifies curated profiles."""
from __future__ import annotations

import math
from typing import Any, Literal

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
    value: float
    unit: Literal["deg", "m"]
    measurement_type: Literal["derived"] = "derived"


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


class DiscoveryContext(Record):
    climate: dict[str, Any] | None = None
    land_cover: dict[str, Any] | None = None
    geology_status: Literal["not_assessed"] = "not_assessed"


class DiscoveryFeatureDistance(Record):
    feature_id: str
    earth_value: float
    mars_value: float
    unit: str
    scale: float = Field(gt=0)
    normalized_weight: float = Field(ge=0, le=1)
    distance: float = Field(ge=0)
    contribution: float = Field(ge=0)


class DiscoveryCandidate(Record):
    id: str
    name: str
    lat: float = Field(ge=-90, le=90)
    lon_east: float = Field(ge=-180, le=180)
    footprint_geojson: dict[str, Any]
    research_status: Literal["unresearched", "in_progress", "literature_reviewed"] = "unresearched"
    raw_rank: int | None = None
    display_rank: int | None = None
    distance: float | None = None
    similarity_index: float | None = None
    feature_distances: list[DiscoveryFeatureDistance] = Field(default_factory=list)
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


class DiscoveryRunSummary(Record):
    run_id: str
    label: str
    created_at: str
    bounds: DiscoveryBounds
    total_sampled: int
    eligible_count: int


class DiscoveryCapabilities(Record):
    engine_version: Literal["discovery-v1"] = "discovery-v1"
    state: Literal["ready", "unavailable"]
    reference: DiscoveryReference = Field(default_factory=DiscoveryReference)
    runs: list[DiscoveryRunSummary]
    criteria: list[DiscoveryCriterion]
    default_weights: dict[str, float]
    limitations: list[str]


class DiscoveryWeights(Record):
    slope_regional_median_deg: float = Field(50, ge=0)
    roughness_regional_m: float = Field(50, ge=0)

    @model_validator(mode="after")
    def positive_total(self):
        total = sum(self.model_dump().values())
        if not math.isfinite(total) or total <= 0:
            raise ValueError("weights need a finite positive total")
        return self


class DiscoveryRankRequest(Record):
    run_id: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    reference_id: Literal["jezero_crater"] = "jezero_crater"
    weights: DiscoveryWeights = Field(default_factory=DiscoveryWeights)
    top_k: int = Field(5, ge=1, le=20)
    client_request_id: str | None = Field(None, max_length=200)


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


class DiscoveryRankResponse(Record):
    engine_version: Literal["discovery-v1"] = "discovery-v1"
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
    engine_version: Literal["discovery-v1"] = "discovery-v1"
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
