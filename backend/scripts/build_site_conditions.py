"""Build data/sites/site_conditions.v1.json from the approved sources.

For every site and condition (terrain, mineralogy, elevation, thermal,
solar/power, wind, water/ice) this reads the text the research corpus holds
for that site's approved sources (scripts/site_sources.py) and keeps the
source's own sentence that states the condition, with its citation. Nothing
else is stored: if no approved source states a condition, it is null
("Not found in sources"). The project's site compilation (the spreadsheet
used to plan which sources to read; path given on the command line) supplies
only the site list, roles, the owner's notes, coordinates and, for each
condition, what to look for. None of its own text is written to the output.

Matching is literal and conservative, then reviewed by hand: REJECTED lists
matches a reviewer found do not state the condition.

Run from backend/ after scripts/ingest_documents.py:
    python scripts/build_site_conditions.py "<site compilation .xlsx>"
"""
from __future__ import annotations

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from site_sources import (CONDITIONS, DARYA, EARTH_CELL_SOURCES, EARTH_PAIR_SOURCES, EARTH_SITES, KEEP_APP_COORDINATES,  # noqa: E402
                          MARS_SITES, MARS_SOURCES, ROLES, SOURCES)

BACKEND = Path(__file__).resolve().parents[1]
OUT = BACKEND / "data" / "sites" / "site_conditions.v1.json"
CORPUS = BACKEND / "data" / "documents" / "corpus"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
# Row labels in the compilation (to find each site's row).
MARS_ROW = {
    "amazonis_arcadia_ap8": "Amazonis / Arcadia Planitia (AP-8)", "planum_boreum": "North Pole (Planum Boreum)",
    "planum_australe": "South Pole (Planum Australe)", "mawrth_vallis": "Mawrth Vallis", "noctis_labyrinthus": "Noctis Labyrinthus",
    "hebrus_valles": "Hebrus Valles", "huygens_crater": "Huygens Crater", "columbus_crater": "Columbus Crater", "oxia_planum": "Oxia Planum",
    "deuteronilus_mensae": "Deuteronilus Mensae", "protonilus_mensae": "Protonilus Mensae", "chryse_planitia": "Chryse Planitia",
    "meridiani_planum": "Meridiani Planum", "jezero_crater": "Jezero Crater", "utopia_planitia": "Utopia Planitia (Zhurong area)",
    "elysium_planitia": "Elysium Planitia (InSight)", "xanthe_terra_tyras": "Xanthe Terra (Tyras Vallis delta)",
}
FEATURE_TERMS = {
    "terrain": r"crater|plain|valley|vall|channel|delta|polygon|mesa|apron|dune|lake|basin|terrain|landform|ridge|pit|fan|ice sheet|cap\b|glacier|layer|flow|trough|depression",
    "mineralogy": r"mineral|clay|sulfate|sulphate|carbonate|olivine|pyroxene|basalt|gypsum|halite|jarosite|hematite|iron|silica|smectite|vermiculite|salt|perchlorate|glass|phyllosilicate|evaporite",
    "elevation": r"elevation|altitude|above sea level|a\.s\.l|datum|\bm high|km high|lowest|lowland|highland|topograph|deep\b|thick",
    "thermal": r"temperature|°C|thermal|freez|\bK\b|cold|warm|heat",
    "solar": r"solar|sunlight|insolation|irradiance|daylight|polar night|\bsun\b|kWh",
    "wind": r"\bwind",
    "water_ice": r"\bice\b|water|hydrat|ground ice|permafrost|\blake\b|hydrogen",
}
STOP = set("""about above after again along also among and around because been before being below between both could does down each from have
here into just like many more most much near only other over same since some such than that their them then there these they this those
through under very were what when where which while with within would site sites""".split())
# Hand review (2026-11-15). REJECTED: the best literal match does not state the condition.
# CHOSEN: the reviewer picked a better sentence (or the stating part of one) from the same
# approved source; each is checked verbatim against the corpus text when the file is built.
REJECTED: set[tuple[str, str]] = {("haughton_crater", "terrain")}
CHOSEN: dict[tuple[str, str], tuple[str, str]] = {
    ("planum_boreum", "elevation"): ("nasa_pia10652_north_cap", "The ice cap is about 2 kilometers (1.2 miles) thick."),
    ("planum_boreum", "water_ice"): ("nasa_pia10652_north_cap", "The radar image reveals four never-before-seen thick layers of ice and dust separated by layers of nearly pure ice."),
    ("columbus_crater", "mineralogy"): ("nasa_columbus_sulfates_clays", "Sulfates are found overlying clay minerals in sediments within Columbus Crater, a depression that likely hosted a lake in the past."),
    ("mcmurdo_dry_valleys", "mineralogy"): ("goordial2016_university_valley", "Some of the coldest and driest permafrost soils on Earth are located in the high-elevation McMurdo Dry Valleys (MDVs) of Antarctica"),
    ("sudbury_impact_structure", "terrain"): ("lambert_reimold2023_impact_analogs", "considered the Sudbury structure one of the only three likely multi-ring basin-type impact structures in the terrestrial impact record"),
    ("galena_creek_rock_glacier", "terrain"): ("petersen2019_galena_creek", "Galena Creek Rock Glacier is located in a north-facing valley in the Absaroka Mountains of northern Wyoming"),
    ("channeled_scablands", "terrain"): ("nasa_eo_channeled_scablands", "Through the eyes of a geologist, however, the landforms of the so-called Channeled Scablands reveal a past punctuated by violent floods."),
    ("channeled_scablands", "mineralogy"): ("nasa_eo_channeled_scablands", "these channels take on a dark color because the overlying loess has been eroded, exposing underlying volcanic basalt"),
    ("holuhraun_iceland", "terrain"): ("voigt2025_holuhraun", "Of particular importance are “transitional” lavas, which, at the Holuhraun site, are associated with different effusion rates and eruption stages."),
}
# Analog links whose first match is not a statement by the source (e.g. a reference-list entry).
ANALOG_REJECTED = {"painted_desert"}


