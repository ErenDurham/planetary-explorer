"""The literature-derived site data: every landform / mineral label rests on a
quote from a recent, trusted source, and every file that shows site data says
the same thing (site files, profiles, evidence registry)."""
import json
import re
from pathlib import Path
from urllib.parse import urlparse

from app.services import evidence

DATA = Path(__file__).resolve().parents[1] / "data"
LIT = json.loads((DATA / "site_literature.v1.json").read_text())
# NASA and ESA pages and DOI records (owner source rule, 2026-11-15)
TRUSTED_HOSTS = {"doi.org", "ntrs.nasa.gov", "www.nasa.gov", "science.nasa.gov", "earthobservatory.nasa.gov", "www.esa.int"}

# A label's quote must say it in some form (the quote itself was checked
# verbatim against the source when the file was written).
KEYWORDS = {
    "alluvial_fan": r"alluvial fan", "playa": r"playa|dried lake|dry.lake", "polygonal_terrain": r"polygon",
    "polar_desert": r"polar desert", "periglacial": r"periglacial", "impact_crater": r"crater",
    "crater_floor": r"crater floor", "delta": r"delta", "paleolake_basin": r"lake", "lava_plain": r"lava",
    "fissure_vent": r"fissure", "outwash_plain": r"floodplain|outwash", "inverted_channels": r"inverted",
    "cinder_cone": r"cinder cone", "volcanic_slope": r"flank|slope", "smooth_plains": r"smooth|low-relief|plains",
    "layered_deposits": r"layered deposits", "hills": r"hills", "outflow_channel_deposits": r"flood channel|outflow",
    "northern_lowlands": r"northern plains|northern lowlands", "rocky_surface": r"rock|boulder",
    "sulfates": r"sulfate|sulphate|gypsum|jarosite", "nitrates": r"nitrate", "chlorides": r"chloride|halite",
    "perchlorates": r"perchlorate", "borates": r"borate", "carbonates": r"carbonate|calcite", "clays": r"clay|smectite|nontronite",
    "iron_oxides": r"hematite|iron oxide", "silica": r"silica", "olivine": r"olivine", "basalt": r"basalt",
    "volcanic_glass": r"glass", "tephra": r"tephra", "sandstone": r"sandstone", "impact_breccia": r"breccia",
    "water_ice": r"ice", "regolith": r"regolith|soil",
}


def _site_files():
    earth = json.loads((DATA / "earth" / "candidates.json").read_text())
    mars = json.loads((DATA / "mars" / "sites.json").read_text())
    return earth, mars


def test_sources_are_trusted_and_recent():
    for sid, s in LIT["sources"].items():
        assert s["kind"] in ("nasa", "esa", "peer_reviewed", "conference_abstract", "usgs"), sid
        u = urlparse(s["url"])
        assert u.scheme == "https" and u.hostname in TRUSTED_HOSTS, s["url"]
        if s["year"] is None:   # a live NASA / ESA page: dated by retrieval
            assert (u.hostname.endswith("nasa.gov") or u.hostname == "www.esa.int") and s.get("retrieved_at"), sid
        else:
            assert s["year"] >= evidence.cutoff_year(), f"{sid} ({s['year']}) is older than {evidence.MAX_SOURCE_AGE_YEARS} years"


def test_every_label_is_in_the_vocabulary_and_said_by_its_quote():
    for site_id, site in LIT["sites"].items():
        # a site with no usable source says why instead of carrying a label
        assert site["evidence"] or site.get("evidence_gap"), site_id
        for e in site["evidence"]:
            assert e["source_id"] in LIT["sources"], (site_id, e["source_id"])
            assert e["feature"] in LIT["vocabulary"], (site_id, e["feature"])
            assert e["quote"].strip(), site_id
            assert e["tags"] or e.get("role") == "location", f"{site_id}: a row without labels must be a location row"
            for t in e["tags"]:
                assert t in LIT["vocabulary"][e["feature"]], (site_id, t)
                assert re.search(KEYWORDS[t], e["quote"], re.I), f"{site_id}: quote does not mention {t}: {e['quote']}"


def test_every_site_has_literature_and_the_site_files_match_it():
    earth, mars = _site_files()
    ids = [c["id"] for c in earth["candidates"]] + [s["id"] for s in mars["sites"]]
    assert sorted(ids) == sorted(LIT["sites"])
    for s in earth["candidates"] + mars["sites"]:
        lit = LIT["sites"][s["id"]]
        for key, feature in (("tags_terrain", "terrain_morphology"), ("tags_mineralogy", "mineralogy_tags")):
            want = list(dict.fromkeys(t for e in lit["evidence"] if e["feature"] == feature for t in e["tags"]))
            assert s[key] == want, (s["id"], key)
        assert s["description"] == lit["description"], s["id"]


def test_profiles_carry_the_same_labels_and_cite_only_listed_sources():
    for path in ("earth/candidate_profiles.v1.json", "mars/site_profiles.v1.json"):
        for p in json.loads((DATA / path).read_text())["profiles"]:
            lit = LIT["sites"][p["site_id"]]
            for m in p["measurements"]:
                if m["feature_id"] in ("terrain_morphology", "mineralogy_tags"):
                    want = list(dict.fromkeys(t for e in lit["evidence"] if e["feature"] == m["feature_id"] for t in e["tags"]))
                    if want:
                        assert m["value"] == want and m["source_id"] in LIT["sources"], (p["site_id"], m["feature_id"])
                    else:
                        assert m["is_missing"] and m["value"] is None, (p["site_id"], m["feature_id"])
                if m.get("source_id"):
                    assert m["source_id"] in p["sources"], (p["site_id"], m["source_id"])
            for sid, src in p["sources"].items():
                if sid in LIT["sources"]:
                    assert src["url"] == LIT["sources"][sid]["url"] and src.get("year") == LIT["sources"][sid]["year"], sid


def test_no_site_file_cites_an_old_or_generic_literature_source():
    earth, mars = _site_files()
    for cfg in (earth, mars):
        for sid, s in cfg["sources"].items():
            if s.get("year") is not None:
                assert s["year"] >= evidence.cutoff_year(), sid
            assert sid != "nasa_analogs_overview" and not s["url"].startswith("https://doi.org/10.1126/science.1089143"), sid


def test_registry_and_site_literature_agree_on_shared_sources():
    reg = {s["source_id"]: s for s in evidence.registry()["sources"]}
    shared = set(reg) & set(LIT["sources"])
    assert shared, "the evidence registry and the site data should cite the same NTRS records"
    for sid in shared:
        a, b = reg[sid], LIT["sources"][sid]
        assert (a["url"], a["year"], a["cite"]) == (b["url"], b["year"], b["cite"]), sid
