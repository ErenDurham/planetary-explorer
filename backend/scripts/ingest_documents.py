"""Ingest: build the curated scientific corpus behind the research explanations.

Pipeline (docs/ARCHITECTURE.md, "Research"):

    Documents (a fixed, hand-curated list of REAL public URLs, below)
      -> Extraction   (HTTP fetch with a browser-like User-Agent, 1 s pacing;
                       HTML is reduced to paragraph text, PDS labels and plain
                       text are kept as-is, Crossref JSON becomes a short
                       bibliographic record)
      -> Chunking     (~700-1000 characters, ~150 character overlap, split on
                       paragraph boundaries; a single oversized paragraph is
                       split on sentence boundaries)
      -> Metadata     (document_id, title, institution, url, publication_date,
                       geographic_relevance = site ids / Earth candidate ids /
                       region names detected in the chunk text plus the
                       document's own defaults, char offsets, retrieved_at)
      -> data/documents/corpus/<document_id>.json   full text + metadata
         data/documents/chunks.jsonl                one chunk per line
         data/documents/manifest.json               what was ingested, what
                                                    failed and why
      -> (Embeddings -> vector index: app/services/retrieval_engine.py builds
          the optional ChromaDB index lazily from chunks.jsonl at first use)

Safety rules this script enforces:

* NOTHING IS INVENTED. Every document comes from the `DOCUMENTS` list, whose
  URLs were typed in by a human. The script never fabricates a URL, a title it
  did not read off the page, or a publication date: `publication_date` is
  taken from Crossref (`issued`/`published-print`/`published-online`), from a
  PDS3 `PRODUCT_CREATION_TIME`, or from an `article:published_time` /
  `datePublished` meta tag, and is `null` otherwise.
* A FETCH THAT FAILS IS SKIPPED AND LOGGED, never guessed around. Client-side
  rendered pages (JavaScript shells) are detected by the extracted text being
  short (< MIN_TEXT_CHARS) or by none of the document's `expect` terms
  appearing in a sentence of the extracted text; such pages are recorded in
  the manifest under `failed` with the reason.
* RETRIEVED TEXT IS UNTRUSTED DATA. It is stored and later quoted as evidence;
  nothing here or downstream executes it or treats it as instructions.
* Peer-reviewed papers are paywalled, so for every DOI cited in
  data/mars/sites.json and data/earth/candidates.json the script ingests the
  Crossref metadata (title, authors, container title, year, abstract where
  Crossref has one) as a short document whose URL is the DOI link. Such a
  document says what the paper IS, not what it found, and its text makes that
  explicit.

Run from backend/ with the venv active:

    python scripts/ingest_documents.py            # full rebuild
    python scripts/ingest_documents.py --offline  # re-chunk corpus/ without fetching

The committed output is what the API and the tests use; CI never fetches.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html as html_lib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
DATA = BACKEND / "data"
OUT = DATA / "documents"
CORPUS = OUT / "corpus"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 PlanetaryExplorer-ingest/1.0"
)
REQUEST_PAUSE_S = 1.0
TIMEOUT_S = 45
MIN_TEXT_CHARS = 1200          # below this an HTML page is treated as a JS shell
CHUNK_TARGET = 900             # aim for ~700-1000 characters
CHUNK_MAX = 1000
CHUNK_MIN = 700
CHUNK_OVERLAP = 150


# --------------------------------------------------------------------------
# The document list. Hand-curated; every URL is a real public page.
# --------------------------------------------------------------------------
@dataclass
class DocSpec:
    document_id: str
    url: str
    institution: str
    kind: str = "html"                        # html | text | crossref
    title: str | None = None                  # fallback title if the page has none
    geographic_relevance: list[str] = field(default_factory=list)
    expect: list[str] = field(default_factory=list)   # at least one must appear in a sentence
    topic: str = ""


DOI_SOURCES = {
    # Mars literature cited in data/mars/sites.json
    "lit_jezero_mineralogy": ("10.1002/2014JE004782", ["jezero_crater"]),
    "lit_gale_stratigraphy": ("10.1126/science.1242777", ["gale_crater"]),
    "lit_oxia_clays": ("10.1089/ast.2019.2191", ["oxia_planum"]),
    "lit_meridiani_hematite": ("10.1029/1999JE001093", ["meridiani_planum"]),
    "lit_utopia_ice": ("10.1002/2016GL070138", ["utopia_planitia"]),
    "lit_gusev_basalt": ("10.1126/science.3050842", ["gusev_crater"]),
    "lit_golombek_mer_sites": ("10.1029/2003JE002074", ["gusev_crater", "meridiani_planum"]),
    # Earth analog literature cited in data/earth/candidates.json
    "lit_yungay": ("10.1126/science.1089143", ["atacama_yungay"]),
    "lit_dry_valleys": ("10.1016/j.icarus.2007.06.018", ["mcmurdo_dry_valleys"]),
    "lit_haughton": ("10.1111/j.1945-5100.2005.tb00147.x", ["haughton_crater"]),
    "lit_holuhraun": ("10.1016/j.jvolgeores.2017.02.027", ["holuhraun_iceland"]),
}

DOCUMENTS: list[DocSpec] = [
    # --- Mars sites: NASA mission pages (science.nasa.gov renders server-side) ---
    DocSpec("nasa_m2020_overview", "https://science.nasa.gov/mission/mars-2020-perseverance/", "NASA Science / JPL",
            geographic_relevance=["jezero_crater"], expect=["Jezero"], topic="Mars 2020 Perseverance mission overview"),
    DocSpec("nasa_m2020_science", "https://science.nasa.gov/mission/mars-2020-perseverance/science/", "NASA Science / JPL",
            geographic_relevance=["jezero_crater"], expect=["Jezero"], topic="Mars 2020 science goals and Jezero landing site"),
    DocSpec("nasa_msl_overview", "https://science.nasa.gov/mission/msl-curiosity/", "NASA Science / JPL",
            geographic_relevance=["gale_crater"], expect=["Gale"], topic="Mars Science Laboratory Curiosity overview"),
    DocSpec("nasa_msl_science", "https://science.nasa.gov/mission/msl-curiosity/science/", "NASA Science / JPL",
            geographic_relevance=["gale_crater"], expect=["Gale", "Mount Sharp"], topic="Curiosity science at Gale Crater"),
    DocSpec("nasa_insight_overview", "https://science.nasa.gov/mission/insight/", "NASA Science / JPL",
            geographic_relevance=["elysium_planitia"], expect=["Elysium"], topic="InSight lander overview"),
    DocSpec("nasa_insight_science", "https://science.nasa.gov/mission/insight/science/", "NASA Science / JPL",
            geographic_relevance=["elysium_planitia"], expect=["InSight"], topic="InSight science"),
    DocSpec("nasa_viking_project", "https://science.nasa.gov/mission/viking/", "NASA Science",
            geographic_relevance=["chryse_planitia", "utopia_planitia"], expect=["Chryse", "Utopia"], topic="Viking project"),
    DocSpec("nasa_viking_1", "https://science.nasa.gov/mission/viking-1/", "NASA Science",
            geographic_relevance=["chryse_planitia"], expect=["Chryse"], topic="Viking 1 lander"),
    DocSpec("nasa_viking_2", "https://science.nasa.gov/mission/viking-2/", "NASA Science",
            geographic_relevance=["utopia_planitia"], expect=["Utopia"], topic="Viking 2 lander"),
    DocSpec("nasa_mer_overview", "https://science.nasa.gov/mission/mars-exploration-rovers-spirit-and-opportunity/", "NASA Science / JPL",
            geographic_relevance=["gusev_crater", "meridiani_planum"], expect=["Gusev", "Meridiani"], topic="Mars Exploration Rovers"),
    DocSpec("nasa_mer_spirit", "https://science.nasa.gov/mission/mer-spirit/", "NASA Science / JPL",
            geographic_relevance=["gusev_crater"], expect=["Gusev"], topic="Spirit rover"),
    DocSpec("nasa_mer_opportunity", "https://science.nasa.gov/mission/mer-opportunity/", "NASA Science / JPL",
            geographic_relevance=["meridiani_planum"], expect=["Meridiani"], topic="Opportunity rover"),
    # --- ESA ExoMars landing site ---
    DocSpec("esa_oxia_planum", "https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Exploration/ExoMars/Oxia_Planum_favoured_for_ExoMars_surface_mission",
            "ESA", geographic_relevance=["oxia_planum"], expect=["Oxia Planum"], topic="ExoMars landing site selection"),
    # --- USGS planetary nomenclature (the per-feature pages are JavaScript shells; these two carry text) ---
    DocSpec("usgs_nomenclature_descriptor_terms", "https://planetarynames.wr.usgs.gov/DescriptorTerms", "USGS Astrogeology / IAU WGPSN",
            title="Gazetteer of Planetary Nomenclature: Descriptor Terms (Feature Types)",
            expect=["Crater", "Planitia", "Planum"], topic="Planetary nomenclature feature types"),
    DocSpec("usgs_nomenclature_mars_system", "https://planetarynames.wr.usgs.gov/Page/MARS/system", "USGS Astrogeology / IAU WGPSN",
            title="Gazetteer of Planetary Nomenclature: Mars System", expect=["Mars"], topic="Mars nomenclature"),
    # NOTE: planetarynames.wr.usgs.gov/Page/MARS/target and the per-feature pages
    # (/Feature/<id>) are JavaScript shells to a plain fetch and are deliberately
    # not listed; sites.json cites the target page for coordinates only.
    # --- MOLA MEGDR dataset ---
    DocSpec("pds_mola_megdr_label", "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/megt90n000eb.lbl",
            "NASA PDS Geosciences Node / MOLA Science Team", kind="text",
            title="PDS3 label for MOLA MEGDR MEGT90N000EB (16 pixel/degree global topography)",
            expect=["MOLA", "MEGDR"], topic="MOLA MEGDR dataset label"),
    DocSpec("pds_mola_megdr_aareadme", "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/aareadme.txt",
            "NASA PDS Geosciences Node / MOLA Science Team", kind="text",
            title="MGS MOLA MEGDR archive volume AAREADME", expect=["MOLA"], topic="MOLA MEGDR archive description"),
    DocSpec("pds_mola_megdr_catalog", "https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/catalog/megdrds.cat",
            "NASA PDS Geosciences Node / MOLA Science Team", kind="text",
            title="MGS MOLA MEGDR data set catalog", expect=["MOLA"], topic="MOLA MEGDR dataset catalog"),
    DocSpec("pds_mola_megdr_page", "https://pds-geosciences.wustl.edu/missions/mgs/megdr.html", "NASA PDS Geosciences Node",
            expect=["MOLA", "MEGDR"], topic="MOLA MEGDR product page"),
    # --- Landing-site selection background ---
    DocSpec("lpi_exploration_zone_workshop_2015", "https://www.hou.usra.edu/meetings/explorationzone2015/", "NASA / Lunar and Planetary Institute (USRA)",
            title="First Landing Site/Exploration Zone Workshop for Human Missions to the Surface of Mars (2015)",
            expect=["Exploration Zone", "landing site", "Landing Site"], topic="Human landing site workshop"),
    # --- Earth analog programmes and datasets ---
    DocSpec("nasa_analog_missions", "https://www.nasa.gov/analog-missions/", "NASA",
            geographic_relevance=[], expect=["analog"], topic="NASA analog missions overview"),
    DocSpec("nasa_arads", "https://www.nasa.gov/universe/atacama-rover-astrobiology-drilling-studies-arads/", "NASA Ames",
            geographic_relevance=["atacama_yungay"], expect=["Atacama"], topic="ARADS Atacama rover drilling studies"),
    DocSpec("marsinstitute_hmp", "https://www.marsinstitute.no/hmp", "Mars Institute / SETI Institute / NASA",
            geographic_relevance=["haughton_crater"], expect=["Haughton"], topic="Haughton-Mars Project"),
    DocSpec("marssociety_mdrs", "https://mdrs.marssociety.org/", "The Mars Society",
            geographic_relevance=["mdrs_utah"], expect=["Mars Desert Research Station", "MDRS"], topic="Mars Desert Research Station"),
    DocSpec("aws_copernicus_dem_registry", "https://registry.opendata.aws/copernicus-dem/", "ESA Copernicus / AWS Registry of Open Data",
            expect=["Copernicus"], topic="Copernicus DEM dataset registry"),
    DocSpec("nasa_power_home", "https://power.larc.nasa.gov/", "NASA Langley Research Center (POWER)",
            expect=["POWER"], topic="NASA POWER project"),
    DocSpec("nasa_power_methodology", "https://power.larc.nasa.gov/docs/methodology/", "NASA Langley Research Center (POWER)",
            expect=["POWER", "MERRA"], topic="NASA POWER methodology"),
]
for _sid, (_doi, _geo) in DOI_SOURCES.items():
    DOCUMENTS.append(DocSpec(f"crossref_{_sid}", f"https://api.crossref.org/works/{_doi}", "Crossref metadata", kind="crossref",
                             geographic_relevance=list(_geo), expect=[], topic=f"Bibliographic record for DOI {_doi}"))


# --------------------------------------------------------------------------
# Geographic relevance: aliases detected in chunk text.
# --------------------------------------------------------------------------
def load_geo_aliases() -> tuple[dict[str, list[str]], dict[str, str]]:
    """Returns ({id: [alias, ...]}, {site_id: region}) from the committed site
    and candidate files, plus hand-written aliases for names the pages use."""
    sites = json.loads((DATA / "mars" / "sites.json").read_text())
    cands = json.loads((DATA / "earth" / "candidates.json").read_text())
    extra = {
        "jezero_crater": ["Jezero"],
        "gale_crater": ["Gale Crater", "Gale crater", "Mount Sharp", "Aeolis Mons", "Bradbury Landing"],
        "elysium_planitia": ["Elysium Planitia", "Elysium"],
        "oxia_planum": ["Oxia Planum", "Oxia"],
        "utopia_planitia": ["Utopia Planitia", "Utopia"],
        "chryse_planitia": ["Chryse Planitia", "Chryse"],
        "meridiani_planum": ["Meridiani Planum", "Meridiani", "Terra Meridiani"],
        "gusev_crater": ["Gusev Crater", "Gusev crater", "Gusev", "Ma'adim Vallis"],
        "atacama_yungay": ["Atacama", "Yungay"],
        "mcmurdo_dry_valleys": ["Dry Valleys", "McMurdo", "University Valley"],
        "haughton_crater": ["Haughton", "Devon Island"],
        "death_valley": ["Death Valley"],
        "holuhraun_iceland": ["Holuhraun", "Bardarbunga", "Bárðarbunga"],
        "mdrs_utah": ["Mars Desert Research Station", "MDRS", "San Rafael Swell", "Hanksville"],
        "mauna_kea_summit": ["Mauna Kea", "Maunakea"],
    }
    aliases: dict[str, list[str]] = {}
    regions: dict[str, str] = {}
    for s in sites["sites"]:
        aliases[s["id"]] = [s["name"]] + extra.get(s["id"], [])
        regions[s["id"]] = s["region"]
    for c in cands["candidates"]:
        aliases[c["id"]] = [c["name"]] + extra.get(c["id"], [])
    return aliases, regions


def detect_relevance(text: str, aliases: dict[str, list[str]], regions: dict[str, str]) -> list[str]:
    found: list[str] = []
    for ident, names in aliases.items():
        for n in names:
            if re.search(r"\b" + re.escape(n) + r"\b", text, flags=re.IGNORECASE if len(n) > 5 else 0):
                found.append(ident)
                if ident in regions:
                    found.append(regions[ident])
                break
    return found


# --------------------------------------------------------------------------
# Fetching and extraction
# --------------------------------------------------------------------------
def fetch(url: str) -> tuple[bytes, str, str]:
    """Returns (body, content_type, final_url). Raises on HTTP/network error."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/json,text/plain;q=0.9,*/*;q=0.8"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
        return r.read(), r.headers.get("Content-Type", ""), r.geturl()


