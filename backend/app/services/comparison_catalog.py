"""Expose original Earth/Mars profiles and curated lunar descriptions.

Lunar records deliberately contain no numeric terrain/climate estimates. Body
reference values are never inserted into a local environmental profile.
"""
import json
from app.models.comparison import ComparisonCatalog, ComparisonLocation
from app.services.data_loader import DataError, get_store

def comparison_catalog() -> ComparisonCatalog:
    store = get_store()
    path = store.data_dir / "comparison" / "catalog.v1.json"
    if not path.exists():
        raise DataError("Comparison reference catalogue is not installed")
    data = json.loads(path.read_text(encoding="utf-8"))
    locations = []
    for body, sites in (("earth", store.earth_candidates()), ("mars", store.sites())):
        for site in sites:
            profile = store.earth_profile(site.id) if body == "earth" else store.profile(site.id)
            if profile is None:
                continue
            width = site.footprint.approx_width_km
            locations.append(ComparisonLocation(
                id=site.id, body=body, name=site.name, region=site.region,
                description=site.description, lat=site.lat, lon_east=site.lon_east,
                coverage=f"Regional footprint · ~{width:.0f} km wide" if width else "Regional footprint",
                measurements=profile.measurements, sources=profile.sources,
                source_ids=site.sources if body == "earth" else site.coordinate_sources,
                role=site.role, coordinates_approximate=site.coordinates_approximate,
                paired_location_id=site.paired_mars_site_id if body == "earth" else site.paired_earth_site_id,
                why_they_match=site.why_they_match if body == "earth" else store.why_they_match(site.id),
                reported_conditions=site.reported_conditions, condition_sources=site.condition_sources,
            ))
    return ComparisonCatalog(version=data["version"], bodies=data["bodies"], locations=locations + data["locations"])
