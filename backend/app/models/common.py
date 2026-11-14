"""Shared primitive types used across every model.

Why this file exists: the frontend's TypeScript types are generated from the
OpenAPI document, so every enum and small record that appears in more than one
model has to be defined exactly once here, or the generated types drift.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Planet = Literal["mars", "earth"]

# How a value came to be. "measured" = read from an instrument dataset;
# "derived" = computed from measured data by a documented method;
# "literature" = taken from a cited publication or agency page (often
# qualitative); "estimated" = model output; "demo_fixture" = placeholder for
# development only and must never be presented as evidence.
MeasurementType = Literal["measured", "derived", "literature", "estimated", "demo_fixture"]

# Quality status shown next to each metric in the UI.
QualityFlag = Literal[
    "good",                # fit for use at the stated resolution
    "regional_scale_only", # too coarse to infer landing-scale hazards
    "qualitative",         # categorical / descriptive, not a number
    "low_confidence",      # sourced but uncertain
    "demo_fixture",        # not real data
    "missing",             # no value available
]

MeasurementCategory = Literal[
    "ground", "atmosphere_thermal", "light", "water_ice", "hazards", "composition"
]

LongitudeConvention = Literal["east_0_360", "east_-180_180"]


class GeographicFootprint(BaseModel):
    """The area a measurement summarises. A site is a footprint, not a point.

    Mars coordinates are planetocentric latitude and east-positive longitude on
    the IAU2000 Mars reference (MOLA MEGDR convention). Earth coordinates are
    WGS84 (EPSG:4326). Both store longitude in the -180..180 convention so the
    frontend can use one formula for marker placement.
    """

    shape: Literal["square", "circle", "point"] = "square"
    center_lat: float = Field(..., ge=-90, le=90)
    center_lon_east: float = Field(..., ge=-180, le=180, description="East-positive longitude, -180..180")
    half_width_deg: float | None = Field(None, gt=0, description="Half-width of a square footprint, degrees")
    radius_km: float | None = Field(None, gt=0)
    crs: str = Field(..., description='e.g. "IAU2000:49900" (Mars planetocentric) or "EPSG:4326"')
    longitude_convention: LongitudeConvention = "east_-180_180"
    approx_width_km: float | None = Field(None, description="Footprint width in km at this latitude")
    description: str | None = None


class Provenance(BaseModel):
    """Where a number came from. Every measurement carries a source_id that
    resolves to one of these in the profile's `sources` map."""

    source_id: str
    title: str
    institution: str
    url: str
    instrument_or_model: str | None = None
    dataset_id: str | None = None
    coverage: str | None = None
    spatial_resolution: str | None = None
    units: str | None = None
    observation_period: str | None = None
    uncertainty_notes: str | None = None
    access_method: str | None = None
    license: str | None = None
    retrieved_at: str | None = Field(None, description="ISO date the data was fetched")


class ApiErrorBody(BaseModel):
    code: str
    message: str
    details: dict | list | str | None = None


class ApiError(BaseModel):
    """Structured error envelope returned on every non-2xx response."""

    error: ApiErrorBody