_BLOCK_END = re.compile(r"(?i)</(p|div|li|ul|ol|h[1-6]|section|article|blockquote|tr|table|figcaption|dd|dt)>|<br\s*/?>|<hr\s*/?>")
_DROP = re.compile(r"(?is)<(script|style|noscript|svg|nav|footer|header|aside|form|button|iframe|template).*?</\1>")
_COMMENT = re.compile(r"(?s)<!--.*?-->")
_TAG = re.compile(r"(?s)<[^>]+>")


def html_title(h: str) -> str | None:
    m = re.search(r"(?is)<title[^>]*>(.*?)</title>", h)
    if not m:
        return None
    t = html_lib.unescape(re.sub(r"\s+", " ", m.group(1))).strip()
    return t or None


def html_published_date(h: str) -> str | None:
    """Only dates the page itself declares; never inferred."""
    for pat in (r'(?i)<meta[^>]+property=["\']article:published_time["\'][^>]+content=["\']([^"\']+)',
                r'(?i)<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']article:published_time["\']',
                r'(?i)"datePublished"\s*:\s*"([^"]+)"'):
        m = re.search(pat, h)
        if m:
            return m.group(1)[:10]
    return None


def html_to_paragraphs(h: str) -> str:
    """HTML -> paragraph-separated plain text. Prefers <main>/<article> when
    that carries most of the page's text (drops site chrome)."""
    h = _COMMENT.sub(" ", h)
    h = _DROP.sub(" ", h)

    def to_text(fragment: str) -> str:
        frag = _BLOCK_END.sub("\n\n", fragment)
        frag = _TAG.sub(" ", frag)
        frag = html_lib.unescape(frag)
        paras = [re.sub(r"[ \t\r\f\v\u00a0]+", " ", p).strip() for p in re.split(r"\n\s*\n+", frag)]
        return "\n\n".join(p for p in paras if p)

    # Site chrome (menus, "related" rails, cookie banners) can outweigh the
    # article on a modern agency page, so prefer the <main>/<article> element
    # whenever it carries enough text to be the content itself.
    for tag in ("article", "main"):
        m = re.search(rf"(?is)<{tag}\b[^>]*>(.*?)</{tag}>", h)
        if m:
            inner = to_text(m.group(1))
            if len(inner) >= MIN_TEXT_CHARS:
                return inner
    return to_text(h)


