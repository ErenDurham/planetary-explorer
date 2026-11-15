"""Site conditions from approved sources: pairing, roles, null handling, the
source rule, owner restrictions, and that every condition text is a sentence
of an approved source (never anything else), kept out of scoring."""
import json
import re
from pathlib import Path
from urllib.parse import urlparse

from app.services.data_loader import get_store

DATA = Path(__file__).resolve().parents[1] / "data"
SC = json.loads((DATA / "sites" / "site_conditions.v1.json").read_text(encoding="utf-8"))
CORPUS = DATA / "documents" / "corpus"
ROLES = {"Base candidate", "Resource site", "To evaluate", "Instrument testing", "Context only"}
AGENCY = re.compile(r"(^|\.)(nasa\.gov|esa\.int)$")


def corpus_text(source_id):
    for prefix in ("src_", "crossref_", ""):
        p = CORPUS / f"{prefix}{source_id}.json"
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))["text"]
    return None


def norm(s):
    return re.sub(r"\s+", " ", s)


def test_seventeen_pairs_each_mars_site_paired_with_one_earth_location():
    store = get_store()
    mars, earth = store.sites(), store.earth_candidates()
    assert len(mars) == len(earth) == len(SC["mars_sites"]) == 17
    for s in mars:
        assert s.role in ROLES
        e = store.earth_candidate(s.paired_earth_site_id)
        assert e is not None and e.paired_mars_site_id == s.id and e.role == s.role
    removed = {"gale_crater", "gusev_crater", "atacama_yungay", "death_valley", "mdrs_utah", "mauna_kea_summit"}
    assert not removed & ({s.id for s in mars} | {e.id for e in earth})


def test_every_condition_text_is_a_sentence_of_its_cited_approved_source():
    for row in SC["mars_sites"] + SC["earth_sites"]:
        for c in row["conditions"]:
            if c["text"] is None:
                assert c["status"] == "not_found_in_sources" and c["source_ids"] == [], (row["id"], c["feature"])
                continue
            assert c["status"] == "quoted" and len(c["source_ids"]) == 1 and c["source_ids"][0] in SC["sources"], (row["id"], c)
            assert norm(c["text"]) in norm(corpus_text(c["source_ids"][0]) or ""), (row["id"], c["feature"])
        basis = row.get("analog_basis")
        if basis:
            assert basis["source_id"] in SC["sources"] and norm(basis["quote"]) in norm(corpus_text(basis["source_id"]) or "")


def test_no_compiled_text_and_no_mention_of_a_compilation_anywhere_in_the_data():
    blob = json.dumps(SC).lower()
    for word in ("workbook", "spreadsheet", "why_they_match", "earth_analogs", "excluded_citations"):
        assert word not in blob, word
    for path in ("mars/sites.json", "earth/candidates.json", "mars/site_profiles.v1.json", "earth/candidate_profiles.v1.json", "site_literature.v1.json"):
        assert "workbook" not in (DATA / path).read_text(encoding="utf-8").lower(), path


def test_every_source_meets_the_owner_rule_and_rejected_ones_are_absent():
    for sid, s in SC["sources"].items():
        host = urlparse(s["url"]).hostname
        if s["kind"] == "doi":
            assert host == "doi.org" and s["doi"] in s["url"], sid
        elif s["kind"] == "agency":
            assert AGENCY.search(host), sid
        else:   # named owner exceptions only
            assert sid in {"hirise_esp_048036_2025_hebrus", "hirise_esp_094549_1655_huygens"}, sid
    urls = {s["url"] for s in SC["sources"].values()}
    assert "https://doi.org/10.3390/app11062648" not in urls                                  # Alharbi & Csala: rejected
    assert not any("natures-drilling-exposes-deeply-buried-minerals" in u for u in urls)     # PIA13801: rejected


def test_site_labels_use_only_approved_sources():
    lit = json.loads((DATA / "site_literature.v1.json").read_text(encoding="utf-8"))
    assert set(lit["sources"]) <= set(SC["sources"]), set(lit["sources"]) - set(SC["sources"])


def test_owner_restrictions_hold_in_the_corpus():
    for doc_id in ("src_aguilar2024_drone_gpr", "crossref_aguilar2026_rock_glacier_continuum"):
        assert "Sourdough" not in json.loads((CORPUS / f"{doc_id}.json").read_text(encoding="utf-8"))["text"], doc_id
    granby = json.loads((CORPUS / "src_bultel2025_granby_alteration.json").read_text(encoding="utf-8"))["text"]
    assert "Granby" in granby and not re.search(r"ExoMars|rover|launch|mission", granby, re.I)
    for doc_id in ("src_yoldi2020_greenland_old_ice", "src_bultel2022_granby_vermiculite"):
        assert "@" not in json.loads((CORPUS / f"{doc_id}.json").read_text(encoding="utf-8"))["text"], "author e-mail addresses are dropped"


def test_condition_texts_never_enter_scoring_or_profiles():
    store = get_store()
    for s in store.sites():
        texts = {c.text for c in s.reported_conditions if c.text}
        assert not any(m.value in texts for m in store.profile(s.id).measurements if isinstance(m.value, str)), s.id


def test_api_serves_roles_pairs_conditions_and_source_stated_analog_links(client):
    sites = client.get("/api/v1/sites?planet=mars").json()["sites"]
    hebrus = next(s for s in sites if s["id"] == "hebrus_valles")
    assert hebrus["role"] == "Base candidate" and hebrus["paired_earth_site_id"] == "liwa_desert"
    assert {c["feature"] for c in hebrus["reported_conditions"]} == {"terrain", "mineralogy", "elevation", "thermal", "solar", "wind", "water_ice"}
    assert set(hebrus["condition_sources"]) == {s for c in hebrus["reported_conditions"] for s in c["source_ids"]}
    cat = client.get("/api/v1/comparison/catalog").json()["locations"]
    salda = next(l for l in cat if l["id"] == "lake_salda")
    assert salda["paired_location_id"] == "jezero_crater" and salda["analog_basis"]["source_id"] == "gunes2024_salda_microbialites"
    liwa = next(l for l in cat if l["id"] == "liwa_desert")
    assert liwa["analog_basis"] is None   # no approved source links Liwa to Hebrus Valles
