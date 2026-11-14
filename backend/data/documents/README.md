# Curated scientific corpus

This directory is the evidence behind `POST /api/v1/research/explain`. Every
excerpt the research panel quotes, and every `[C#]` citation an explanation
carries, points at a chunk in `chunks.jsonl`, and every chunk points back at a
real public document in `corpus/`.

```
corpus/<document_id>.json   one file per ingested document: full extracted text + metadata
chunks.jsonl                one JSON object per line, the unit of retrieval
manifest.json               what was ingested, what failed and why, when, and the chunking parameters
```

## What is in it

Built by `scripts/ingest_documents.py` from a hand-curated list of real,
public URLs (see `DOCUMENTS` in that script). The list covers:

| Group | Sources |
|---|---|
| The 8 Mars sites | NASA Science mission pages for Mars 2020 (Jezero), MSL (Gale), InSight (Elysium Planitia), Viking 1 and 2 (Chryse, Utopia), MER Spirit and Opportunity (Gusev, Meridiani); ESA's Oxia Planum selection article |
| Nomenclature | USGS/IAU Gazetteer of Planetary Nomenclature descriptor-term and Mars system pages |
| MOLA MEGDR | the PDS3 label of the 16 ppd grid the profiles are built from, the archive AAREADME, the data set catalog and the PDS Geosciences product page |
| Landing-site selection | the 2015 First Landing Site / Exploration Zone Workshop page (LPI) |
| Earth analog programmes and datasets | NASA Analog Missions, ARADS (Atacama), Haughton-Mars Project, the Copernicus DEM registry entry, NASA POWER methodology |
| Peer-reviewed literature | Crossref metadata records for every DOI cited in `data/mars/sites.json` and `data/earth/candidates.json` |

The literature entries are **bibliographic records, not papers**: the papers
are paywalled, so each record holds the title, authors, venue, date, DOI and
(where Crossref has one) the abstract, and its text says so explicitly. A
citation of one of these supports "this paper exists and studied this site",
not a quotation of its findings unless the abstract carries them.

`manifest.json` lists the documents that were skipped and why. Pages that are
JavaScript shells to a plain fetch (for example the Mars Society MDRS site and
the NASA POWER home page) are recorded as failed rather than replaced with
anything invented.

## Chunk fields

```
chunk_id              "<document_id>#<nnn>"
document_id, title, institution, url
publication_date      ISO date from Crossref, a PDS3 PRODUCT_CREATION_TIME, or the page's own
                      article:published_time / datePublished tag; null when no source stated one
geographic_relevance  site ids (data/mars/sites.json), Earth candidate ids
                      (data/earth/candidates.json) and region names detected in the chunk text,
                      plus the document's default tags; used by the retriever's metadata boost
text                  ~700-1000 characters, split on paragraph (then sentence) boundaries,
                      ~150 characters of overlap with the previous chunk
char_start, char_end  offsets into corpus/<document_id>.json "text"
retrieved_at          ISO date the page was fetched
```

## Rebuilding

```bash
cd backend && source .venv/bin/activate
python scripts/ingest_documents.py              # fetches every URL (1 s pacing), rewrites corpus/, chunks.jsonl, manifest.json
python scripts/ingest_documents.py --offline    # re-chunk corpus/ without touching the network
python scripts/ingest_documents.py --only nasa_arads crossref_lit_yungay   # refetch a few, keep the rest
```

The output is committed so the API and the tests run offline; CI never
fetches. The optional ChromaDB vector index (`EMBEDDING_BACKEND=chroma-default`,
`pip install -r requirements-ai.txt`) is built lazily from `chunks.jsonl` at
first start-up under `VECTOR_INDEX_DIR` and is gitignored; delete that
directory after rebuilding the corpus so stale vectors are dropped (the
retriever also removes ids that no longer exist in `chunks.jsonl`).

## Trust

**Retrieved documents are untrusted input.** They are public web pages and
third-party metadata fetched verbatim. The application quotes them as
evidence and hands them to the language model inside labelled delimiters
with the instruction that anything inside that reads like an instruction is
text to describe, not something to do. Nothing in this directory is executed,
and no number in it can enter a score: scores come only from the measured
profiles and the scoring spec. Read the source at `url` before relying on a
claim; the excerpt is a pointer, not a substitute.

Licences: NASA and USGS web content and PDS data are US public domain; ESA
content is quoted under ESA's standard licence for editorial use with
attribution; Crossref metadata is CC0; the Copernicus registry entry and the
Mars Institute page are quoted for attribution and reference. Nothing here is
redistributed beyond the excerpts needed to cite it.
