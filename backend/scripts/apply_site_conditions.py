"""Apply data/sites/site_conditions.v1.json to the site files.

Sets which sites exist (17 Mars sites and their 17 paired Earth locations),
their coordinates, names, roles, approximate-coordinate flags and the
Mars <-> Earth pairing in data/mars/sites.json and data/earth/candidates.json.

Literature-derived text and labels (description, tags, water/ice note, analog
uses, literature source lists) still come from data/site_literature.v1.json via
scripts/apply_site_literature.py, and measured profiles from the
build_*_profiles.py scripts. Run order after a change to the site list:

    python scripts/build_site_conditions.py "<site compilation .xlsx>"
    python scripts/apply_site_conditions.py
    python scripts/build_mars_profiles.py      # also applies site_literature
    python scripts/build_earth_profiles.py     # also applies site_literature
"""
from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
WB = DATA / "sites" / "site_conditions.v1.json"
COORDINATE_SOURCE = {
    "source_id": "project_site_coordinates",
    "title": "Site coordinates selected by the project team (no approved source states these coordinates)",
    "institution": "Planetary Explorer project team",
    "url": "data/sites/site_conditions.v1.json",
    "access_method": "project selection",
}
# Mission heritage for sites whose position changed.
HERITAGE = {
    "utopia_planitia": "Near the CNSA Tianwen-1 Zhurong rover landing region (2021)",
    "meridiani_planum": None,   # moved from the Opportunity landing site
}


def _read(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def _write(p: Path, d: dict) -> None:
    p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def apply() -> None:
    wb = _read(WB)
    mars_p, earth_p = DATA / "mars" / "sites.json", DATA / "earth" / "candidates.json"
    mars, earth = _read(mars_p), _read(earth_p)

    old = {s["id"]: s for s in mars["sites"]}
    sites = []
    for w in wb["mars_sites"]:
        s = dict(old.get(w["id"], {}))
        keep = w["keep_app_coordinates"] and w["id"] in old
        s.update({
            "id": w["id"], "planet": "mars",
            "name": w["name"],
            "region": s.get("region") if w["id"] in old and not w["region"] else w["region"],
            "lat": s["lat"] if keep else w["lat"], "lon_east": s["lon_east"] if keep else w["lon_east"],
            "role": w["role"], "notes": w["notes"], "coordinates_approximate": w["coordinates_approximate"] and not keep,
            "paired_earth_site_id": w["paired_earth_site_id"],
        })
        if w["id"] in HERITAGE:
            s["heritage"] = HERITAGE[w["id"]]
        else:
            s.setdefault("heritage", None)
        if not keep:
            s["coordinate_sources"] = [COORDINATE_SOURCE["source_id"]]
        s.setdefault("description", "")
        s.setdefault("tags_terrain", []); s.setdefault("tags_mineralogy", [])
        s.setdefault("water_ice_evidence", None)
        s.setdefault("composition_sources", s["coordinate_sources"]); s.setdefault("literature_sources", [])
        sites.append(s)
    mars["sites"] = sites
    mars["sources"][COORDINATE_SOURCE["source_id"]] = COORDINATE_SOURCE
    used = {sid for s in sites for sid in s["coordinate_sources"] + s.get("literature_sources", []) + s.get("composition_sources", [])}
    mars["sources"] = {k: v for k, v in mars["sources"].items() if k in used}
    mars["footprint_definition"] = mars["footprint_definition"].split(" Positions are")[0] + (
        " Positions are rover/lander touchdown points or the published centre of a selected landing ellipse where the app"
        " already held one; otherwise coordinates selected by the project team (source_id project_site_coordinates;"
        " some flagged approximate).")
    _write(mars_p, mars)

    oldc = {c["id"]: c for c in earth["candidates"]}
    cands = []
    for w in wb["earth_sites"]:
        c = dict(oldc.get(w["id"], {}))
        keep = w["keep_app_coordinates"] and w["id"] in oldc
        c.update({
            "id": w["id"],
            "name": w["name"] or c.get("name"),
            "region": w["region"] or c.get("region"),
            "country": w["country"] or c.get("country"),
            "lat": c["lat"] if keep else w["lat"], "lon_east": c["lon_east"] if keep else w["lon_east"],
            "coordinates_approximate": w["coordinates_approximate"] and not keep, "paired_mars_site_id": w["paired_mars_site_id"],
        })
        c.setdefault("description", ""); c.setdefault("tags_terrain", []); c.setdefault("tags_mineralogy", [])
        c.setdefault("known_analog_use", []); c.setdefault("sources", [])
        cands.append(c)
    earth["candidates"] = cands
    earth["sources"][COORDINATE_SOURCE["source_id"]] = COORDINATE_SOURCE   # coordinates of candidates without literature
    _write(earth_p, earth)
    print(f"applied {WB.name}: {len(sites)} Mars sites, {len(cands)} Earth sites")


if __name__ == "__main__":
    apply()
