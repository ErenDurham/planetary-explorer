"""Body-aware analog ranking: rank every candidate on one body against a
reference location on the other body (Earth -> Mars or Mars -> Earth).

The pairwise distance is the same deterministic calculation as
/analogs/match (shared feature definitions, units, scales, weights), so a
given Earth/Mars pair yields the same similarity in either direction; only
the RANK differs, because the candidate pool differs. A common positive-weight
feature basis is used across the whole pool so that a candidate never looks
better merely because a difficult feature is missing on its side.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .analog import AnalogWeight, FeatureDistance

Body = Literal["earth", "mars"]


class LocationRef(BaseModel):
    body: Body
    id: str
    name: str
    lat: float
    lon_east: float


class AnalogRankRequest(BaseModel):
    reference_body: Body
    reference_id: str
    candidate_body: Body | None = Field(None, description="Defaults to the other body; must differ from reference_body")
    weights: list[AnalogWeight] | None = Field(None, description="Analog feature weights; null = analog spec defaults")
    client_request_id: str | None = Field(None, description="Echoed so the client can discard stale responses")


class ExcludedFeature(BaseModel):
    feature_id: str
    label: str
    reason: str


class RankedCandidate(BaseModel):
    location: LocationRef
    rank: int | None = Field(None, description="1 = strongest match over the full ranked pool; null when unrankable")
    rank_color_position: float | None = Field(None, ge=0, le=1, description="0 = strongest ... 1 = weakest over the ranked pool; the client maps it onto its colour scale")
    similarity: float | None = Field(None, ge=0, le=100)
    distance: float | None = Field(None, ge=0)
    feature_distances: list[FeatureDistance] = Field(..., description="Canonical mars_value/earth_value regardless of direction")
    coverage_fraction: float = Field(..., ge=0, le=1, description="basis features comparable for this pair / basis features")
    unrankable_reason: str | None = None
    shared_characteristics: list[str] = Field(default_factory=list)
    important_differences: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list, description="source_ids of both locations' profiles")


class AnalogRankResponse(BaseModel):
    reference: LocationRef
    candidate_body: Body
    basis_features: list[str] = Field(..., description="Positive-weight features comparable for every candidate in the pool")
    excluded_features: list[ExcludedFeature]
    effective_weights: dict[str, float] = Field(..., description="Normalised weights over the basis features (sum to 1)")
    candidates: list[RankedCandidate] = Field(..., description="Sorted by rank; unrankable candidates last")
    pool_size: int
    ranked_count: int
    tie_rule: str
    analog_spec_version: str
    profile_version: str
    planetary_differences: list[str]
    warnings: list[str] = Field(default_factory=list)
    client_request_id: str | None = None
