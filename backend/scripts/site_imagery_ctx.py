"""Build CTX orbital context mosaics for every candidate site.

Source: the NASA/JPL/MSSS/Murray Lab "CTX beta01 uncontrolled 5 m" global
mosaic, served as a tile cache by Esri for NASA Solar System Treks
(https://trek.nasa.gov, layer CTX_beta01_uncontrolled_5m_Caltech; tile
template https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/{z}/{row}/{col}).
The Murray Lab grants free use of beta01 for all purposes with credit to
NASA/JPL/MSSS/The Murray Lab.

Tiles are on a simple-cylindrical grid (Mars 2000 sphere, east-positive,
top-left -180,90): at zoom z there are 2^z rows and 2^(z+1) columns of 256 px,
each 180/2^z degrees square. That makes the bounds of a stitched block EXACT,
so a footprint outline and a scale bar drawn on it are legitimate. Pixel
ground size is 59.27 km/deg * degrees per tile / 256 (at the equator; the
E-W size shrinks with cos(lat), which the manifest states).

Run from backend/:  python scripts/site_imagery_ctx.py   (writes data/imagery/assets/*.jpg and ctx_context.json)
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

from PIL import Image

BACKEND = Path(__file__).resolve().parents[1]
ASSETS = BACKEND / "data" / "imagery" / "assets"
TEMPLATE = "https://astro.arcgis.com/arcgis/rest/services/OnMars/CTX/MapServer/tile/{z}/{row}/{col}"
MAX_ZOOM = 12   # the service answers 400 above this level
KM_PER_DEG = 2 * math.pi * 3396.19 / 360  # 59.27 km
LEVELS = {"regional": (9, 3), "local": (12, 3)}   # zoom, tiles per side


def tile_of(lat: float, lon: float, z: int) -> tuple[int, int, float]:
    deg = 180 / 2 ** z
    return int((90 - lat) // deg), int((lon + 180) // deg), deg


def _download_decoded(url: str, attempts: int = 3) -> Image.Image | None:
    """Download and FULLY decode a tile; None if the stream is truncated or
    unreachable on every attempt (a few tiles are corrupt at the source)."""
    for i in range(attempts):
        try:
            data = urllib.request.urlopen(url, timeout=60).read()
            im = Image.open(io.BytesIO(data))
            im.load()
            return im.convert("RGB")
        except Exception:  # noqa: BLE001 - network or decode; retry, then give up
            time.sleep(0.5 + i)
    return None


def fetch_tile(z: int, row: int, col: int, depth: int = 0) -> Image.Image:
    """One 256 px tile. If the server's copy is corrupt, assemble it from its
    four children at zoom z+1 (each covering a quarter), up to two levels down,
    so the mosaic stays complete and correctly georeferenced."""
    im = _download_decoded(TEMPLATE.format(z=z, row=row, col=col))
    if im is not None:
        return im
    if depth >= 2 or z >= MAX_ZOOM:
        # Last resort: decode whatever bytes the server has for this tile; the
        # missing rows render black and the mosaic says so in its caveat.
        from PIL import ImageFile
        ImageFile.LOAD_TRUNCATED_IMAGES = True
        try:
            im = Image.open(io.BytesIO(urllib.request.urlopen(TEMPLATE.format(z=z, row=row, col=col), timeout=60).read()))
            im.load()
            print(f"warning: tile {z}/{row}/{col} truncated at the source and no clean children; partial tile used", file=sys.stderr)
            return im.convert("RGB")
        except Exception as e:  # noqa: BLE001 - nothing usable at all: a grey tile, flagged
            print(f"warning: tile {z}/{row}/{col} unavailable ({type(e).__name__}); grey placeholder used", file=sys.stderr)
            return Image.new("RGB", (256, 256), (40, 40, 40))
        finally:
            ImageFile.LOAD_TRUNCATED_IMAGES = False
    print(f"warning: tile {z}/{row}/{col} is corrupt at the source; built from zoom {z+1} children", file=sys.stderr)
    out = Image.new("RGB", (256, 256))
    for dr in range(2):
        for dc in range(2):
            child = fetch_tile(z + 1, row * 2 + dr, col * 2 + dc, depth + 1).resize((128, 128), Image.LANCZOS)
            out.paste(child, (dc * 128, dr * 128))
    return out


def stitch(lat: float, lon: float, z: int, n: int) -> tuple[Image.Image, dict]:
    row0, col0, deg = tile_of(lat, lon, z)
    r0, c0 = row0 - n // 2, col0 - n // 2
    img = Image.new("RGB", (n * 256, n * 256))
    for dr in range(n):
        for dc in range(n):
            img.paste(fetch_tile(z, r0 + dr, c0 + dc), (dc * 256, dr * 256))
            time.sleep(0.2)
    bounds = {"west": -180 + c0 * deg, "east": -180 + (c0 + n) * deg, "north": 90 - r0 * deg, "south": 90 - (r0 + n) * deg,
              "source": f"WMTS/ArcGIS tile grid, zoom {z}, rows {r0}-{r0+n-1}, cols {c0}-{c0+n-1}"}
    px_m = KM_PER_DEG * 1000 * deg / 256
    return img, {"bounds": bounds, "zoom": z, "tiles": n, "px_m_ns": round(px_m, 2), "px_m_ew": round(px_m * math.cos(math.radians(lat)), 2), "width_km_ns": round(n * deg * KM_PER_DEG, 1)}


def main() -> int:
    sites = json.loads((BACKEND / "data" / "mars" / "sites.json").read_text())["sites"]
    ASSETS.mkdir(parents=True, exist_ok=True)
    out = {}
    for s in sites:
        for name, (z, n) in LEVELS.items():
            img, meta = stitch(s["lat"], s["lon_east"], z, n)
            fn = f"{s['id']}_ctx_{name}.jpg"
            img.save(ASSETS / fn, quality=86)
            meta.update({"file": fn, "width_px": img.width, "height_px": img.height, "bytes": (ASSETS / fn).stat().st_size, "verified_on": date.today().isoformat()})
            out[f"{s['id']}_ctx_{name}"] = meta
            print(f"{fn:<36} {meta['width_km_ns']:>6} km  {meta['px_m_ns']:>6} m/px  {meta['bytes']:>8} B", flush=True)
    (BACKEND / "data" / "imagery" / "ctx_context.json").write_text(json.dumps(out, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
