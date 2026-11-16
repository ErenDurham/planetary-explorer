"""Read-only cross-body catalogue; separate from Mars mission scoring."""
from typing import Literal
from pydantic import BaseModel, Field
from .common import AnalogBasis, Provenance, ReportedCondition, SiteRole, SiteSource
from .site import EnvironmentalMeasurement

BodyId = Literal["earth", "mars", "moon"]

class ComparisonLocation(BaseModel):
    id: str
    body: BodyId
    name: str
    region: str
    description: str
    lat: float
    lon_east: float
    coverage: str
    measurements: list[EnvironmentalMeasurement]
    sources: dict[str, Provenance]
    source_ids: list[str] = Field(default_factory=list)
    role: SiteRole | None = None
    coordinates_approximate: bool | None = Field(None, description="True when the coordinates are approximate; null where not stated")
    paired_location_id: str | None = Field(None, description="The project's paired location on the other body")
    analog_basis: AnalogBasis | None = Field(None, description="An approved source's sentence linking the pair, if any")
    reported_conditions: list[ReportedCondition] = Field(default_factory=list, description="What approved sources state about each condition; not measurements")
    condition_sources: dict[str, SiteSource] = Field(default_factory=dict)

class BodyReference(BaseModel):
    id: BodyId
    name: str
    gravity_ms2: float
    solar_irradiance_wm2: float
    solar_day_hours: float
    atmosphere: str
    fact_source: Provenance
    atmosphere_source: Provenance

class ComparisonCatalog(BaseModel):
    version: str
    bodies: list[BodyReference]
    locations: list[ComparisonLocation]
