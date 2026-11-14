"""Small builders for synthetic sites, candidates and profiles used by the
engine tests. Everything here is deterministic and network-free.

Numeric feature values are passed as a mapping {feature_id: value}; a value of
None produces a MISSING measurement (value null, is_missing true), never a zero.
Lists of strings become categorical tag measurements.
"""
from __future__ import annotations

from app.models import EarthCandidate, EnvironmentalProfile, MissionProfile, Site

UNITS = {
    "elevation_median_m": "m",
    "elevation_p10_m": "m",
    "elevation_p90_m": "m",
    "elevation_std_m": "m",
    "slope_regional_median_deg": "deg",
    "slope_regional_p90_deg": "deg",
    "roughness_regional_m": "m",
    "latitude_abs_deg": "deg",
    "insolation_toa_annual_mean_wm2": "W/m2",
    "surface_temperature_mean_c": "degC",
    "precipitation_mm_day": "mm/day",
}

FOOTPRINT_MARS = {"shape": "square", "center_lat": 0.0, "center_lon_east": 0.0, "half_width_deg": 0.5, "crs": "IAU2000:49900", "approx_width_km": 59.3}
FOOTPRINT_EARTH = {"shape": "square", "center_lat": 0.0, "center_lon_east": 0.0, "half_width_deg": 0.25, "crs": "EPSG:4326", "approx_width_km": 55.6}


def _measurement(fid: str, value, planet: str):
    missing = value is None
    categorical = isinstance(value, (list, str))
    return {
        "feature_id": fid,
        "label": fid.replace("_", " ") + (" (median)" if "median" in fid else ""),
        "category": "composition" if fid == "mineralogy_tags" else "ground",
        "value": value,
        "unit": None if categorical else UNITS.get(fid, "x"),
        "source_id": "test_source",
        "measurement_type": "literature" if categorical else "measured",
        "spatial_resolution": "latitude only" if fid == "insolation_toa_annual_mean_wm2" else "~3.7 km cells",
        "geographic_footprint": FOOTPRINT_MARS if planet == "mars" else FOOTPRINT_EARTH,
        "quality_flag": "missing" if missing else ("qualitative" if categorical else "good"),
        "is_missing": missing,
    }


def make_profile(site_id: str, planet: str, features: dict) -> EnvironmentalProfile:
    ms = [_measurement(fid, v, planet) for fid, v in features.items()]
    available = sum(1 for v in features.values() if v is not None)
    return EnvironmentalProfile(
        site_id=site_id, planet=planet, profile_version="test", generated_at="2026-01-01T00:00:00+00:00", pipeline="tests/factories.py",
        measurements=ms, sources={"test_source": {"source_id": "test_source", "title": "synthetic", "institution": "tests", "url": "about:blank"}},
        completeness={"features_requested": len(ms), "features_available": available, "fraction": (available / len(ms)) if ms else 0.0,
                      "missing_feature_ids": [fid for fid, v in features.items() if v is None]},
    )


def make_site(site_id: str, features: dict, lat: float = 0.0, lon: float = 0.0) -> tuple[Site, EnvironmentalProfile]:
    site = Site(id=site_id, planet="mars", name=site_id.replace("_", " ").title(), region="test region", lat=lat, lon_east=lon,
                footprint=FOOTPRINT_MARS, description="synthetic test site")
    return site, make_profile(site_id, "mars", features)


def make_candidate(cid: str, features: dict | None, lat: float = 0.0, lon: float = 0.0) -> tuple[EarthCandidate, EnvironmentalProfile | None]:
    cand = EarthCandidate(id=cid, name=cid.replace("_", " ").title(), region="test", country="Testland", lat=lat, lon_east=lon,
                          footprint=FOOTPRINT_EARTH, description="synthetic candidate", known_analog_use=["unit tests"], sources=["test_source"])
    return cand, (None if features is None else make_profile(cid, "earth", features))


def mission(weights: dict[str, float], policy: str = "common_feature_set", hard_constraints: list | None = None) -> MissionProfile:
    return MissionProfile(criteria=[{"criterion_id": k, "weight": v} for k, v in weights.items()], missing_data_policy=policy,
                          hard_constraints=hard_constraints or [])
