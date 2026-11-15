"""Validate -> Harmonize -> Sample -> Derive -> Quality check -> Store, for Mars.

Reads data/mars/sites.json and the MOLA MEGDR 16 ppd grid, samples a square
footprint around each site, derives regional terrain statistics and the
latitude-driven annual-mean insolation, and writes
data/mars/site_profiles.<version>.json in the EnvironmentalProfile schema.

Run from backend/:  python scripts/build_mars_profiles.py
Deterministic: the same inputs always produce byte-identical output except
for `generated_at`.
"""
from __future__ import annotations

import json
import math
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from geo import MARS_CELL_KM, MARS_RADIUS_KM, MOLA_PPD, footprint_width_km, terrain_stats, toa_annual_mean_insolation_wm2  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
DATA = BACKEND / "data"
RAW = DATA / "raw" / "megt90n000eb.img"
LINES, SAMPLES = 2880, 5760
PROFILE_VERSION = "v1"
HALF_WIDTH_DEG = 0.5

MOLA_SOURCE = {
    "source_id": "mola_megdr_16ppd",
    "title": "MGS MOLA Mission Experiment Gridded Data Record (MEGDR), 16 pixel/degree global topography (MEGT90N000EB)",
    "institution": "NASA PDS Geosciences Node / Goddard Space Flight Center (MOLA Science Team)",
    "url": "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.lbl",
    "instrument_or_model": "Mars Global Surveyor / Mars Orbiter Laser Altimeter (MOLA)",
    "dataset_id": "MGS-M-MOLA-5-MEGDR-L3-V1.0 / MEGT90N000EB.IMG v2.0",
    "coverage": "Global, 90N-90S, 0-360E; simple cylindrical; IAU2000; areoid GMM3 (mgm1025) to degree and order 50",
    "spatial_resolution": "0.0625 deg (16 ppd) = ~3.7 km per cell at the equator",
    "units": "metres (planetary radius minus areoid radius)",
    "observation_period": "1997-09-15 to 2001-06-30 (MGS mapping, primary and extended missions)",
    "uncertainty_notes": "Each cell is the MEDIAN of MOLA shots inside it; near the equator only ~55% of cells contain a shot and the rest are interpolated, with gaps of up to 12 km between profiles. The MOLA team reports radial (vertical) shot accuracy of order 1 m after crossover adjustment (Smith et al., 2001, J. Geophys. Res. 106(E10), doi:10.1029/2000JE001364; not stated in this product label); interpolated cells inherit the local relief uncertainty. Slopes and roughness are REGIONAL (~3.7 km baseline) and say nothing about metre-scale hazards.",
    "access_method": "HTTPS download of the raw binary + PDS3 label (scripts/fetch_mola.py)",
    "license": "NASA PDS data are public domain; cite the MOLA Science Team",
    "retrieved_at": None,
}
DERIVED_SOURCE = {
    "source_id": "derived_toa_insolation",
    "title": "Top-of-atmosphere annual-mean insolation from latitude and orbital elements",
    "institution": "Planetary Explorer pipeline (scripts/geo.py)",
    "url": "docs/SCIENTIFIC_METHOD.md#insolation",
    "instrument_or_model": "Analytic daily-mean insolation integrated over one orbit (a=1.52368 AU, e=0.0934, obliquity 25.19 deg, Ls_perihelion 251 deg, S0=1361 W/m2)",
    "coverage": "Any latitude",
    "spatial_resolution": "Latitude only; no terrain or atmosphere",
    "units": "W/m2",
    "uncertainty_notes": "Model output, not a measurement. Ignores atmospheric dust opacity (which can cut surface flux by tens of percent) and local horizon. Use as a latitude-driven proxy only.",
    "access_method": "computed",
    "license": "n/a",
}


def load_grid() -> np.ndarray:
    if not RAW.exists():
        raise SystemExit(f"missing {RAW}; run scripts/fetch_mola.py first")
    a = np.fromfile(RAW, dtype=">i2")
    if a.size != LINES * SAMPLES:
        raise SystemExit(f"grid has {a.size} samples, expected {LINES*SAMPLES}")
    g = a.reshape(LINES, SAMPLES)
    # Validate against the label's stated extremes and a landmark.
    assert g.min() == -8177 and g.max() == 21171, "grid extremes disagree with MEGDR label"
    return g


