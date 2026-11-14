"""Earth-Mars environmental analog matching."""
from __future__ import annotations

from pydantic import BaseModel, Field

from .common import GeographicFootprint


class EarthCandidate(BaseModel):
    id: str = Field(..., pattern=r"^[a-z0-9_]+$")
    name: str
    region: str
    country: str
    lat: float = Field(..., ge=-90, le=90)
    lon_east: float = Field(..., ge=-180, le=180)
    footprint: GeographicFootprint
    description: str
    tags: list[str] = Field(default_factory=list)
    known_analog_use: list[str] = Field(default_factory=list, description="Documented analog programmes / field campaigns")
    sources: list[str] = Field(default_factory=list)


class FeatureDistance(BaseModel):
    feature_id: str
    label: str
    comparable: bool
    mars_value: float | str | list[str] | None
    earth_value: float | str | list[str] | None
    unit: str | None
    scale: float | None = Field(None, description="Reference scale for numeric features (d = |a-b|/scale)")
    distance: float | None = Field(None, ge=0)
    raw_weight: float
    normalized_weight: float | None
    contribution: float | None = Field(None, description="normalized_weight * distance")
    method: str
    note: str | None = None


class AnalogMatch(BaseModel):
    mars_site_id: str
    earth_candidate: EarthCandidate
    similarity: float | None = Field(None, ge=0, le=100, description="100 / (1 + D); heuristic index, not a probability")
    distance: float | None = Field(None, ge=0, description="D = sum(w_i d_i)/sum(w_i) over comparable features")
    rank: int | None = None
    feature_distances: list[FeatureDistance]
    shared_characteristics: list[str] = Field(default_factory=list)
    important_differences: list[str] = Field(default_factory=list)
    noncomparable_variables: list[str] = Field(default_factory=list)
    research_applications: list[str] = Field(default_factory=list, description="DEPRECATED alias of documented_analog_use; kept for older clients")
    documented_analog_use: list[str] = Field(default_factory=list, description="Historical analog campaigns recorded for this Earth site; not proposals")
    proposed_studies: list[dict] = Field(default_factory=list, description="StudyCard dicts proposed from the matched characteristics; hypotheses, not validated transfers")
    limitations: list[str] = Field(default_factory=list)
    citations: list[str] = Field(default_factory=list, description="source_ids")
    completeness_fraction: float = Field(..., ge=0, le=1)


class AnalogWeight(BaseModel):
    feature_id: str
    weight: float = Field(..., ge=0, le=100)


class MatchRequest(BaseModel):
    mars_site_id: str
    weights: list[AnalogWeight] | None = Field(None, description="Override analog weights; null = spec defaults")
    top_k: int = Field(5, ge=1, le=20)


class MatchResponse(BaseModel):
    mars_site_id: str
    matches: list[AnalogMatch]
    analog_spec_version: str
    planetary_differences: list[str] = Field(..., description="Fundamental differences disclosed on every comparison")
    warnings: list[str] = Field(default_factory=list)