def read_sheets(path: str) -> dict[str, dict[int, dict[str, str]]]:
    z = zipfile.ZipFile(path)
    shared = ["".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])) for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS)]
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rel = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    out: dict[str, dict[int, dict[str, str]]] = {}
    for sh in wb.find("m:sheets", NS):
        rows: dict[int, dict[str, str]] = {}
        for row in ET.fromstring(z.read("xl/" + rel[sh.get("{%s}id" % NS["r"])].lstrip("/").removeprefix("xl/"))).iter("{%s}row" % NS["m"]):
            for c in row.findall("m:c", NS):
                v = c.find("m:v", NS)
                val = shared[int(v.text)] if c.get("t") == "s" and v is not None else (v.text if v is not None else None)
                if val is not None:
                    ref = c.get("r"); col = re.match(r"[A-Z]+", ref).group()
                    rows.setdefault(int(ref[len(col):]), {})[col] = val
        out[sh.get("name")] = rows
    return out


def guide(text: str | None) -> str | None:
    """What to look for in the sources; '—' means nothing to look for."""
    if not text:
        return None
    t = re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()
    return None if not t or t.startswith("—") else t


def coord(text: str) -> float:
    return float(f"{float(text):.6g}")


def corpus_text(source_id: str) -> str | None:
    for prefix in ("src_", "wb_", "crossref_", ""):
        p = CORPUS / f"{prefix}{source_id}.json"
        if p.exists():
            text = json.loads(p.read_text(encoding="utf-8"))["text"]
            if text.startswith("Bibliographic record (Crossref metadata"):
                m = re.search(r"Abstract \(from Crossref\): (.*)", text, re.S)
                return m.group(1) if m else None
            if text.startswith("NASA Technical Reports Server record"):
                m = re.search(r"Abstract \(NTRS\): (.*)", text, re.S)
                return m.group(1) if m else None
            return text
    return None


