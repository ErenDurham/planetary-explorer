"""Quality check for the committed environmental profiles (the Store step).

Loads data/mars/site_profiles.<v>.json and data/earth/candidate_profiles.<v>.json,
validates every profile against the EnvironmentalProfile model, and checks the
physical and provenance invariants every downstream engine relies on:

  * every numeric, non-missing measurement carries a unit
  * elevations in metres lie inside the MOLA MEGDR label range [-8177, 21171]
  * slopes in [0, 90] deg, roughness >= 0, TOA insolation in (0, 600) W/m2
  * latitude in [-90, 90], longitude in [-180, 180], footprint centres match
  * every source_id resolves in the profile's own `sources` map
  * every missing measurement has value null and quality_flag "missing"
  * completeness arithmetic matches the measurement list
  * every site in sites.json / candidates.json has a profile and vice versa
  * if the raw MOLA grid is present: Olympus Mons > 15000 m, Hellas < -5000 m

Prints one table row per profile and exits non-zero on any failure, so it can
run in CI or after re-running the pipeline.

Run from backend/:  python scripts/validate_profiles.py [--version v1] [--no-mola]
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "scripts"))

from pydantic import ValidationError  # noqa: E402

from app.models import EnvironmentalProfile  # noqa: E402

DATA = BACKEND / "data"

# MOLA MEGDR label extremes (metres relative to the areoid). Earth elevations
# (EGM2008 geoid) also fall inside this range, so one bound serves both planets.
ELEVATION_RANGE_M = (-8177.0, 21171.0)
INSOLATION_RANGE_WM2 = (0.0, 600.0)  # exclusive; Earth equator ~417, Mars equator ~179
LANDMARKS = {"olympus_mons": (18.65, 226.2, ">", 15000), "hellas_basin": (-42.4, 70.5, "<", -5000)}


@dataclass
class Report:
    site_id: str
    planet: str
    measurements: int = 0
    available: int = 0
    missing: int = 0
    failures: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.failures


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def check_profile(raw: dict) -> Report:
    """All checks for one profile dict. Never raises; failures are collected."""
    rep = Report(site_id=str(raw.get("site_id", "?")), planet=str(raw.get("planet", "?")))
    try:
        prof = EnvironmentalProfile.model_validate(raw)
    except ValidationError as e:
        rep.failures.append(f"schema: {e.errors()[0]['loc']} {e.errors()[0]['msg']}" if e.errors() else f"schema: {e}")
        return rep

    rep.measurements = len(prof.measurements)
    seen: set[str] = set()
    for m in prof.measurements:
        tag = m.feature_id
        if tag in seen:
            rep.failures.append(f"{tag}: duplicated feature_id")
        seen.add(tag)

        if m.is_missing:
            rep.missing += 1
            if m.value is not None:
                rep.failures.append(f"{tag}: is_missing but value is {m.value!r} (must be null)")
            if m.quality_flag != "missing":
                rep.failures.append(f"{tag}: is_missing but quality_flag is {m.quality_flag!r}")
            continue
        rep.available += 1
        if m.value is None:
            rep.failures.append(f"{tag}: value null but is_missing is false (never a silent zero either)")
            continue
        if m.quality_flag == "missing":
            rep.failures.append(f"{tag}: quality_flag 'missing' on a present value")

        if _is_number(m.value):
            v = float(m.value)
            if not math.isfinite(v):
                rep.failures.append(f"{tag}: non-finite value {v}")
                continue
            if not m.unit:
                rep.failures.append(f"{tag}: numeric value {v} carries no unit")
            if tag.startswith("elevation_") and tag.endswith("_m"):
                if tag == "elevation_std_m":
                    if v < 0:
                        rep.failures.append(f"{tag}: negative std {v}")
                elif not (ELEVATION_RANGE_M[0] <= v <= ELEVATION_RANGE_M[1]):
                    rep.failures.append(f"{tag}: {v} m outside MOLA label range {ELEVATION_RANGE_M}")
                if m.unit != "m":
                    rep.failures.append(f"{tag}: unit {m.unit!r} is not 'm'")
            if "slope" in tag:
                if not (0.0 <= v <= 90.0):
                    rep.failures.append(f"{tag}: slope {v} outside [0, 90] deg")
                if m.unit != "deg":
                    rep.failures.append(f"{tag}: unit {m.unit!r} is not 'deg'")
            if tag.startswith("roughness_") and v < 0:
                rep.failures.append(f"{tag}: negative roughness {v}")
            if tag.startswith("insolation_"):
                if not (INSOLATION_RANGE_WM2[0] < v < INSOLATION_RANGE_WM2[1]):
                    rep.failures.append(f"{tag}: insolation {v} outside {INSOLATION_RANGE_WM2} W/m2")
                if m.unit != "W/m2":
                    rep.failures.append(f"{tag}: unit {m.unit!r} is not 'W/m2'")
            if tag == "latitude_abs_deg" and not (0.0 <= v <= 90.0):
                rep.failures.append(f"{tag}: {v} outside [0, 90]")
            if tag == "precipitation_mm_day" and v < 0:
                rep.failures.append(f"{tag}: negative precipitation {v}")
        elif isinstance(m.value, list):
            if not all(isinstance(t, str) and t for t in m.value):
                rep.failures.append(f"{tag}: tag list must hold non-empty strings")
            if m.quality_flag != "qualitative":
                rep.failures.append(f"{tag}: tag list should be flagged 'qualitative', got {m.quality_flag!r}")

        if m.source_id is None:
            rep.failures.append(f"{tag}: present value with no source_id")
        elif m.source_id not in prof.sources:
            rep.failures.append(f"{tag}: source_id {m.source_id!r} does not resolve in profile.sources {sorted(prof.sources)}")

        fp = m.geographic_footprint
        if fp is not None:
            if not (-90 <= fp.center_lat <= 90) or not (-180 <= fp.center_lon_east <= 180):
                rep.failures.append(f"{tag}: footprint centre out of range ({fp.center_lat}, {fp.center_lon_east})")
            if fp.approx_width_km is not None and fp.approx_width_km <= 0:
                rep.failures.append(f"{tag}: footprint width {fp.approx_width_km} km not positive")

    for sid, src in prof.sources.items():
        if src.source_id != sid:
            rep.failures.append(f"sources[{sid!r}].source_id is {src.source_id!r}")

    c = prof.completeness
    if c.features_requested != rep.measurements:
        rep.failures.append(f"completeness.features_requested {c.features_requested} != {rep.measurements} measurements")
    if c.features_available != rep.available:
        rep.failures.append(f"completeness.features_available {c.features_available} != {rep.available} present")
    expected_fraction = (rep.available / rep.measurements) if rep.measurements else 0.0
    if abs(c.fraction - expected_fraction) > 0.0015:
        rep.failures.append(f"completeness.fraction {c.fraction} != {expected_fraction:.3f}")
    listed_missing = sorted(c.missing_feature_ids)
    actual_missing = sorted(m.feature_id for m in prof.measurements if m.is_missing)
    if listed_missing != actual_missing:
        rep.failures.append(f"completeness.missing_feature_ids {listed_missing} != {actual_missing}")
    return rep


def check_membership(profiles: list[dict], entities: list[dict], label: str) -> list[str]:
    have, want = {p["site_id"] for p in profiles}, {e["id"] for e in entities}
    out = []
    for sid in sorted(want - have):
        out.append(f"{label} '{sid}' is defined but has no profile")
    for sid in sorted(have - want):
        out.append(f"{label} profile '{sid}' has no definition")
    by_id = {e["id"]: e for e in entities}
    for p in profiles:
        e = by_id.get(p["site_id"])
        if e is None:
            continue
        for m in p["measurements"]:
            fp = m.get("geographic_footprint")
            if fp and (abs(fp["center_lat"] - e["lat"]) > 1e-6 or abs(fp["center_lon_east"] - e["lon_east"]) > 1e-6):
                out.append(f"{label} '{p['site_id']}': footprint centre ({fp['center_lat']}, {fp['center_lon_east']}) != site coordinates ({e['lat']}, {e['lon_east']})")
                break
    return out


def check_mola_landmarks() -> tuple[list[str], list[str]]:
    """(failures, info). Skipped with an info line when the raw grid is absent."""
    import build_mars_profiles as b

    if not b.RAW.exists():
        return [], [f"MOLA landmark check skipped: {b.RAW.relative_to(BACKEND)} not present (run scripts/fetch_mola.py)"]
    try:
        grid = b.load_grid()
    except SystemExit as e:  # load_grid raises SystemExit on a bad grid
        return [f"MOLA grid failed validation: {e}"], []
    fails, info = [], []
    for name, (lat, lon, op, bound) in LANDMARKS.items():
        v = int(grid[int((90 - lat) * b.MOLA_PPD), int((lon % 360) * b.MOLA_PPD)])
        ok = v > bound if op == ">" else v < bound
        line = f"{name} ({lat}, {lon}E) = {v} m, expected {op} {bound} m"
        (info if ok else fails).append(("ok   " if ok else "FAIL ") + line)
    info.append(f"grid extremes {grid.min()} .. {grid.max()} m match the MEGDR label")
    return fails, info


def run(version: str = "v1", mola: bool = True) -> tuple[list[Report], list[str], list[str]]:
    """Returns (per-profile reports, cross-file failures, info lines)."""
    mars = json.loads((DATA / "mars" / f"site_profiles.{version}.json").read_text())
    earth = json.loads((DATA / "earth" / f"candidate_profiles.{version}.json").read_text())
    sites = json.loads((DATA / "mars" / "sites.json").read_text())["sites"]
    cands = json.loads((DATA / "earth" / "candidates.json").read_text())["candidates"]
    reports = [check_profile(p) for p in mars["profiles"]] + [check_profile(p) for p in earth["profiles"]]
    cross = check_membership(mars["profiles"], sites, "mars site") + check_membership(earth["profiles"], cands, "earth candidate")
    for name, blob in (("mars", mars), ("earth", earth)):
        if blob.get("profile_version") != version:
            cross.append(f"{name} file profile_version {blob.get('profile_version')!r} != {version!r}")
        for p in blob["profiles"]:
            if p.get("profile_version") != version:
                cross.append(f"{name} profile {p.get('site_id')} profile_version {p.get('profile_version')!r} != {version!r}")
    info: list[str] = []
    if mola:
        f, i = check_mola_landmarks()
        cross += f
        info += i
    return reports, cross, info


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--version", default="v1")
    ap.add_argument("--no-mola", action="store_true", help="skip the raw MOLA landmark check")
    args = ap.parse_args(argv)
    reports, cross, info = run(args.version, mola=not args.no_mola)

    print(f"{'profile':<22} {'planet':<6} {'meas':>4} {'avail':>5} {'miss':>4}  status")
    print("-" * 64)
    for r in reports:
        print(f"{r.site_id:<22} {r.planet:<6} {r.measurements:>4} {r.available:>5} {r.missing:>4}  {'ok' if r.ok else 'FAIL'}")
        for f in r.failures:
            print(f"    - {f}")
    print("-" * 64)
    for line in info:
        print(line)
    for f in cross:
        print("FAIL " + f)
    n_fail = sum(1 for r in reports if not r.ok) + len(cross)
    print(f"{len(reports)} profiles checked ({sum(1 for r in reports if r.planet == 'mars')} Mars, {sum(1 for r in reports if r.planet == 'earth')} Earth); "
          f"{sum(len(r.failures) for r in reports) + len(cross)} failure(s)")
    return 1 if n_fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