_JATS = re.compile(r"(?s)<[^>]+>")


def crossref_to_document(body: bytes, spec: DocSpec) -> tuple[str, str, str | None, str]:
    """Returns (text, title, publication_date, institution) from Crossref JSON."""
    msg = json.loads(body.decode("utf-8"))["message"]
    title = (msg.get("title") or ["(untitled)"])[0]
    authors = []
    for a in msg.get("author", []) or []:
        nm = " ".join(x for x in (a.get("given"), a.get("family")) if x) or a.get("name")
        if nm:
            authors.append(nm)
    container = (msg.get("container-title") or [None])[0]
    publisher = msg.get("publisher")
    year = None
    date = None
    for key in ("published-print", "published-online", "issued", "created"):
        parts = (msg.get(key) or {}).get("date-parts") or []
        if parts and parts[0] and parts[0][0]:
            p = parts[0]
            year = p[0]
            date = "-".join(f"{int(x):02d}" if i else str(x) for i, x in enumerate(p))
            break
    doi = msg.get("DOI", "")
    paras = [
        f"Bibliographic record (Crossref metadata, not the paper's full text): {title}.",
        "Authors: " + (", ".join(authors) if authors else "not listed in Crossref") + ".",
        "Published in " + (container or "an unlisted venue") + (f", volume {msg['volume']}" if msg.get("volume") else "")
        + (f", issue {msg['issue']}" if msg.get("issue") else "") + (f", pages {msg['page']}" if msg.get("page") else "")
        + (f" ({year})" if year else "") + (f", publisher {publisher}" if publisher else "") + f". DOI: https://doi.org/{doi}.",
        "This record describes what the publication is about; the peer-reviewed full text is behind the DOI and was not ingested. "
        "Claims about the site's geology or history that cite this record should be read as 'this paper exists and studied the "
        "named site', not as a quotation of its findings unless an abstract appears below.",
    ]
    abstract = msg.get("abstract")
    if abstract:
        ab = html_lib.unescape(_JATS.sub(" ", abstract))
        ab = re.sub(r"\s+", " ", ab).strip()
        if ab:
            paras.append("Abstract (from Crossref): " + ab)
    subj = msg.get("subject")
    if subj:
        paras.append("Subjects: " + ", ".join(subj) + ".")
    institution = " / ".join(x for x in (container, publisher) if x) or spec.institution
    return "\n\n".join(paras), title, date, institution


