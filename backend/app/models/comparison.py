"""Read-only cross-body catalogue; separate from Mars mission scoring."""
from typing import Literal
from pydantic import BaseModel, Field
from .common import Provenance, ReportedCondition, SiteRole, WorkbookSource
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
    coordinates_approximate: bool = False
    paired_location_id: str | None = Field(None, description="The workbook's paired location on the other body")
    why_they_match: str | None = None
    reported_conditions: list[ReportedCondition] = Field(default_factory=list, description="Literature-reported condition texts (workbook); not measurements")
    condition_sources: dict[str, WorkbookSource] = Field(default_factory=dict)

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