def window(grid: np.ndarray, lat: float, lon_east: float, half_deg: float) -> np.ndarray:
    """Cells whose centres fall inside the square footprint. Longitude wraps."""
    lon360 = lon_east % 360
    r0 = int(math.floor((90 - (lat + half_deg)) * MOLA_PPD))
    r1 = int(math.ceil((90 - (lat - half_deg)) * MOLA_PPD))
    c0 = int(math.floor((lon360 - half_deg) * MOLA_PPD))
    c1 = int(math.ceil((lon360 + half_deg) * MOLA_PPD))
    rows = np.clip(np.arange(r0, r1), 0, LINES - 1)
    cols = np.arange(c0, c1) % SAMPLES
    return grid[np.ix_(rows, cols)]


def measurement(fid, label, category, value, unit, source_id, mtype, res, fp, unc, flag, notes=None, missing=False):
    return {
        "feature_id": fid, "label": label, "category": category,
        "value": None if missing else value, "unit": unit, "source_id": source_id,
        "measurement_type": mtype, "spatial_resolution": res, "geographic_footprint": fp,
        "uncertainty": unc, "quality_flag": "missing" if missing else flag, "is_missing": missing, "notes": notes,
    }


def build(site: dict, grid: np.ndarray, sources: dict, now: str) -> dict:
    lat, lon = site["lat"], site["lon_east"]
    # a site with no literature source yet cites its coordinate source (site_literature then marks the labels missing)
    comp = (site.get("composition_sources") or site["coordinate_sources"])[0]
    fp = {
        "shape": "square", "center_lat": lat, "center_lon_east": lon, "half_width_deg": HALF_WIDTH_DEG,
        "radius_km": None, "crs": "IAU2000:49900", "longitude_convention": "east_-180_180",
        "approx_width_km": round(footprint_width_km(HALF_WIDTH_DEG, lat, MARS_RADIUS_KM), 1),
        "description": f"{2*HALF_WIDTH_DEG:.1f} deg square centred on the site; {round(2*HALF_WIDTH_DEG*MOLA_PPD)+1}x{round(2*HALF_WIDTH_DEG*MOLA_PPD)+1} MOLA 16 ppd cells (floor/ceil edges)",
    }
    z = window(grid, lat, lon, HALF_WIDTH_DEG)
    dy_m = MARS_CELL_KM * 1000
    dx_m = dy_m * math.cos(math.radians(lat))
    st = terrain_stats(z, dx_m, dy_m)
    res = f"~{MARS_CELL_KM:.1f} km cells (16 ppd); {st['cells']} cells in footprint"
    regional = "Regional statistic at a ~3.7 km baseline; cannot resolve lander-scale hazards."
    ms = [
        measurement("elevation_median_m", "Elevation (footprint median)", "ground", round(st["elevation_median_m"], 1), "m", "mola_megdr_16ppd", "measured", res, fp, "Cell medians of MOLA shots; interpolated where no shot; relative to GMM3 areoid", "good"),
        measurement("elevation_p10_m", "Elevation (10th percentile)", "ground", round(st["elevation_p10_m"], 1), "m", "mola_megdr_16ppd", "measured", res, fp, None, "good"),
        measurement("elevation_p90_m", "Elevation (90th percentile)", "ground", round(st["elevation_p90_m"], 1), "m", "mola_megdr_16ppd", "measured", res, fp, None, "good"),
        measurement("elevation_std_m", "Elevation variability (std)", "ground", round(st["elevation_std_m"], 1), "m", "mola_megdr_16ppd", "derived", res, fp, None, "regional_scale_only", regional),
        measurement("slope_regional_median_deg", "Regional slope (median)", "ground", round(st["slope_regional_median_deg"], 3), "deg", "mola_megdr_16ppd", "derived", res, fp, "Central-difference gradient between adjacent ~3.7 km cells", "regional_scale_only", regional),
        measurement("slope_regional_p90_deg", "Regional slope (90th percentile)", "ground", round(st["slope_regional_p90_deg"], 3), "deg", "mola_megdr_16ppd", "derived", res, fp, None, "regional_scale_only", regional),
        measurement("roughness_regional_m", "Detrended relief (plane-removed std)", "ground", round(st["roughness_regional_m"], 1), "m", "mola_megdr_16ppd", "derived", res, fp, None, "regional_scale_only", regional + " Not a proxy for rock abundance."),
        measurement("latitude_abs_deg", "Absolute latitude", "light", round(abs(lat), 4), "deg", site["coordinate_sources"][0], "measured", "point", fp, None, "good", "Used by the default latitude-band hard constraint."),
        measurement("insolation_toa_annual_mean_wm2", "Annual-mean insolation (top of atmosphere)", "light", round(toa_annual_mean_insolation_wm2(lat, "mars"), 1), "W/m2", "derived_toa_insolation", "derived", "latitude only", fp, "Model; ignores dust and horizon", "good", "Seasonal variation not yet exposed as a separate metric."),
        measurement("terrain_morphology", "Terrain morphology", "ground", site["tags_terrain"], None, site["coordinate_sources"][0], "literature", None, fp, None, "qualitative"),
        measurement("mineralogy_tags", "Mineral / compositional evidence", "composition", site["tags_mineralogy"], None, comp, "literature", None, fp, "Qualitative tags from the cited source", "qualitative"),
        measurement("water_ice_evidence", "Water / ice evidence", "water_ice", site["water_ice_evidence"], None, comp, "literature", None, fp, None, "qualitative"),
        measurement("precipitation_mm_day", "Mean precipitation", "atmosphere_thermal", 0.0, "mm/day", site["coordinate_sources"][0], "literature", None, fp, None, "qualitative", "Mars has no liquid precipitation; stated as a physical fact for the aridity comparison, not a measurement."),
        # Honest gaps: nothing in v1 measures these, so they are null, not zero.
        measurement("surface_temperature_mean_c", "Mean surface temperature", "atmosphere_thermal", None, "degC", None, "measured", None, fp, None, "missing", "Not yet integrated. Candidate sources: THEMIS/TES-derived surface temperature or thermal inertia (PDS), Mars Climate Database. Engineer 2 task.", missing=True),
        measurement("atmospheric_pressure_pa", "Surface atmospheric pressure", "atmosphere_thermal", None, "Pa", None, "measured", None, fp, None, "missing", "Not yet integrated; depends on elevation and season (lander records exist for Viking, InSight, Curiosity, Perseverance).", missing=True),
        measurement("rock_abundance_pct", "Rock abundance", "hazards", None, "%", None, "measured", None, fp, None, "missing", "Not yet integrated. Candidate source: IRTM/TES rock abundance maps (Christensen 1986; Nowicki & Christensen 2007).", missing=True),
        measurement("dust_cover_index", "Dust cover", "hazards", None, None, None, "measured", None, fp, None, "missing", "Not yet integrated. Candidate source: TES Dust Cover Index (Ruff & Christensen 2002).", missing=True),
    ]
    missing = [m["feature_id"] for m in ms if m["is_missing"]]
    used = {"mola_megdr_16ppd", "derived_toa_insolation", site["coordinate_sources"][0], comp}
    return {
        "site_id": site["id"], "planet": "mars", "profile_version": PROFILE_VERSION, "generated_at": now,
        "pipeline": "scripts/build_mars_profiles.py: MOLA MEGDR 16 ppd footprint sampling + scripts/geo.py terrain statistics + analytic TOA insolation",
        "measurements": ms,
        "sources": {k: sources[k] for k in used},
        "completeness": {"features_requested": len(ms), "features_available": len(ms) - len(missing), "fraction": round((len(ms) - len(missing)) / len(ms), 3), "missing_feature_ids": missing},
    }


