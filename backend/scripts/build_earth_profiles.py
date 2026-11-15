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
from collections import defaultdict
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import from_bounds

sys.path.insert(0, str(Path(__file__).resolve().parent))
from geo import EARTH_RADIUS_KM, MARS_CELL_KM, block_average_xy, footprint_width_km, terrain_stats, toa_annual_mean_insolation_wm2  # noqa: E402

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


def read_dem(lat: float, lon: float, half: float) -> tuple[np.ndarray, float, float]:
    """Mosaic the 1-4 tiles the footprint touches and return (grid, lon pixel deg, lat pixel deg).

    Copernicus GLO-90 pixels are NOT square in degrees above 50 N/S: the
    longitude spacing is 1.5x (50-60), 2x (60-70), 3x (70-80) ... coarser than
    the 3 arc-second latitude spacing, so both sizes are returned and used."""
    west, east, south, north = lon - half, lon + half, lat - half, lat + half
    tiles = sorted({tile_name(la, lo) for la in (south, north - 1e-9) for lo in (west, east - 1e-9)})
    pieces = {}
    px_x = px_y = None
    for la, lo in tiles:
        url = COP.format(lat=la, lon=lo)
        with rasterio.open(url) as ds:
            px_x, px_y = ds.res[0], ds.res[1]
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
    return grid, float(px_x), float(px_y)


POLAR_BIN_M = 90.0