def sentences(text: str) -> list[str]:
    out = []
    for x in re.split(r"(?<=[.!?])\s+|\n+", text):
        x = x.strip()
        if 25 < len(x) < 500 and not re.search(r"\bReference\b|doi\.org|et al\.,? \(?\d{4}\)?\s*[.;]|^Figure|^Fig\.|Contributing Office|Credits:", x):
            out.append(x)
    return out


def words(s: str) -> set[str]:
    return {re.sub(r"(ies|es|s|ing|ed)$", "", w) for w in re.findall(r"[a-zà-ž]{4,}", s.lower()) if w not in STOP}


def numbers(s: str) -> set[str]:
    return {n.replace(",", "") for n in re.findall(r"\d[\d,]*(?:\.\d+)?", s) if len(n.replace(",", "")) >= 2}


def best_quote(site_names: list[str], feature: str, look_for: str, source_ids: list[str]) -> tuple[str, str] | None:
    """The approved-source sentence that best states `look_for` for this feature, or None."""
    want_w, want_n = words(look_for), numbers(look_for)
    name_re = re.compile("|".join(re.escape(n) for n in site_names if len(n) > 3), re.I)
    term_re = re.compile(FEATURE_TERMS[feature], re.I)
    best = None
    for sid in source_ids:
        text = corpus_text(sid)
        if not text:
            continue
        site_specific_doc = len(text) < 15000   # short records are about the site; long papers must name it in the sentence
        for sent in sentences(text):
            if not term_re.search(sent) or (not site_specific_doc and not name_re.search(sent)):
                continue
            flat = sent.replace(",", "").replace("−", "-")
            n_hit = sum(1 for n in want_n if re.search(r"(?<![\d.])" + re.escape(n) + r"(?![\d])", flat))
            w_hit = len(want_w & words(sent))
            score = 3 * n_hit + w_hit
            ok = (want_n and n_hit == len(want_n)) or (w_hit >= 2 and w_hit / max(1, len(want_w)) >= 0.3)
            if ok and (best is None or score > best[0]):
                best = (score, sid, sent)
    return (best[1], best[2]) if best else None


def cell(site_id: str, names: list[str], key: str, label: str, look_for: str | None, source_ids: list[str] | None) -> dict:
    base = {"feature": key, "label": label, "text": None, "source_ids": [], "status": "not_found_in_sources", "provenance": "approved source"}
    if (site_id, key) in CHOSEN:
        sid, quote = CHOSEN[(site_id, key)]
        text = corpus_text(sid) or ""
        assert re.sub(r"\s+", " ", quote) in re.sub(r"\s+", " ", text), f"not verbatim in {sid}: {quote[:60]}"
        base.update(text=quote, source_ids=[sid], status="quoted")
        return base
    if look_for and source_ids and (site_id, key) not in REJECTED:
        hit = best_quote(names, key, look_for, source_ids)
        if hit:
            base.update(text=hit[1], source_ids=[hit[0]], status="quoted")
    return base


def analog_basis(earth_names: list[str], mars_names: list[str], source_ids: list[str]) -> dict | None:
    """A source sentence that links the two sites (an analog statement), if any approved source makes one."""
    mars_re = re.compile("|".join(re.escape(n) for n in mars_names if len(n) > 3), re.I)
    earth_re = re.compile("|".join(re.escape(n) for n in earth_names if len(n) > 3), re.I)
    for sid in source_ids:
        text = corpus_text(sid) or ""
        for sent in sentences(text):
            if mars_re.search(sent) and earth_re.search(sent) and re.search(r"analog|analogue|compar|spectral analogy", sent, re.I):
                return {"quote": sent, "source_id": sid}
    return None


