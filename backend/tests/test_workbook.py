"""The Lesser-Known Mars Sites workbook: roles, pairing, null handling, source
rule and owner restrictions, and that the condition texts never reach scoring."""
import json
import re
from pathlib import Path
from urllib.parse import urlparse

from app.services.data_loader import get_store

DATA = Path(__file__).resolve().parents[1] / "data"
WB = json.loads((DATA / "workbook" / "lesser_known_sites.v1.json").read_text(encoding="utf-8"))
CORPUS = DATA / "documents" / "corpus"
ROLES = {"Base candidate", "Resource site", "To evaluate", "Instrument testing", "Context only"}
AGENCY = re.compile(r"(^|\.)(nasa\.gov|esa\.int)$")


def test_seventeen_pairs_each_mars_site_paired_with_one_earth_location():
    store = get_store()
    mars, earth = store.sites(), store.earth_candidates()
    assert len(mars) == len(earth) == len(WB["mars_sites"]) == 17
    for s in mars:
        assert s.role in ROLES
        e = store.earth_candidate(s.paired_earth_site_id)
        assert e is not None and e.paired_mars_site_id == s.id and e.role == s.role
    removed = {"gale_crater", "gusev_crater", "atacama_yungay", "death_valley", "mdrs_utah", "mauna_kea_summit"}
    assert not removed & ({s.id for s in mars} | {e.id for e in earth})


def test_moved_sites_use_the_workbook_points_and_approximate_coordinates_are_flagged():
    store = get_store()
    assert (store.site("utopia_planitia").lat, store.site("utopia_planitia").lon_east) == (25.07, 109.93)
    assert (store.site("meridiani_planum").lat, store.site("meridiani_planum").lon_east) == (-3.17, -4.52)
    assert store.site("planum_boreum").coordinates_approximate and store.site("amazonis_arcadia_ap8").coordinates_approximate
    assert not store.site("jezero_crater").coordinates_approximate   # the published Perseverance point is kept
    for eid in ("jaroso_ravine", "liwa_desert", "sudbury_impact_structure", "yilgarn_salt_lakes", "galena_creek_rock_glacier", "dalangtan_playa"):
        assert store.earth_candidate(eid).coordinates_approximate, eid


def test_dash_cells_are_null_never_blank_or_zero_and_excluded_sources_are_withheld():
    for m in WB["mars_sites"]:
        for c in m["conditions"] + m["pair"]["mars"] + m["pair"]["earth"]:
            if c["text"] is None:
                assert c["status"] in ("not_found_in_sources", "excluded_source") and c["source_ids"] == []
            else:
                assert c["text"].strip() and not c["text"].startswith("—") and c["source_ids"], (m["id"], c)
                assert c["status"] in ("verified", "cited_not_verified", "citation_only")
            if c["status"] == "verified":
                assert c["evidence_quote"] and c["evidence_source_id"] in c["source_ids"]
    huygens = {c["feature"]: c for c in next(m for m in WB["mars_sites"] if m["id"] == "huygens_crater")["conditions"]}
    assert huygens["mineralogy"]["text"] is None and huygens["mineralogy"]["status"] == "excluded_source"
    summit = {c["feature"]: c for c in next(m for m in WB["mars_sites"] if m["id"] == "planum_boreum")["pair"]["earth"]}
    assert summit["thermal"]["text"] is None   # its only sources (Wikipedia, NOAA) are not approved


def test_every_source_meets_the_owner_rule_and_rejected_ones_are_absent():
    for sid, s in WB["sources"].items():
        host = urlparse(s["url"]).hostname
        if s["kind"] == "doi":
            assert host == "doi.org" and s["doi"] in s["url"], sid
        elif s["kind"] == "agency":
            assert AGENCY.search(host), sid
        else:   # named owner exceptions only
            assert sid in {"hirise_esp_048036_2025_hebrus", "hirise_esp_094549_1655_huygens"}, sid
    urls = {s["url"] for s in WB["sources"].values()}
    assert "https://doi.org/10.3390/app11062648" not in urls                                  # Alharbi & Csala: rejected
    assert not any("natures-drilling-exposes-deeply-buried-minerals" in u for u in urls)     # PIA13801: rejected
    assert "Alharbi & Csala 2021" in WB["excluded_citations"]


def test_owner_restrictions_hold_in_the_corpus():
    def text(doc_id):
        return json.loads((CORPUS / f"{doc_id}.json").read_text(encoding="utf-8"))["text"]
    for doc_id in ("wb_aguilar2024_drone_gpr", "crossref_aguilar2026_rock_glacier_continuum"):
        assert "Sourdough" not in text(doc_id), doc_id
    granby = text("wb_bultel2025_granby_alteration")
    assert "Granby" in granby and not re.search(r"ExoMars|rover|launch|mission", granby, re.I)
    for doc_id in ("wb_yoldi2020_greenland_old_ice", "wb_bultel2022_granby_vermiculite"):
        assert "@" not in text(doc_id), "author e-mail addresses are dropped with the page chrome"


def test_condition_texts_never_enter_scoring_or_profiles():
    store = get_store()
    for s in store.sites():
        prof = store.profile(s.id)
        texts = {c.text for c in s.reported_conditions if c.text}
        assert not any(m.value in texts for m in prof.measurements if isinstance(m.value, str)), s.id


def test_api_serves_roles_pairs_and_conditions(client):
    sites = client.get("/api/v1/sites?planet=mars").json()["sites"]
    hebrus = next(s for s in sites if s["id"] == "hebrus_valles")
    assert hebrus["role"] == "Base candidate" and hebrus["paired_earth_site_id"] == "liwa_desert"
    assert {c["feature"] for c in hebrus["reported_conditions"]} == {"terrain", "mineralogy", "elevation", "thermal", "solar", "wind", "water_ice"}
    assert set(hebrus["condition_sources"]) >= {s for c in hebrus["reported_conditions"] for s in c["source_ids"]}
    cat = client.get("/api/v1/comparison/catalog").json()["locations"]
    liwa = next(l for l in cat if l["id"] == "liwa_desert")
    assert liwa["paired_location_id"] == "hebrus_valles" and liwa["why_they_match"] and liwa["role"] == "Base candidate"