def main() -> int:
    cfg = json.loads((DATA / "mars" / "sites.json").read_text(encoding="utf-8"))
    grid = load_grid()
    # Landmark check: Olympus Mons summit region must be the highest of these three.
    def px(lat, lon):
        return int(grid[int((90 - lat) * MOLA_PPD), int((lon % 360) * MOLA_PPD)])
    oly, hellas = px(18.65, 226.2), px(-42.4, 70.5)
    assert oly > 15000 and hellas < -5000, f"landmark check failed: Olympus {oly}, Hellas {hellas}"
    print(f"landmarks ok: Olympus Mons {oly} m, Hellas {hellas} m")

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    MOLA_SOURCE["retrieved_at"] = date.today().isoformat()
    sources = {**cfg["sources"], "mola_megdr_16ppd": MOLA_SOURCE, "derived_toa_insolation": DERIVED_SOURCE}
    profiles = [build(s, grid, sources, now) for s in cfg["sites"]]
    out = DATA / "mars" / f"site_profiles.{PROFILE_VERSION}.json"
    out.write_text(json.dumps({"profile_version": PROFILE_VERSION, "generated_at": now, "footprint_definition": cfg["footprint_definition"], "profiles": profiles}, indent=2) + "\n")
    for p in profiles:
        g = {m["feature_id"]: m["value"] for m in p["measurements"]}
        print(f"{p['site_id']:<20} elev {g['elevation_median_m']:>8} m  slope {g['slope_regional_median_deg']:>6} deg  rough {g['roughness_regional_m']:>6} m  insol {g['insolation_toa_annual_mean_wm2']:>6} W/m2")
    print("wrote", out)
    # literature labels, text and their sources come from data/site_literature.v1.json
    from apply_site_literature import apply
    apply()
    print("applied data/site_literature.v1.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
