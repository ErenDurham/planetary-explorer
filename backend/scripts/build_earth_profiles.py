"""Earth candidate profiles: Copernicus GLO-90 DEM (terrain) + NASA POWER (climate).

Acquire: Cloud-Optimised GeoTIFF tiles are read over HTTPS with rasterio
(windowed reads, no login) from the AWS Open Data mirror of Copernicus DEM
GLO-90. Climate comes from the NASA POWER climatology API (no login).

Harmonize: the 90 m DEM window is block-averaged to the MOLA 16 ppd cell size
(~3.7 km) BEFORE slope and roughness are computed, so Earth and Mars terrain
statistics describe the same physical baseline. Fine-scale (90 m) slope is
also kept, labelled as such, for information only.

Run from backend/:  python scripts/build_earth_profiles.py
"""
from __future__ import annotations

import json
import math
import sys
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import from_bounds

sys.path.insert(0, str(Path(__file__).resolve().parent))
from geo import EARTH_RADIUS_KM, MARS_CELL_KM, block_average, footprint_width_km, terrain_stats, toa_annual_mean_insolation_wm2  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
DATA = BACKEND / "data"
PROFILE_VERSION = "v1"
HALF_WIDTH_DEG = 0.25
COP = "https://copernicus-dem-90m.s3.amazonaws.com/Copernicus_DSM_COG_30_{lat}_00_{lon}_00_DEM/Copernicus_DSM_COG_30_{lat}_00_{lon}_00_DEM.tif"
COP_PIXEL_M_LAT = 90.0  # 3 arc-second
POWER = "https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,T2M_MIN,T2M_MAX,ALLSKY_SFC_SW_DWN,PRECTOTCORR&community=RE&longitude={lon}&latitude={lat}&format=JSON"

DERIVED_SOURCE = {
    "source_id": "derived_toa_insolation",
    "title": "Top-of-atmosphere annual-mean insolation from latitude and orbital elements",
    "institution": "Planetary Explorer pipeline (scripts/geo.py)",
    "url": "docs/SCIENTIFIC_METHOD.md#insolation",
    "instrument_or_model": "Analytic daily-mean insolation integrated over one orbit (Earth: a=1 AU, e=0.0167, obliquity 23.44 deg)",
    "units": "W/m2", "uncertainty_notes": "Model output; ignores atmosphere.", "access_method": "computed",
}


def tile_name(lat: float, lon: float) -> tuple[str, str]:
    la = math.floor(lat); lo = math.floor(lon)
    return (f"{'N' if la >= 0 else 'S'}{abs(la):02d}", f"{'E' if lo >= 0 else 'W'}{abs(lo):03d}")


def read_dem(lat: float, lon: float, half: float) -> tuple[np.ndarray, float]:
    """Mosaic the 1-4 tiles the footprint touches and return (grid, pixel size deg)."""
    west, east, south, north = lon - half, lon + half, lat - half, lat + half
    tiles = sorted({tile_name(la, lo) for la in (south, north - 1e-9) for lo in (west, east - 1e-9)})
    pieces = {}
    px = None
    for la, lo in tiles:
        url = COP.format(lat=la, lon=lo)
        with rasterio.open(url) as ds:
            px = ds.res[1]
            b = ds.bounds
            w = from_bounds(max(west, b.left), max(south, b.bottom), min(east, b.right), min(north, b.top), ds.transform)
            arr = ds.read(1, window=w).astype(float)
            nod = ds.nodata
            if nod is not None:
                arr[arr == nod] = np.nan
            pieces[(la, lo)] = arr
    # Assemble by lat row (north first) then lon
    lats = sorted({k[0] for k in pieces}, key=lambda s: (-1 if s[0] == "S" else 1) * int(s[1:]), reverse=True)
    lons = sorted({k[1] for k in pieces}, key=lambda s: (-1 if s[0] == "W" else 1) * int(s[1:]))
    rows = []
    for la in lats:
        row = [pieces[(la, lo)] for lo in lons if (la, lo) in pieces]
        h = min(a.shape[0] for a in row)
        rows.append(np.hstack([a[:h] for a in row]))
    wmin = min(r.shape[1] for r in rows)
    grid = np.vstack([r[:, :wmin] for r in rows])
    return grid, float(px)


