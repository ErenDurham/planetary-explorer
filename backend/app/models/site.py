"""Candidate sites and their environmental profiles."""
from __future__ import annotations

from pydantic import BaseModel, Field

from .common import (
    EarthAnalogNote,
    GeographicFootprint,
    MeasurementCategory,
    MeasurementType,
    Planet,
    Provenance,
    QualityFlag,
    ReportedCondition,
    SiteRole,
    WorkbookSource,
)


class Site(BaseModel):
    id: str = Field(..., pattern=r"^[a-z0-9_]+$")
    planet: Planet
    name: str
    region: str
    lat: float = Field(..., ge=-90, le=90, description="Planetocentric latitude, degrees")
    lon_east: float = Field(..., ge=-180, le=180, description="East-positive longitude, -180..180")
    footprint: GeographicFootprint
    description: str
    heritage: str | None = Field(None, description="Mission that landed or selected this site, if any")
    tags: list[str] = Field(default_factory=list, description="Terrain / geology keywords used by the analog engine")
    coordinate_sources: list[str] = Field(default_factory=list, description="source_ids for the coordinates")
    # Lesser-Known Mars Sites workbook (data/workbook/lesser_known_sites.v1.json)
    role: SiteRole | None = Field(None, description="How the workbook author classes the site; organises the site lists, never scored")
    notes: str | None = Field(None, description="The workbook author's note on the site")
    coordinates_approximate: bool = Field(False, description="The workbook marks these coordinates as approximate")
    paired_earth_site_id: str | None = Field(None, description="The Earth location the workbook pairs with this site")
    reported_conditions: list[ReportedCondition] = Field(default_factory=list, description="Literature-reported condition texts; separate from measured profiles")
    earth_analogs: list[EarthAnalogNote] = Field(default_factory=list, description="Further Earth analogs the workbook lists for this site")
    condition_sources: dict[str, WorkbookSource] = Field(default_factory=dict, description="Every source cited by reported_conditions")


class EnvironmentalMeasurement(BaseModel):
    """One metric for one site. `value` is null when `is_missing` is true;
    never zero. Numeric values are floats; categorical ones are strings or
    lists of strings."""

    feature_id: str
    label: str
    category: MeasurementCategory
    value: float | str | list[str] | None = None
    unit: str | None = None
    source_id: str | None = None
    measurement_type: MeasurementType
    spatial_resolution: str | None = None
    geographic_footprint: GeographicFootprint | None = None
    uncertainty: str | None = None
    quality_flag: QualityFlag
    is_missing: bool = False
    notes: str | None = None


class Completeness(BaseModel):
    features_requested: int
    features_available: int
    fraction: float = Field(..., ge=0, le=1)
    missing_feature_ids: list[str] = Field(default_factory=list)


class EnvironmentalProfile(BaseModel):
    site_id: str
    planet: Planet
    profile_version: str
    generated_at: str
    pipeline: str = Field(..., description="Script and method that produced this profile")
    measurements: list[EnvironmentalMeasurement]
    sources: dict[str, Provenance]
    completeness: Completeness

    def get(self, feature_id: str) -> EnvironmentalMeasurement | None:
        for m in self.measurements:
            if m.feature_id == feature_id:
                return m
        return None


class SiteWithProfile(BaseModel):
    site: Site
    profile: EnvironmentalProfile


class SiteListResponse(BaseModel):
    planet: Planet
    sites: list[Site]
    profile_version: str
