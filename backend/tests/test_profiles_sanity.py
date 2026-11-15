"""Unit and provenance sanity on the COMMITTED v1 profiles, plus the
validate_profiles script that encodes the same checks for CI. Deterministic,
network-free; the MOLA landmark check runs only when the raw grid is present."""
import json
import math
import sys
from pathlib import Path

import pytest

from app.models import EnvironmentalProfile

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "scripts"))
import validate_profiles  # noqa: E402
from geo import EARTH_RADIUS_KM, MARS_RADIUS_KM, footprint_width_km, toa_annual_mean_insolation_wm2  # noqa: E402

MARS = json.loads((BACKEND / "data/mars/site_profiles.v1.json").read_text())
EARTH = json.loads((BACKEND / "data/earth/candidate_profiles.v1.json").read_text())
PROFILES = [(p["site_id"], p) for p in MARS["profiles"]] + [(p["site_id"], p) for p in EARTH["profiles"]]
IDS = [sid for sid, _ in PROFILES]


@pytest.fixture(params=PROFILES, ids=IDS)
def profile(request) -> EnvironmentalProfile:
    return EnvironmentalProfile.model_validate(request.param[1])


def test_profile_counts():
    # the Lesser-Known Mars Sites workbook: 17 Mars sites, each paired with one Earth location
    assert len(MARS["profiles"]) == 17 and len(EARTH["profiles"]) == 17
    assert MARS["profile_version"] == EARTH["profile_version"] == "v1"


def test_every_numeric_measurement_has_a_unit_and_is_finite(profile):
    for m in profile.measurements:
        if m.is_missing:
            continue
        if isinstance(m.value, (int, float)) and not isinstance(m.value, bool):
            assert m.unit, f"{profile.site_id}.{m.feature_id} is numeric and has no unit"
            assert math.isfinite(m.value), f"{profile.site_id}.{m.feature_id} is not finite"


def test_physical_ranges(profile):
    for m in profile.measurements:
        if m.is_missing or not isinstance(m.value, (int, float)):
            continue
        fid, v = m.feature_id, float(m.value)
        if fid in ("elevation_median_m", "elevation_p10_m", "elevation_p90_m"):
            assert m.unit == "m" and -8177 <= v <= 21171, f"{profile.site_id}.{fid}={v}"
        if "slope" in fid:
            assert m.unit == "deg" and 0 <= v <= 90, f"{profile.site_id}.{fid}={v}"
        if fid.startswith("roughness_") or fid == "elevation_std_m":
            assert v >= 0, f"{profile.site_id}.{fid}={v}"
        if fid == "insolation_toa_annual_mean_wm2":
            assert m.unit == "W/m2" and 0 < v < 600, f"{profile.site_id}.{fid}={v}"
        if fid == "latitude_abs_deg":
            assert 0 <= v <= 90
        if fid == "precipitation_mm_day":
            assert v >= 0
    if profile.get("elevation_median_m").is_missing:   # DEM could not serve the footprint: every terrain value is null
        assert all(profile.get(f).is_missing for f in ("elevation_p10_m", "elevation_p90_m", "slope_regional_median_deg", "slope_regional_p90_deg"))
        return
    p10 = profile.get("elevation_p10_m").value
    med = profile.get("elevation_median_m").value
    p90 = profile.get("elevation_p90_m").value
    assert p10 <= med <= p90, "percentiles must be ordered"
    assert profile.get("slope_regional_median_deg").value <= profile.get("slope_regional_p90_deg").value


def test_footprint_coordinates_and_width(profile):
    radius = MARS_RADIUS_KM if profile.planet == "mars" else EARTH_RADIUS_KM
    for m in profile.measurements:
        fp = m.geographic_footprint
        assert fp is not None, f"{profile.site_id}.{m.feature_id} has no footprint"
        assert -90 <= fp.center_lat <= 90 and -180 <= fp.center_lon_east <= 180
        assert fp.longitude_convention == "east_-180_180"
        if abs(fp.center_lat) == 90:   # at a geographic pole the square is a cap; its diameter is given
            assert fp.approx_width_km == pytest.approx(footprint_width_km(fp.half_width_deg, 0, radius), abs=0.06)
        else:
            assert fp.approx_width_km == pytest.approx(footprint_width_km(fp.half_width_deg, fp.center_lat, radius), abs=0.06)
    lat_abs = profile.get("latitude_abs_deg")
    assert lat_abs.value == pytest.approx(abs(profile.measurements[0].geographic_footprint.center_lat), abs=1e-3)


def test_every_source_id_resolves(profile):
    for m in profile.measurements:
        if m.is_missing:
            continue
        assert m.source_id is not None, f"{profile.site_id}.{m.feature_id} has no source"
        assert m.source_id in profile.sources, f"{profile.site_id}.{m.feature_id} -> {m.source_id} not in {sorted(profile.sources)}"
    for sid, src in profile.sources.items():
        assert src.source_id == sid and src.url and src.title and src.institution