def power_climate(lat: float, lon: float) -> dict:
    with urllib.request.urlopen(POWER.format(lat=lat, lon=lon), timeout=60) as r:
        d = json.load(r)
    p = d["properties"]["parameter"]
    return {
        "t2m_ann": p["T2M"]["ANN"], "t2m_min": min(p["T2M_MIN"].values()), "t2m_max": max(p["T2M_MAX"].values()),
        "sw_kwh": p["ALLSKY_SFC_SW_DWN"]["ANN"], "precip": p["PRECTOTCORR"]["ANN"],
        "title": d.get("header", {}).get("title"), "api": d.get("header", {}).get("api", {}).get("version"),
    }


def measurement(fid, label, category, value, unit, source_id, mtype, res, fp, unc, flag, notes=None, missing=False):
    return {"feature_id": fid, "label": label, "category": category, "value": None if missing else value, "unit": unit,
            "source_id": source_id, "measurement_type": mtype, "spatial_resolution": res, "geographic_footprint": fp,
            "uncertainty": unc, "quality_flag": "missing" if missing else flag, "is_missing": missing, "notes": notes}


def build(c: dict, sources: dict, now: str) -> dict:
    lat, lon = c["lat"], c["lon_east"]
    fp = {"shape": "square", "center_lat": lat, "center_lon_east": lon, "half_width_deg": HALF_WIDTH_DEG, "radius_km": None,
          "crs": "EPSG:4326", "longitude_convention": "east_-180_180",
          "approx_width_km": round(footprint_width_km(HALF_WIDTH_DEG, lat, EARTH_RADIUS_KM), 1),
          "description": f"{2*HALF_WIDTH_DEG:.1f} deg square centred on the site"}
    grid, px_deg = read_dem(lat, lon, HALF_WIDTH_DEG)
    nan_frac = float(np.isnan(grid).mean())
    if nan_frac > 0:
        grid = np.where(np.isnan(grid), np.nanmedian(grid), grid)
    pix_m_lat = px_deg * 2 * math.pi * EARTH_RADIUS_KM * 1000 / 360
    pix_m_lon = pix_m_lat * math.cos(math.radians(lat))
    fine = terrain_stats(grid, pix_m_lon, pix_m_lat)
    factor = max(1, round(MARS_CELL_KM * 1000 / pix_m_lat))      # ~41 cells of 90 m -> 3.7 km
    coarse_grid = block_average(grid, factor)
    coarse = terrain_stats(coarse_grid, pix_m_lon * factor, pix_m_lat * factor)
    clim = power_climate(lat, lon)
    res_c = f"~{pix_m_lat*factor/1000:.1f} km cells (90 m DEM block-averaged x{factor}); {coarse['cells']} cells"
    res_f = f"{pix_m_lat:.0f} m pixels; {fine['cells']} pixels"
    harmon = "Harmonised to the MOLA 16 ppd cell size so it is comparable with Mars regional statistics."
    ms = [
        measurement("elevation_median_m", "Elevation (footprint median)", "ground", round(fine["elevation_median_m"], 1), "m", "copernicus_glo90", "measured", res_f, fp, "Copernicus DEM GLO-90 absolute vertical accuracy < 4 m (90% linear error); surface model, so includes vegetation/buildings where present. Datum EGM2008 - NOT comparable to Mars areoid elevations.", "good"),
        measurement("elevation_p10_m", "Elevation (10th percentile)", "ground", round(fine["elevation_p10_m"], 1), "m", "copernicus_glo90", "measured", res_f, fp, None, "good"),
        measurement("elevation_p90_m", "Elevation (90th percentile)", "ground", round(fine["elevation_p90_m"], 1), "m", "copernicus_glo90", "measured", res_f, fp, None, "good"),
        measurement("elevation_std_m", "Elevation variability (std)", "ground", round(fine["elevation_std_m"], 1), "m", "copernicus_glo90", "derived", res_f, fp, None, "good"),
        measurement("slope_regional_median_deg", "Regional slope (median, harmonised ~3.7 km)", "ground", round(coarse["slope_regional_median_deg"], 3), "deg", "copernicus_glo90", "derived", res_c, fp, "Block-averaged before gradient", "regional_scale_only", harmon),
        measurement("slope_regional_p90_deg", "Regional slope (90th pct, harmonised)", "ground", round(coarse["slope_regional_p90_deg"], 3), "deg", "copernicus_glo90", "derived", res_c, fp, None, "regional_scale_only", harmon),
        measurement("roughness_regional_m", "Detrended relief (harmonised ~3.7 km)", "ground", round(coarse["roughness_regional_m"], 1), "m", "copernicus_glo90", "derived", res_c, fp, None, "regional_scale_only", harmon),
        measurement("slope_fine_median_deg", "Fine-scale slope (median, 90 m)", "ground", round(fine["slope_regional_median_deg"], 3), "deg", "copernicus_glo90", "derived", res_f, fp, None, "good", "Information only: Mars has no counterpart at this baseline in v1."),
        measurement("latitude_abs_deg", "Absolute latitude", "light", round(abs(lat), 4), "deg", c["sources"][0], "measured", "point", fp, None, "good"),
        measurement("insolation_toa_annual_mean_wm2", "Annual-mean insolation (top of atmosphere)", "light", round(toa_annual_mean_insolation_wm2(lat, "earth"), 1), "W/m2", "derived_toa_insolation", "derived", "latitude only", fp, "Model", "good"),
        measurement("surface_sw_annual_mean_wm2", "Surface shortwave irradiance (annual mean)", "light", round(clim["sw_kwh"] * 1000 / 24, 1), "W/m2", "nasa_power", "estimated", "1 deg grid", fp, "Satellite-derived reanalysis product; converted from kWh/m2/day", "good"),
        measurement("surface_temperature_mean_c", "Mean air temperature at 2 m (annual)", "atmosphere_thermal", round(clim["t2m_ann"], 2), "degC", "nasa_power", "estimated", "0.5 x 0.625 deg grid", fp, "MERRA-2 reanalysis; coarse grid may not resolve valley/summit microclimates", "good", "Air temperature at 2 m, not ground temperature."),
        measurement("temperature_monthly_min_c", "Coldest monthly mean minimum", "atmosphere_thermal", round(clim["t2m_min"], 2), "degC", "nasa_power", "estimated", "0.5 x 0.625 deg grid", fp, None, "good"),
        measurement("temperature_monthly_max_c", "Warmest monthly mean maximum", "atmosphere_thermal", round(clim["t2m_max"], 2), "degC", "nasa_power", "estimated", "0.5 x 0.625 deg grid", fp, None, "good"),
        measurement("precipitation_mm_day", "Mean precipitation", "atmosphere_thermal", round(clim["precip"], 3), "mm/day", "nasa_power", "estimated", "0.5 x 0.625 deg grid", fp, "Bias-corrected MERRA-2 precipitation; underestimates orographic extremes", "good"),
        measurement("terrain_morphology", "Terrain morphology", "ground", c["tags_terrain"], None, c["sources"][0], "literature", None, fp, None, "qualitative"),
        measurement("mineralogy_tags", "Mineral / compositional evidence", "composition", c["tags_mineralogy"], None, c["sources"][-1], "literature", None, fp, "Qualitative tags from the cited source", "qualitative"),
    ]
    used = {"copernicus_glo90", "nasa_power", "derived_toa_insolation", *c["sources"]}
    missing = [m["feature_id"] for m in ms if m["is_missing"]]
    return {
        "site_id": c["id"], "planet": "earth", "profile_version": PROFILE_VERSION, "generated_at": now,
        "pipeline": f"scripts/build_earth_profiles.py: Copernicus GLO-90 windowed COG read (nodata fraction {nan_frac:.3f}) + block-average x{factor} + scripts/geo.py terrain statistics + NASA POWER climatology ({clim['title']}, API {clim['api']})",
        "measurements": ms, "sources": {k: sources[k] for k in used},
        "completeness": {"features_requested": len(ms), "features_available": len(ms) - len(missing), "fraction": round((len(ms) - len(missing)) / len(ms), 3), "missing_feature_ids": missing},
    }


def main() -> int:
    cfg = json.loads((DATA / "earth" / "candidates.json").read_text())
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    sources = {**cfg["sources"], "derived_toa_insolation": DERIVED_SOURCE}
    sources["copernicus_glo90"]["retrieved_at"] = date.today().isoformat()
    sources["nasa_power"]["retrieved_at"] = date.today().isoformat()
    profiles = []
    for c in cfg["candidates"]:
        print("processing", c["id"], flush=True)
        p = build(c, sources, now)
        g = {m["feature_id"]: m["value"] for m in p["measurements"]}
        print(f"  elev {g['elevation_median_m']:>7} m  slope~3.7km {g['slope_regional_median_deg']:>6} deg  rough {g['roughness_regional_m']:>6} m  fine slope {g['slope_fine_median_deg']:>6} deg  T {g['surface_temperature_mean_c']:>6} C  precip {g['precipitation_mm_day']} mm/d")
        profiles.append(p)
    out = DATA / "earth" / f"candidate_profiles.{PROFILE_VERSION}.json"
    out.write_text(json.dumps({"profile_version": PROFILE_VERSION, "generated_at": now, "footprint_definition": cfg["footprint_definition"], "profiles": profiles}, indent=2) + "\n")
    print("wrote", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