# --------------------------------------------------------------------------
# Chunking
# --------------------------------------------------------------------------
_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")


def _spans(text: str) -> list[tuple[int, int]]:
    """Paragraph spans (char offsets into text); oversized paragraphs are
    split into sentence spans so a chunk can still end on a boundary."""
    spans: list[tuple[int, int]] = []
    pos = 0
    for para in re.split(r"\n\s*\n", text):
        if not para.strip():
            pos += len(para)
            continue
        start = text.find(para, pos)
        end = start + len(para)
        pos = end
        if end - start <= CHUNK_MAX:
            spans.append((start, end))
            continue
        spos = start
        for sent in _SENT_SPLIT.split(para):
            if not sent:
                continue
            s = text.find(sent, spos)
            spans.append((s, s + len(sent)))
            spos = s + len(sent)
    return spans


def chunk_text(text: str, target: int = CHUNK_TARGET, maximum: int = CHUNK_MAX, overlap: int = CHUNK_OVERLAP) -> list[tuple[int, int]]:
    """Returns (char_start, char_end) pairs covering `text`, each about
    `target` characters, never above `maximum` unless a single sentence is,
    split on paragraph (or sentence) boundaries, with ~`overlap` characters of
    the previous chunk repeated at the start of the next one. Every chunk
    contains at least one span the previous chunk did not end with, so the
    walk always advances."""
    spans = _spans(text)
    if not spans:
        return []
    chunks: list[tuple[int, int]] = []
    i, start, must_include = 0, spans[0][0], 0
    while True:
        end, j = max(start, spans[i][1]), i
        while j + 1 < len(spans) and (spans[j + 1][1] - start <= maximum or j + 1 <= must_include):
            j += 1
            end = spans[j][1]
            if end - start >= target and j >= must_include:
                break
        chunks.append((start, end))
        if j + 1 >= len(spans):
            break
        must_include = j + 1
        back = max(start + 1, end - overlap)
        ws = text.rfind(" ", start + 1, back + 1)
        nxt = ws + 1 if ws > start else back
        k = j
        while k > 0 and spans[k][0] > nxt:
            k -= 1
        if spans[k][1] <= nxt:          # landed in the gap between two spans
            k += 1
            nxt = spans[k][0]
        i, start = k, max(nxt, spans[k][0])
    return chunks


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def accept(text: str, spec: DocSpec) -> str | None:
    """Returns a rejection reason, or None if the extracted text is usable."""
    if spec.kind == "crossref":
        return None if len(text) > 200 else "crossref record too short"
    if len(text) < MIN_TEXT_CHARS:
        return f"extracted text too short ({len(text)} chars): likely a JavaScript-rendered shell"
    if spec.expect:
        sentences = re.split(r"(?<=[.!?])\s+", text)
        if not any(any(term.lower() in s.lower() for term in spec.expect) for s in sentences if len(s) > 20):
            return f"none of the expected terms {spec.expect} appear in a sentence; page did not carry the content"
    return None