def test_missing_measurements_are_null_and_flagged(profile):
    for m in profile.measurements:
        if m.is_missing:
            assert m.value is None and m.quality_flag == "missing"
        else:
            assert m.value is not None and m.quality_flag != "missing"
    c = profile.completeness
    missing = [m.feature_id for m in profile.measurements if m.is_missing]
    assert c.features_requested == len(profile.measurements)
    assert c.features_available == len(profile.measurements) - len(missing)
    assert c.fraction == pytest.approx(c.features_available / c.features_requested, abs=0.001)
    assert sorted(c.missing_feature_ids) == sorted(missing)


def test_insolation_matches_the_pipeline_model_for_the_profile_latitude(profile):
    lat = profile.measurements[0].geographic_footprint.center_lat
    stored = profile.get("insolation_toa_annual_mean_wm2").value
    assert stored == pytest.approx(toa_annual_mean_insolation_wm2(lat, profile.planet), abs=0.06)


def _literature_gaps(site_id: str) -> set[str]:
    """Label features a site's literature gives no label for (missing, never generic)."""
    lit = json.loads((Path(__file__).resolve().parents[1] / "data" / "site_literature.v1.json").read_text(encoding="utf-8"))["sites"][site_id]
    tagged = {e["feature"] for e in lit["evidence"] if e["tags"]}
    gaps = {"terrain_morphology", "mineralogy_tags"} - tagged
    if lit.get("planet") == "mars" and not lit.get("water_ice_evidence"):
        gaps.add("water_ice_evidence")
    return gaps


def test_mars_profiles_state_the_honest_gaps():
    for p in MARS["profiles"]:
        gaps = {m["feature_id"] for m in p["measurements"] if m["is_missing"]}
        # labels exist only where a recent source states them (data/site_literature.v1.json)
        literature_gaps = _literature_gaps(p["site_id"])
        assert gaps == {"surface_temperature_mean_c", "atmospheric_pressure_pa", "rock_abundance_pct", "dust_cover_index"} | literature_gaps
        tags = {m["feature_id"]: m["value"] for m in p["measurements"] if isinstance(m["value"], list)}
        assert set(tags) == {"terrain_morphology", "mineralogy_tags"} - literature_gaps and all(tags.values())



def test_earth_profiles_are_complete_and_harmonised():
    for p in EARTH["profiles"]:
        by = {m["feature_id"]: m for m in p["measurements"]}
        # only literature labels may be missing: DEM and POWER serve every footprint, the pole's included
        assert set(p["completeness"]["missing_feature_ids"]) == _literature_gaps(p["site_id"]), p["site_id"]
        if p["site_id"] == "south_pole_station":   # reprojected polar cap, not a collapsed lat/lon square
            assert "azimuthal equidistant" in by["elevation_median_m"]["geographic_footprint"]["description"]
        assert "3.7 km" in by["slope_regional_median_deg"]["spatial_resolution"], "regional slope must be at the MOLA cell size"
        assert by["slope_regional_median_deg"]["quality_flag"] == "regional_scale_only"


def test_validate_profiles_script_passes_on_committed_data():
    reports, cross, info = validate_profiles.run("v1", mola=False)
    assert [r.site_id for r in reports] == IDS
    assert all(r.ok for r in reports), [(r.site_id, r.failures) for r in reports if not r.ok]
    assert cross == []


def test_validate_profiles_script_catches_broken_profiles():
    bad = json.loads(json.dumps(MARS["profiles"][0]))
    by = {m["feature_id"]: m for m in bad["measurements"]}
    by["elevation_median_m"]["value"] = 30000.0          # above MOLA max
    by["slope_regional_median_deg"]["unit"] = None        # numeric without unit
    by["surface_temperature_mean_c"]["value"] = 0.0       # a missing value sneaking in as zero
    by["roughness_regional_m"]["source_id"] = "nowhere"   # unresolvable provenance
    rep = validate_profiles.check_profile(bad)
    text = "\n".join(rep.failures)
    assert not rep.ok
    assert "outside MOLA label range" in text and "carries no unit" in text and "must be null" in text and "does not resolve" in text
    assert "completeness.features_available" not in text, "a zero masquerading as missing still counts as missing in the arithmetic"
    assert validate_profiles.check_profile({"site_id": "x"}).failures[0].startswith("schema:")


def test_validate_profiles_main_exit_code(capsys):
    rc = validate_profiles.main(["--no-mola"])
    out = capsys.readouterr().out
    assert rc == 0 and "34 profiles checked" in out and "0 failure(s)" in out
    assert out.count(" ok") >= 34


@pytest.mark.skipif(not validate_profiles.LANDMARKS or not (BACKEND / "data/raw/megt90n000eb.img").exists(), reason="raw MOLA grid not downloaded")
def test_mola_landmarks_when_raw_grid_present():
    fails, info = validate_profiles.check_mola_landmarks()
    assert fails == [] and any("olympus_mons" in i for i in info) and any("hellas_basin" in i for i in info)
