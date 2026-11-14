"""Acquire: download the MOLA MEGDR 16 pixel-per-degree global topography grid.

Source: NASA PDS Geosciences Node, MGS-M-MOLA-5-MEGDR-L3-V1.0, product
MEGT90N000EB.IMG (5760 x 2880 big-endian int16, metres relative to the GMM3
areoid, IAU2000, simple cylindrical, east-positive longitude). ~33 MB.

Why 16 ppd and not 128 ppd: the 128 ppd product is ~2 GB split into tiles and
needs rasterio + hours of download; 16 ppd (3.7 km/px) is enough for the
REGIONAL footprint statistics this project claims and nothing more. The
resolution limitation is recorded on every derived measurement.
"""
from __future__ import annotations

import hashlib
import sys
import urllib.request
from pathlib import Path

BASE = "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/"
FILES = ["megt90n000eb.img", "megt90n000eb.lbl"]
RAW = Path(__file__).resolve().parents[1] / "data" / "raw"
EXPECTED_BYTES = 2880 * 5760 * 2  # 33,177,600


def fetch(name: str) -> Path:
    out = RAW / name
    if out.exists() and (not name.endswith(".img") or out.stat().st_size == EXPECTED_BYTES):
        print(f"present  {out} ({out.stat().st_size:,} bytes)")
        return out
    RAW.mkdir(parents=True, exist_ok=True)
    print(f"download {BASE}{name}")
    urllib.request.urlretrieve(BASE + name, out)
    print(f"saved    {out} ({out.stat().st_size:,} bytes)")
    return out


def main() -> int:
    for f in FILES:
        p = fetch(f)
        if f.endswith(".img") and p.stat().st_size != EXPECTED_BYTES:
            print(f"ERROR: expected {EXPECTED_BYTES:,} bytes, got {p.stat().st_size:,}", file=sys.stderr)
            return 1
    digest = hashlib.sha256((RAW / FILES[0]).read_bytes()).hexdigest()
    (RAW / "megt90n000eb.sha256").write_text(digest + "\n")
    print("sha256  ", digest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
