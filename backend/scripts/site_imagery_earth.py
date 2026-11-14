"""Earth globe texture and georeferenced Earth orbital context, from NASA GIBS.

NASA Global Imagery Browse Services (GIBS, https://gibs.earthdata.nasa.gov)
serves public-domain NASA imagery as WMTS tiles with no login. EPSG:4326 tile
matrix sets here are 512 px tiles on a grid whose level L has
MatrixHeight(L) rows over 180 degrees (2,3,5,10,20,40,80,160,320,640,1280),
so a tile spans 180/MatrixHeight degrees and its bounds are exact.

* Globe texture: `BlueMarble_NextGeneration` (NASA Earth Observatory Blue
  Marble Next Generation, 500 m set, level 3 = 10x5 tiles -> 5120x2560,
  resized to 4096x2048 to match the Mars texture). Credit: NASA Earth
  Observatory (Reto Stöckli, NASA GSFC). Public domain.
* Orbital context per Earth site: `Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual`
  (Landsat 7 ETM+ Web-Enabled Landsat Data annual composite; GIBS serves the
  2000 annual composite, time=2000-12-01). 31.25 m set: level 10 (61 m/px,
  2x2 tiles = ~62.6 km, matching the Mars regional mosaic) and level 11
  (30.5 m/px, 2x2 tiles = ~31 km). Where WELD has no data (high latitude,
  e.g. the Dry Valleys) the tiles come back blank; the script detects that and
  falls back to `MODIS_Terra_CorrectedReflectance_TrueColor` (250 m set,
  level 8 = ~0.56 deg tiles) on an austral-summer date, labelled as such.
  Credit: NASA GIBS / Landsat WELD (USGS/NASA), or NASA GIBS / MODIS LANCE.

Run from backend/:  python scripts/site_imagery_earth.py
"""
from __future__ import annotations

import io
import json
import math
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

from PIL import Image, ImageStat

BACKEND = Path(__file__).resolve().parents[1]
IMG = BACKEND / "data" / "imagery"
ASSETS = IMG / "assets"
TEXTURES = BACKEND.parent / "frontend" / "public" / "textures"
GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/{layer}/default/{time}/{tms}/{z}/{row}/{col}.jpeg"
KM_PER_DEG = 2 * math.pi * 6371.0 / 360  # 111.19 km
HEIGHTS = [1, 2, 3, 5, 10, 20, 40, 80, 160, 320, 640, 1280]  # MatrixHeight per level (both sets)
UA = "PlanetaryExplorer/0.1 (hackathon; GitHub AlveeraMunshi/planetary-explorer)"
WELD = dict(layer="Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual", time="2000-12-01", tms="31.25m",
            credit="NASA GIBS / Landsat 7 WELD annual composite (USGS/NASA)", acquisition_note="Annual composite of Landsat 7 ETM+ scenes for the year 2000 (WELD); individual scene dates are not tracked.",
            title="Landsat WELD true-colour annual composite (2000)")
MODIS = dict(layer="MODIS_Terra_CorrectedReflectance_TrueColor", time="2016-01-15", tms="250m",
             credit="NASA GIBS / MODIS Terra corrected reflectance (LANCE)", acquisition_note="Single-day MODIS Terra true-colour image acquired 2016-01-15 (austral summer), 250 m.",
             title="MODIS Terra true colour, 2016-01-15")


def fetch(url: str, attempts: int = 3) -> Image.Image | None:
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            data = urllib.request.urlopen(req, timeout=60).read()
            im = Image.open(io.BytesIO(data)); im.load()
            return im.convert("RGB")
        except Exception:  # noqa: BLE001
            time.sleep(0.5 + i)
    return None


