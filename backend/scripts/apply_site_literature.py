"""Apply data/site_literature.v1.json to the site files and the profiles.

The literature file is the single source of truth for every literature-derived
site datum: landform and mineral labels (each backed by a verbatim quote from a
recent NASA, USGS or peer-reviewed source), site descriptions, analog uses and
the Mars water/ice notes. This script writes them into

  data/earth/candidates.json, data/mars/sites.json          (tags, text, source lists)
  data/earth/candidate_profiles.v1.json, data/mars/site_profiles.v1.json
                                                            (the terrain_morphology,
                                                             mineralogy_tags and
                                                             water_ice_evidence
                                                             measurements + sources)

Measured numbers (DEM, MOLA, NASA POWER) are never touched. A site with no
recent source for a feature gets that measurement marked missing, never an
old or generic label. Both build_*_profiles.py scripts call apply() after they
write, so a rebuild keeps the literature labels.

Run from backend/:  python scripts/apply_site_literature.py
"""
from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
LIT = DATA / "site_literature.v1.json"
FEATURES = ("terrain_morphology", "mineralogy_tags")


def _write(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n")


def provenance(source_id: str, s: dict) -> dict:
    """A literature source in the Provenance shape the profiles use (plus cite/year/kind)."""
    return {"source_id": source_id, "title": s["title"], "institution": s["venue"], "url": s["url"],
            "access_method": "web page" if s.get("year") is None else "publication",
            "cite": s["cite"], "year": s.get("year"), "kind": s["kind"],
            **({"retrieved_at": s["retrieved_at"]} if s.get("retrieved_at") else {})}


def tags(site: dict, feature: str) -> list[str]:
    out: list[str] = []
    for e in site["evidence"]:
        if e["feature"] == feature:
            out += [t for t in e["tags"] if t not in out]
    return out


def primary_source(site: dict, feature: str) -> str | None:
    """The source backing the most labels of a feature (first listed on a tie)."""
    counts: dict[str, int] = {}
    for e in site["evidence"]:
        if e["feature"] == feature:
            counts[e["source_id"]] = counts.get(e["source_id"], 0) + len(e["tags"])
    return max(counts, key=lambda k: counts[k]) if counts else None


def citation_note(site: dict, feature: str, sources: dict) -> str:
    by: dict[str, list[str]] = {}
    for e in site["evidence"]:
        if e["feature"] == feature:
            by.setdefault(sources[e["source_id"]]["cite"], [])
            by[sources[e["source_id"]]["cite"]] += [t for t in e["tags"] if t not in by[sources[e["source_id"]]["cite"]]]
    return "Literature labels: " + "; ".join(f"{', '.join(t)} ({c})" for c, t in by.items()) + "."


def site_sources(site: dict) -> list[str]:
    return list(dict.fromkeys(e["source_id"] for e in site["evidence"]))


def _patch_profile(profile: dict, site: dict, lit: dict) -> None:
    sources = lit["sources"]
    for m in profile["measurements"]:
        fid = m["feature_id"]
        if fid in FEATURES:
            values, src = tags(site, fid), primary_source(site, fid)
            if values:
                m.update(value=values, source_id=src, measurement_type="literature", quality_flag="qualitative", is_missing=False,
                         notes=citation_note(site, fid, sources))
            else:
                m.update(value=None, source_id=None, measurement_type="literature", quality_flag="missing", is_missing=True,
                         notes="No NASA, USGS or peer-reviewed source from the last 15 years was found for this site, so no labels are given.")
        elif fid == "latitude_abs_deg" and site["planet"] == "earth":
            # the build cites the site's first source here (candidates.json "sources"[0])
            m["source_id"] = site_sources(site)[0]
        elif fid == "water_ice_evidence" and site.get("water_ice_evidence"):
            m.update(value=site["water_ice_evidence"], source_id=primary_source(site, "mineralogy_tags") or primary_source(site, "terrain_morphology"))
    # every source behind a label is listed, not only each measurement's primary one
    used = {m["source_id"] for m in profile["measurements"] if m.get("source_id")} | set(site_sources(site))
    srcs = {k: v for k, v in profile.get("sources", {}).items() if k in used and k not in sources}
    for sid in sorted(used & set(sources)):
        srcs[sid] = provenance(sid, sources[sid])
    profile["sources"] = srcs
    c = profile.get("completeness")
    if isinstance(c, dict):
        missing = [m["feature_id"] for m in profile["measurements"] if m["is_missing"]]
        c["features_requested"] = len(profile["measurements"])
        c["features_available"] = c["features_requested"] - len(missing)
        c["fraction"] = round(c["features_available"] / c["features_requested"], 4) if c["features_requested"] else 0.0
        c["missing_feature_ids"] = missing


def apply() -> None:
    lit = json.loads(LIT.read_text())
    sources = lit["sources"]
    all_lit = set(sources)

    # Site files: labels, text and source lists; drop literature sources no site uses any more.
    for path, key, planet in ((DATA / "earth" / "candidates.json", "candidates", "earth"), (DATA / "mars" / "sites.json", "sites", "mars")):
        cfg = json.loads(path.read_text())
        used: set[str] = set()
        for s in cfg[key]:
            site = lit["sites"][s["id"]]
            assert site["planet"] == planet, s["id"]
            s["tags_terrain"], s["tags_mineralogy"] = tags(site, "terrain_morphology"), tags(site, "mineralogy_tags")
            s["description"] = site["description"]
            if planet == "earth":
                s["known_analog_use"] = site["known_analog_use"]
                s["sources"] = site_sources(site)
                used |= set(s["sources"])
            else:
                s["water_ice_evidence"] = site["water_ice_evidence"]
                s["composition_sources"] = [primary_source(site, "mineralogy_tags") or primary_source(site, "terrain_morphology")]
                s["literature_sources"] = site_sources(site)
                used |= set(s["literature_sources"]) | set(s.get("coordinate_sources", []))
        # keep the data sources (DEM, climate) and every source a site still cites; literature
        # sources come from the literature file, so an old or generic one no site uses is dropped
        keep = {k: v for k, v in cfg["sources"].items() if (k in used or k in ("copernicus_glo90", "nasa_power")) and k not in all_lit}
        for sid in sorted(used & all_lit):
            keep[sid] = provenance(sid, sources[sid])
        cfg["sources"] = keep
        _write(path, cfg)

    for path in (DATA / "earth" / "candidate_profiles.v1.json", DATA / "mars" / "site_profiles.v1.json"):
        doc = json.loads(path.read_text())
        for p in doc["profiles"]:
            _patch_profile(p, lit["sites"][p["site_id"]], lit)
        _write(path, doc)


if __name__ == "__main__":
    apply()
    print("applied", LIT.name)