def process(spec: DocSpec, aliases: dict[str, list[str]], regions: dict[str, str], offline: bool) -> tuple[dict | None, list[dict], str | None]:
    """Returns (document record, chunk records, failure reason)."""
    corpus_path = CORPUS / f"{spec.document_id}.json"
    if offline:
        if not corpus_path.exists():
            return None, [], "offline and not in corpus/"
        doc = json.loads(corpus_path.read_text())
    else:
        try:
            body, ctype, final_url = fetch(spec.url)
        except urllib.error.HTTPError as e:
            return None, [], f"HTTP {e.code}"
        except Exception as e:  # noqa: BLE001 - every network failure is logged, none is fatal
            return None, [], f"fetch error: {type(e).__name__}: {e}"
        retrieved_at = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
        title, pub_date, institution = spec.title, None, spec.institution
        if spec.kind == "crossref":
            try:
                text, title, pub_date, institution = crossref_to_document(body, spec)
            except Exception as e:  # noqa: BLE001
                return None, [], f"crossref parse error: {e}"
        elif spec.kind == "text" or ("html" not in ctype and "json" not in ctype):
            text = body.decode("utf-8", "replace").replace("\r\n", "\n")
            m = re.search(r"PRODUCT_CREATION_TIME\s*=\s*([0-9T:\-\.]+)", text)
            if m:
                pub_date = m.group(1)[:10]
            # PDS labels / readmes: paragraphs are blank-line separated already
            text = re.sub(r"[ \t]+\n", "\n", text)
        else:
            h = body.decode("utf-8", "replace")
            title = spec.title or html_title(h)   # a human-written title in DOCUMENTS beats a generic <title>
            pub_date = html_published_date(h)
            text = html_to_paragraphs(h)
        reason = accept(text, spec)
        if reason:
            return None, [], reason
        doc = {
            "document_id": spec.document_id,
            "title": title or spec.document_id,
            "institution": institution,
            "url": spec.url,
            "final_url": final_url,
            "publication_date": pub_date,
            "retrieved_at": retrieved_at,
            "content_type": ctype,
            "kind": spec.kind,
            "topic": spec.topic,
            "default_geographic_relevance": list(spec.geographic_relevance),
            "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "char_count": len(text),
            "text": text,
        }
    chunks = []
    for n, (s, e) in enumerate(chunk_text(doc["text"]), 1):
        ctext = doc["text"][s:e]
        geo = list(dict.fromkeys(list(doc["default_geographic_relevance"]) + detect_relevance(ctext, aliases, regions)
                                 + [regions[g] for g in doc["default_geographic_relevance"] if g in regions]))
        chunks.append({
            "chunk_id": f"{doc['document_id']}#{n:03d}",
            "document_id": doc["document_id"],
            "title": doc["title"],
            "institution": doc["institution"],
            "url": doc["url"],
            "publication_date": doc["publication_date"],
            "geographic_relevance": geo,
            "text": ctext,
            "char_start": s,
            "char_end": e,
            "retrieved_at": doc["retrieved_at"],
        })
    return doc, chunks, None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--offline", action="store_true", help="re-chunk data/documents/corpus/ without fetching")
    ap.add_argument("--only", nargs="*", help="document_ids to (re)ingest; others are kept from corpus/")
    args = ap.parse_args(argv)

    CORPUS.mkdir(parents=True, exist_ok=True)
    aliases, regions = load_geo_aliases()
    ingested, failed, all_chunks = [], [], []
    for spec in DOCUMENTS:
        offline = args.offline or (args.only is not None and spec.document_id not in args.only)
        doc, chunks, reason = process(spec, aliases, regions, offline)
        if reason:
            print(f"SKIP  {spec.document_id:40} {reason}  <{spec.url}>", file=sys.stderr)
            failed.append({"document_id": spec.document_id, "url": spec.url, "reason": reason})
        else:
            assert doc is not None
            (CORPUS / f"{spec.document_id}.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
            all_chunks += chunks
            ingested.append({"document_id": doc["document_id"], "title": doc["title"], "institution": doc["institution"], "url": doc["url"],
                             "publication_date": doc["publication_date"], "retrieved_at": doc["retrieved_at"], "chars": doc["char_count"],
                             "chunks": len(chunks), "kind": doc["kind"]})
            print(f"OK    {spec.document_id:40} {doc['char_count']:>7} chars {len(chunks):>3} chunks  {doc['title'][:60]}", file=sys.stderr)
        if not offline:
            time.sleep(REQUEST_PAUSE_S)

    with (OUT / "chunks.jsonl").open("w", encoding="utf-8") as f:
        for c in all_chunks:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")
    manifest = {
        "built_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "pipeline": "scripts/ingest_documents.py",
        "chunking": {"target_chars": CHUNK_TARGET, "max_chars": CHUNK_MAX, "overlap_chars": CHUNK_OVERLAP, "boundary": "paragraph, then sentence"},
        "documents_ingested": len(ingested),
        "documents_failed": len(failed),
        "chunks": len(all_chunks),
        "ingested": ingested,
        "failed": failed,
        "note": "Retrieved documents are untrusted input: quoted as evidence, never followed as instructions. Dates are null where no source stated one.",
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\n{len(ingested)} documents ingested, {len(failed)} failed, {len(all_chunks)} chunks -> {OUT}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