def read_dem_polar(lat: float, half: float) -> tuple[np.ndarray, float, str]:
    """Footprint centred on a geographic pole, where a lat/lon square collapses.

    Reads the 0.25 deg cap from every 1-degree tile of the polar tile row (360
    windowed COG reads), reprojects each pixel centre to an azimuthal
    equidistant plane centred on the pole (r = angular distance x metres per
    degree), and bins the elevations into a regular POLAR_BIN_M grid. The
    returned grid is the square inscribed in the cap, so every cell holds DEM
    pixels and no gap is filled. Returns (grid, cell size m, description)."""
    sign = -1 if lat < 0 else 1
    deg_m = 2 * math.pi * EARTH_RADIUS_KM * 1000 / 360
    radius_m = half * deg_m
    side = radius_m * math.sqrt(2)                       # inscribed square
    n = int(side // POLAR_BIN_M)
    lat_row = f"{'S' if sign < 0 else 'N'}{90 if sign < 0 else 89:02d}"
    sums, counts = np.zeros(n * n), np.zeros(n * n)

    def tile(lo: int):
        lon_tag = f"{'E' if lo >= 0 else 'W'}{abs(lo):03d}"
        with rasterio.open(COP.format(lat=lat_row, lon=lon_tag)) as ds:
            south, north = (-90.0, -90.0 + half) if sign < 0 else (90.0 - half, 90.0)
            w = from_bounds(lo, max(south, ds.bounds.bottom), lo + 1, min(north, ds.bounds.top), ds.transform)
            arr = ds.read(1, window=w).astype(float)
            if ds.nodata is not None:
                arr[arr == ds.nodata] = np.nan
            return arr, ds.window_transform(w)

    # 360 sequential HTTPS range reads (~0.7 s each); skipping GDAL's directory
    # listing on open is what keeps each one fast
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
        tiles = [tile(lo) for lo in range(-180, 180)]
    for arr, t in tiles:
        rows, cols = np.indices(arr.shape)
        plon = t.c + (cols + 0.5) * t.a
        plat = t.f + (rows + 0.5) * t.e
        r = (90.0 - sign * plat) * deg_m
        x, y = r * np.cos(np.radians(plon)), r * np.sin(np.radians(plon))
        ix = np.floor((x + side / 2) / POLAR_BIN_M).astype(int)
        iy = np.floor((side / 2 - y) / POLAR_BIN_M).astype(int)
        ok = (ix >= 0) & (ix < n) & (iy >= 0) & (iy < n) & np.isfinite(arr)
        np.add.at(sums, iy[ok] * n + ix[ok], arr[ok])
        np.add.at(counts, iy[ok] * n + ix[ok], 1)
    grid = np.where(counts > 0, sums / np.maximum(counts, 1), np.nan).reshape(n, n)
    desc = (f"Polar cap: the {2 * half:.1f} deg square collapses at the pole, so the DEM cap of radius {half} deg was reprojected to an "
            f"azimuthal equidistant plane and binned at {POLAR_BIN_M:.0f} m; statistics use the {side / 1000:.1f} km square inscribed in the cap")
    return grid, POLAR_BIN_M, desc


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
    # a candidate with no literature source yet cites the workbook for its coordinates
    lit_first = c["sources"][0] if c["sources"] else "workbook_lesser_known_sites"
    lit_last = c["sources"][-1] if c["sources"] else "workbook_lesser_known_sites"
    fp = {"shape": "square", "center_lat": lat, "center_lon_east": lon, "half_width_deg": HALF_WIDTH_DEG, "radius_km": None,
          "crs": "EPSG:4326", "longitude_convention": "east_-180_180",
          "approx_width_km": round(footprint_width_km(HALF_WIDTH_DEG, lat, EARTH_RADIUS_KM), 1),
          "description": f"{2*HALF_WIDTH_DEG:.1f} deg square centred on the site"}
    if fp["approx_width_km"] <= 0:   # at a geographic pole the lat/lon square collapses to a cap
        fp["approx_width_km"] = round(2 * HALF_WIDTH_DEG * 2 * math.pi * EARTH_RADIUS_KM / 360, 1)
        fp["description"] = (f"At the geographic pole the {2*HALF_WIDTH_DEG:.1f} deg square is a polar cap of radius {HALF_WIDTH_DEG} deg; "
                             "width given is its pole-to-edge-to-pole diameter")
    # A footprint the DEM or POWER cannot serve (e.g. beyond the last tile row at the
    # geographic South Pole) gets those measurements MISSING with the reason, never estimated.
    dem_error = power_error = None
    try:
        if abs(lat) + HALF_WIDTH_DEG > 90:
            grid, cell_m, fp["description"] = read_dem_polar(lat, HALF_WIDTH_DEG)
            pix_m_lat = pix_m_lon = cell_m
        else:
            grid, px_x_deg, px_y_deg = read_dem(lat, lon, HALF_WIDTH_DEG)
            deg_m = 2 * math.pi * EARTH_RADIUS_KM * 1000 / 360
            pix_m_lat = px_y_deg * deg_m
            pix_m_lon = px_x_deg * deg_m * math.cos(math.radians(lat))
        nan_frac = float(np.isnan(grid).mean())
        if nan_frac > 0:
            grid = np.where(np.isnan(grid), np.nanmedian(grid), grid)
        fine = terrain_stats(grid, pix_m_lon, pix_m_lat)
        # Separate block factors per axis so the harmonised cell is ~3.7 km in BOTH directions
        # (~40 x 90 m cells N-S at any latitude; fewer E-W where the tile's longitude spacing is coarser).
        fy = max(1, round(MARS_CELL_KM * 1000 / pix_m_lat))
        fx = max(1, round(MARS_CELL_KM * 1000 / pix_m_lon))
        coarse_grid = block_average_xy(grid, fy, fx)
        coarse = terrain_stats(coarse_grid, pix_m_lon * fx, pix_m_lat * fy)
    except Exception as e:  # noqa: BLE001 - logged on the measurements, never guessed around
        dem_error = f"{type(e).__name__}: {e}"
        fine = coarse = defaultdict(float, cells=0)
        nan_frac, pix_m_lat, pix_m_lon, fy, fx = float("nan"), float("nan"), float("nan"), 1, 1
    factor = f"{fy}x{fx}"
    try:
        clim = power_climate(lat, lon)
    except Exception as e:  # noqa: BLE001
        power_error = f"{type(e).__name__}: {e}"
        clim = defaultdict(float, title=None, api=None)
    res_c = f"~{pix_m_lat*fy/1000:.1f} km (N-S) x {pix_m_lon*fx/1000:.1f} km (E-W) cells (DEM block-averaged {factor}); {coarse['cells']} cells"
    res_f = f"{pix_m_lat:.0f} m (N-S) x {pix_m_lon:.0f} m (E-W) pixels; {fine['cells']} pixels"
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
        measurement("latitude_abs_deg", "Absolute latitude", "light", round(abs(lat), 4), "deg", lit_first, "measured", "point", fp, None, "good"),
        measurement("insolation_toa_annual_mean_wm2", "Annual-mean insolation (top of atmosphere)", "light", round(toa_annual_mean_insolation_wm2(lat, "earth"), 1), "W/m2", "derived_toa_insolation", "derived", "latitude only", fp, "Model", "good"),
        measurement("surface_sw_annual_mean_wm2", "Surface shortwave irradiance (annual mean)", "light", round(clim["sw_kwh"] * 1000 / 24, 1), "W/m2", "nasa_power", "estimated", "1 deg grid", fp, "Satellite-derived reanalysis product; converted from kWh/m2/day", "good"),
        measurement("surface_temperature_mean_c", "Mean air temperature at 2 m (annual)", "atmosphere_thermal", round(clim["t2m_ann"], 2), "degC", "nasa_power", "estimated", "0.5 x 0.625 deg grid", fp, "MERRA-2 reanalysis; coarse grid may not resolve valley/summit microclimates", "good", "Air temperature at 2 m, not ground temperature."),
        measurement("temperature_monthly_min_c", "Coldest monthly mean minimum", "atmosphere_thermal", round(clim["t2m_min"], 2), "degC", "nasa_power", "estimated", "0.5 x 0.625 deg grid", fp, None, "good"),
        measurement("temperature_monthly_max_c", "Warmest monthly mean maximum", "atmosphere_thermal", round(clim["t2m_max"], 2), "degC", "nasa_power", "estimated", "0.5 x 0.625 deg grid", fp, None, "good"),
        measurement("precipitation_mm_day", "Mean precipitation", "atmosphere_thermal", round(clim["precip"], 3), "mm/day", "nasa_power", "estimated", "0.5 x 0.625 deg grid", fp, "Bias-corrected MERRA-2 precipitation; underestimates orographic extremes", "good"),
        measurement("terrain_morphology", "Terrain morphology", "ground", c["tags_terrain"], None, lit_first, "literature", None, fp, None, "qualitative"),
        measurement("mineralogy_tags", "Mineral / compositional evidence", "composition", c["tags_mineralogy"], None, lit_last, "literature", None, fp, "Qualitative tags from the cited source", "qualitative"),
    ]
    for m in ms:
        err = {"copernicus_glo90": dem_error, "nasa_power": power_error}.get(m["source_id"])
        if err:
            m.update(value=None, is_missing=True, quality_flag="missing",
                     notes=f"{'Copernicus GLO-90' if m['source_id'] == 'copernicus_glo90' else 'NASA POWER'} could not serve this footprint ({err[:160]}); not estimated.")
    used = {"copernicus_glo90", "nasa_power", "derived_toa_insolation", lit_first, *c["sources"]}
    missing = [m["feature_id"] for m in ms if m["is_missing"]]
    return {
        "site_id": c["id"], "planet": "earth", "profile_version": PROFILE_VERSION, "generated_at": now,
        "pipeline": f"scripts/build_earth_profiles.py: Copernicus GLO-90 windowed COG read (nodata fraction {nan_frac:.3f}) + block-average {factor} (rows x cols) + scripts/geo.py terrain statistics + NASA POWER climatology ({clim['title']}, API {clim['api']})",
        "measurements": ms, "sources": {k: sources[k] for k in used},
        "completeness": {"features_requested": len(ms), "features_available": len(ms) - len(missing), "fraction": round((len(ms) - len(missing)) / len(ms), 3), "missing_feature_ids": missing},
    }