def aliases(body: str, site_id: str, name: str) -> list[str]:
    """The site's name and its known other names (app/services/site_aliases.py)."""
    sys.path.insert(0, str(BACKEND))
    from app.services.site_aliases import EARTH, MARS
    extra = (MARS if body == "mars" else EARTH).get(site_id, [])
    return [n for n in [name.split(" (")[0], *extra] if n]


def main(path: str) -> int:
    S = read_sheets(path)
    comp, base = S["Mars + Earth Comparison"], S["Base Sites"]

    def row(rows, prefix):
        hits = [r for n, r in rows.items() if n >= 4 and r.get("A", "").rstrip("*").strip().startswith(prefix)]
        assert len(hits) == 1, prefix
        return hits[0]

    base_cols = dict(zip(["terrain", "mineralogy", "elevation", "thermal", "solar", "water_ice"], "DEFGHI"))
    comp_earth = dict(zip(["terrain", "mineralogy", "elevation", "thermal", "solar", "wind"], "FHJLNP"))
    mars_out, earth_out = [], []
    by_mars = {v[0]: k for k, v in EARTH_SITES.items()}
    for mid, (name, region, approx) in MARS_SITES.items():
        c, b = row(comp, MARS_ROW[mid]), row(base, MARS_ROW[mid])
        role = c["C"].strip(); assert role in ROLES and b["B"].strip() == role, mid
        names = aliases("mars", mid, name)
        conds = []
        for key, label in CONDITIONS:
            look = guide(b.get(base_cols[key])) if key in base_cols else guide(c.get("O"))
            srcs = [DARYA] if key == "solar" and look and "kWh" in look else MARS_SOURCES[mid]
            conds.append(cell(mid, names, key, label, look, srcs))
        notes = guide(b.get("C"))
        mars_out.append({"id": mid, "name": name, "region": region, "role": role, "notes": notes,
                         "lat": coord(c["R"]), "lon_east": coord(c["S"]), "coordinates_approximate": approx,
                         "keep_app_coordinates": mid in KEEP_APP_COORDINATES, "paired_earth_site_id": by_mars[mid],
                         "source_ids": sorted({*MARS_SOURCES[mid], *(s for x in conds for s in x["source_ids"])}), "conditions": conds})
        eid = by_mars[mid]
        _, ename, eregion, ecountry, eapprox = EARTH_SITES[eid]
        enames = aliases("earth", eid, ename or "")
        econds = [cell(eid, enames, key, label, guide(c.get(comp_earth[key])), EARTH_CELL_SOURCES[eid][key]) for key, label in CONDITIONS if key in comp_earth]
        earth_out.append({"id": eid, "name": ename, "region": eregion, "country": ecountry, "lat": coord(c["T"]), "lon_east": coord(c["U"]),
                          "coordinates_approximate": eapprox, "keep_app_coordinates": eid in KEEP_APP_COORDINATES, "paired_mars_site_id": mid,
                          "source_ids": EARTH_PAIR_SOURCES[eid], "conditions": econds,
                          "analog_basis": None if eid in ANALOG_REJECTED else analog_basis(enames, names, EARTH_PAIR_SOURCES[eid] + MARS_SOURCES[mid])})
    doc = {
        "version": "site-conditions-v1",
        "note": "Every condition text is a sentence from an approved source (cited by source_ids); null means no approved source states it. Roles and notes are the project's own classification, not sourced data. Coordinates are listed in the site files with their source.",
        "roles": ROLES,
        "sources": {k: {"source_id": k, **v} for k, v in SOURCES.items()},
        "mars_sites": mars_out,
        "earth_sites": earth_out,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    n = sum(1 for x in mars_out + earth_out for c in x["conditions"] if c["status"] == "quoted")
    t = sum(len(x["conditions"]) for x in mars_out + earth_out)
    print(f"wrote {OUT}: {n} of {t} conditions quoted from approved sources; {sum(1 for e in earth_out if e['analog_basis'])} analog links stated by a source")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    raise SystemExit(main(sys.argv[1]))