def stitch(lat: float, lon: float, z: int, n: int, src: dict) -> tuple[Image.Image, dict] | None:
    deg = 180 / HEIGHTS[z]
    row0, col0 = int((90 - lat) // deg), int((lon + 180) // deg)
    # 2x2 block positioned so the site is near the centre
    r0 = row0 if ((90 - lat) / deg - row0) < 0.5 else row0
    r0 = row0 - (0 if ((90 - lat) / deg - row0) >= 0.5 else 1)
    c0 = col0 - (0 if ((lon + 180) / deg - col0) >= 0.5 else 1)
    if n == 3:
        r0, c0 = row0 - 1, col0 - 1
    img = Image.new("RGB", (n * 512, n * 512))
    for dr in range(n):
        for dc in range(n):
            tile = fetch(GIBS.format(z=z, row=r0 + dr, col=c0 + dc, **{k: src[k] for k in ("layer", "time", "tms")}))
            if tile is None:
                return None
            img.paste(tile, (dc * 512, dr * 512))
            time.sleep(0.15)
    std = sum(ImageStat.Stat(img).stddev) / 3
    bounds = {"west": -180 + c0 * deg, "east": -180 + (c0 + n) * deg, "north": 90 - r0 * deg, "south": 90 - (r0 + n) * deg,
              "source": f"GIBS EPSG:4326 WMTS tile grid, {src['tms']} set level {z}, rows {r0}-{r0+n-1}, cols {c0}-{c0+n-1}"}
    px_m = KM_PER_DEG * 1000 * deg / 512
    return img, {"bounds": bounds, "zoom": z, "tiles": n, "px_m_ns": round(px_m, 2), "px_m_ew": round(px_m * math.cos(math.radians(lat)), 2),
                 "width_km_ns": round(n * deg * KM_PER_DEG, 1), "std": round(std, 2), "layer": src["layer"], "time": src["time"],
                 "credit": src["credit"], "acquisition_note": src["acquisition_note"], "layer_title": src["title"]}


def build_texture() -> None:
    z, cols, rows = 3, 10, 5
    img = Image.new("RGB", (cols * 512, rows * 512))
    for r in range(rows):
        for c in range(cols):
            tile = fetch(GIBS.format(layer="BlueMarble_NextGeneration", time="default", tms="500m", z=z, row=r, col=c).replace("/default/default/", "/default/"))
            if tile is None:
                raise SystemExit(f"Blue Marble tile {r}/{c} failed")
            img.paste(tile, (c * 512, r * 512))
    TEXTURES.mkdir(parents=True, exist_ok=True)
    out = TEXTURES / "earth_bluemarble_4k.jpg"
    img.resize((4096, 2048), Image.LANCZOS).save(out, quality=88)
    (TEXTURES / "earth_bluemarble_4k.ATTRIBUTION.txt").write_text(
        "NASA Earth Observatory Blue Marble Next Generation (Reto Stöckli, NASA GSFC), via NASA GIBS layer BlueMarble_NextGeneration, 500 m set level 3, "
        "resized to 4096x2048. Public domain (NASA). Equirectangular, column 0 = 180W, row 0 = 90N, same convention as the Mars texture.\n")
    print("texture", out, out.stat().st_size, "bytes")


def main() -> int:
    ASSETS.mkdir(parents=True, exist_ok=True)
    if not (TEXTURES / "earth_bluemarble_4k.jpg").exists():
        build_texture()
    cands = json.loads((BACKEND / "data" / "earth" / "candidates.json").read_text())["candidates"]
    out = {}
    for c in cands:
        for name, z in (("regional", 10), ("local", 11)):
            res = stitch(c["lat"], c["lon_east"], z, 2, WELD)
            src_used = "weld"
            if res is None or res[1]["std"] < 4.0:   # blank (no WELD coverage) -> MODIS daily true colour
                z2 = 8 if name == "regional" else 9
                res = stitch(c["lat"], c["lon_east"], z2, 2, MODIS)
                src_used = "modis"
                if res is None:
                    print(f"{c['id']} {name}: no imagery available", flush=True)
                    continue
            img, meta = res
            fn = f"{c['id']}_gibs_{name}.jpg"
            img.save(ASSETS / fn, quality=86)
            meta.update({"file": fn, "width_px": img.width, "height_px": img.height, "bytes": (ASSETS / fn).stat().st_size, "verified_on": date.today().isoformat(), "source_used": src_used})
            out[f"{c['id']}_gibs_{name}"] = meta
            print(f"{fn:<40} {src_used:<6} {meta['width_km_ns']:>6} km {meta['px_m_ns']:>6} m/px std {meta['std']:>5} {meta['bytes']:>8} B", flush=True)
    (IMG / "earth_context.json").write_text(json.dumps(out, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
