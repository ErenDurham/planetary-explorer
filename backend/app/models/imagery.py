"""Verified site imagery manifest.

Every entry is a real observational product from an allow-listed NASA/JPL/
USGS/ESA source. The manifest records what the image is, who made it, when it
was ACQUIRED (null unless verified; the source page's release date is kept
separately), its resolution if known, how it relates geographically to the
candidate point (exact landing location, landing ellipse, wider region, or a
nearby scene) and a plain-language caveat. Missing imagery is a valid state.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ImageType = Literal["orbital_mosaic", "orbital_image", "surface_panorama", "surface_image", "orbital_map"]
Relationship = Literal["exact_location", "landing_ellipse", "candidate_region", "nearby_scene"]
ViewKind = Literal["orbital", "surface"]


class ImageBounds(BaseModel):
    """Geographic extent, east-positive degrees, -180..180. Only present when
    the extent is known from the tiling scheme or a georeferenced product."""

    west: float
    east: float
    south: float
    north: float
    source: str = Field(..., description="How the bounds were established, e.g. 'WMTS tile grid, zoom 11'")


class ImageryEntry(BaseModel):
    entry_id: str = Field(..., pattern=r"^[a-z0-9_]+$")
    site_id: str
    view: ViewKind
    image_type: ImageType
    title: str
    institution: str
    credit: str
    license: str
    instrument: str | None = None
    mission: str | None = None
    source_page_url: str = Field(..., description="Authoritative page describing the product")
    asset_url: str = Field(..., description="Allow-listed original asset URL")
    local_asset: str | None = Field(None, description="Cached copy under data/imagery/assets, served by the API")
    mime_type: str | None = None
    width_px: int | None = None
    height_px: int | None = None
    bytes: int | None = None
    acquisition_date: str | None = Field(None, description="ISO date the data was ACQUIRED; null if not verified")
    acquisition_note: str | None = None
    release_date: str | None = Field(None, description="Date the source published the product; not an acquisition date")
    spatial_resolution_m_per_px: float | None = Field(None, description="Ground sampling of THIS asset if known")
    resolution_note: str | None = None
    bounds: ImageBounds | None = None
    coverage_evidence: str = Field(..., description="Why we believe this image covers the stated location")
    relationship: Relationship
    distance_from_site_km: float | None = Field(None, description="Approximate offset of the scene centre from the candidate point, if known")
    relevance: str = Field(..., description="Human-readable relevance and caveat shown beside the image")
    appearance_note: str | None = Field(None, description="Processing / colour caveats, e.g. stretched or false colour")
    verified_on: str


class SiteImagery(BaseModel):
    site_id: str
    body: Literal["mars", "earth"] = "mars"
    entries: list[ImageryEntry]
    missing_views: list[ViewKind] = Field(default_factory=list, description="Views with no verified imagery for this site")
    notes: list[str] = Field(default_factory=list)


class ImageryManifest(BaseModel):
    version: str
    generated_at: str
    allowlist: list[str] = Field(..., description="Hosts the backend may fetch assets from")
    sites: dict[str, SiteImagery] = Field(..., description="Keyed by location id; Mars sites and Earth analog candidates share the map")
