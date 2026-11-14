"""Stitch a global equirectangular Mars texture from NASA Solar System Treks WMTS tiles.

Layer: Mars_Viking_MDIM21_ClrMosaic_global_232m (Viking Orbiter Mars Digital
Image Model 2.1, colour, 232 m/px; NASA/JPL/USGS, served by NASA Treks with
open CORS). Zoom level 3 is a 16 x 8 grid of 256 px tiles = 4096 x 2048 px,
which is plenty for a textured sphere and ~2.3 MB as JPEG.

Coordinate convention of the output: standard equirectangular, column 0 at
180 W (= -180 E), row 0 at 90 N, so u = (lon_east + 180) / 360 and
v = (90 - lat) / 180. The frontend's `latLonToVector3` depends on this.

Run from backend/:  python scripts/fetch_mars_texture.py [--layer NAME] [--zoom 3]
"""
from __future__ import annotations

import argparse
import io
import sys
import urllib.request
from pathlib import Path

from PIL import Image

LAYERS = {
    "viking": "Mars_Viking_MDIM21_ClrMosaic_global_232m",
    "mola_shade": "Mars_MGS_MOLA_ClrShade_merge_global_463m",
}
OUT_DIR = Path(__file__).resolve().parents[2] / "frontend" / "public" / "textures"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--layer", default="viking", choices=LAYERS)
    ap.add_argument("--zoom", type=int, default=3)
    a = ap.parse_args()
    layer = LAYERS[a.layer]
    cols, rows = 2 ** (a.zoom + 1), 2 ** a.zoom
    base = f"https://trek.nasa.gov/tiles/Mars/EQ/{layer}/1.0.0/default/default028mm/{a.zoom}"
    img = Image.new("RGB", (cols * 256, rows * 256))
    bad = 0
    for r in range(rows):
        for c in range(cols):
            data = urllib.request.urlopen(f"{base}/{r}/{c}.jpg", timeout=60).read()
            if len(data) < 1000:
                bad += 1
                continue
            img.paste(Image.open(io.BytesIO(data)).convert("RGB"), (c * 256, r * 256))
        print(f"row {r+1}/{rows}", file=sys.stderr)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"mars_{a.layer}_{cols*256//1024}k.jpg"
    img.save(out, quality=88)
    (OUT_DIR / f"{out.stem}.ATTRIBUTION.txt").write_text(
        f"{layer} via NASA Solar System Treks WMTS ({base}/...). Image credit NASA/JPL/USGS. Equirectangular, column 0 = 180W, row 0 = 90N.\n")
    print(f"wrote {out} ({out.stat().st_size:,} bytes), {bad} empty tiles")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