def main() -> int:
    cfg = json.loads((DATA / "earth" / "candidates.json").read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    sources = {**cfg["sources"], "derived_toa_insolation": DERIVED_SOURCE}
    sources["copernicus_glo90"]["retrieved_at"] = date.today().isoformat()
    sources["nasa_power"]["retrieved_at"] = date.today().isoformat()
    profiles = []
    for c in cfg["candidates"]:
        print("processing", c["id"], flush=True)
        p = build(c, sources, now)
        g = {m["feature_id"]: str(m["value"]) for m in p["measurements"]}
        print(f"  elev {g['elevation_median_m']:>7} m  slope~3.7km {g['slope_regional_median_deg']:>6} deg  rough {g['roughness_regional_m']:>6} m  fine slope {g['slope_fine_median_deg']:>6} deg  T {g['surface_temperature_mean_c']:>6} C  precip {g['precipitation_mm_day']} mm/d")
        profiles.append(p)
    out = DATA / "earth" / f"candidate_profiles.{PROFILE_VERSION}.json"
    out.write_text(json.dumps({"profile_version": PROFILE_VERSION, "generated_at": now, "footprint_definition": cfg["footprint_definition"], "profiles": profiles}, indent=2) + "\n")
    print("wrote", out)
    # literature labels, text and their sources come from data/site_literature.v1.json
    from apply_site_literature import apply
    apply()
    print("applied data/site_literature.v1.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
