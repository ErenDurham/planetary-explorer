"""Check every workbook condition text against the research corpus.

For each condition cell that has approved sources, the text the corpus holds
for those sources (agency page, open-access paper or abstract, Crossref
abstract) is searched for the cell's content:

  * every number in the cell must appear in one sentence of a source, or
  * (cells without numbers) at least 60% (and 3) of the cell's content words must
    appear in one sentence of a source.

Outcome per cell (written back to data/workbook/lesser_known_sites.v1.json):

  verified            a sentence of an approved source states it; the
                      sentence is stored as `evidence_quote` with its source
  cited_not_verified  the workbook ties it to approved sources, but their
                      retrievable text (often only an abstract) does not state
                      it; shown with that caveat
  citation_only       none of the cell's sources has retrievable text beyond a
                      bibliographic record; shown with that caveat

Cells already null (not found in sources, or excluded-only) are untouched.
Matching is deliberately literal: a miss is reported, never guessed around.

Run from backend/ after scripts/ingest_documents.py:
    python scripts/verify_workbook_conditions.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
WB = DATA / "workbook" / "lesser_known_sites.v1.json"
CORPUS = DATA / "documents" / "corpus"
STOP = set("""about above after again along also among and around because been before being below between both
cells could does down each from have here into just like many more most much near only other over same since
some such than that their them then there these they this those through under very were what when where which
while with within would your workbook sources source found approx approximately mostly noted figure value values""".split())
BIBLIO = "Bibliographic record (Crossref metadata"
# Literal matches that a human review (2026-11-15) found do NOT state the cell:
# (site, group, feature) with group site | pair_mars | pair_earth.
REJECTED = {
    ("amazonis_arcadia_ap8", "pair_earth", "terrain"): "quote is about Linnaeus Terrace, Upper Wright Valley, not University Valley",
    ("huygens_crater", "pair_earth", "mineralogy"): "table row lists impact melt rock but not the Sudbury Igneous Complex or Sudbury Breccia",
    ("deuteronilus_mensae", "site", "water_ice"): "matched only the digit 1 in a map scale",
    ("deuteronilus_mensae", "pair_mars", "water_ice"): "matched only the digit 1 in a map scale",
    ("deuteronilus_mensae", "pair_earth", "terrain"): "quote gives 1-1.5 m and 2-3 m debris (citing Potter 1972), not the cell's description",
    ("meridiani_planum", "site", "mineralogy"): "quote names hematite but not sulfates",
    ("meridiani_planum", "pair_mars", "mineralogy"): "quote names hematite but not sulfates",
}


def corpus_text(source_id: str) -> str | None:
    """Evidence text for a source: the page/paper text, or a Crossref abstract; None if only a bibliographic stub."""
    for prefix in ("wb_", "crossref_", ""):
        p = CORPUS / f"{prefix}{source_id}.json"
        if p.exists():
            doc = json.loads(p.read_text(encoding="utf-8"))
            text = doc["text"]
            if text.startswith(BIBLIO):
                m = re.search(r"Abstract \(from Crossref\): (.*)", text, re.S)
                return m.group(1) if m else None
            return text
    return None


def numbers(s: str) -> list[str]:
    out = []
    for n in re.findall(r"\d[\d,]*(?:\.\d+)?", s):
        n = n.replace(",", "")
        if n not in out:
            out.append(n)
    return out


def words(s: str) -> list[str]:
    return [w for w in re.findall(r"[a-zà-ž]{4,}", s.lower()) if w not in STOP]


def sentences(text: str) -> list[str]:
    return [x.strip() for x in re.split(r"(?<=[.!?])\s+|\n+", text) if len(x.strip()) > 20]


def stem(w: str) -> str:
    return re.sub(r"(ies|es|s|ing|ed)$", "", w)


def match(cell_text: str, text: str) -> str | None:
    nums, ws = numbers(cell_text), words(cell_text)
    for sent in sentences(text):
        flat = sent.replace(",", "").replace("−", "-")
        if nums:
            if all(re.search(r"(?<![\d.])" + re.escape(n) + r"(?![\d])", flat) for n in nums):
                return sent
        elif ws:
            sw = {stem(w) for w in words(sent)}
            hit = sum(1 for w in ws if stem(w) in sw)
            if hit / len(ws) >= 0.6 and hit >= 3:
                return sent
    return None


def verify(c: dict, key: tuple[str, str, str]) -> None:
    if c["text"] is None or not c["source_ids"]:
        return
    texts = {sid: corpus_text(sid) for sid in c["source_ids"]}
    available = {k: v for k, v in texts.items() if v}
    for sid, t in available.items():
        q = match(c["text"], t)
        if q and key not in REJECTED:
            c.update(status="verified", evidence_source_id=sid, evidence_quote=q[:600])
            return
    c.pop("evidence_source_id", None); c.pop("evidence_quote", None)
    c["status"] = "cited_not_verified" if available else "citation_only"


def main() -> int:
    wb = json.loads(WB.read_text(encoding="utf-8"))
    counts: dict[str, int] = {}
    for m in wb["mars_sites"]:
        for group, cells in (("site", m["conditions"]), ("pair_mars", m["pair"]["mars"]), ("pair_earth", m["pair"]["earth"])):
            for c in cells:
                verify(c, (m["id"], group, c["feature"]))
                counts[c["status"]] = counts.get(c["status"], 0) + 1
    WB.write_text(json.dumps(wb, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("cell statuses:", counts)
    for m in wb["mars_sites"]:
        for side, cells in (("mars", m["conditions"]), ("earth", m["pair"]["earth"])):
            for c in cells:
                if c["status"] == "verified":
                    print(f"  verified  {m['id']:<22} {side:<5} {c['feature']:<10} {c['text'][:50]!r} <- {c['evidence_source_id']}: {c['evidence_quote'][:110]!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
