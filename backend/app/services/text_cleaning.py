"""Passage cleaning shared by ingestion, retrieval and the explanation engine.

Why this exists: agency web pages ingested into the corpus carry navigation
labels ("Explore Resources", "Learn More"), image captions, photo credits and
fact-sheet metadata ("Launch Vehicle: Atlas V") between the paragraphs that
actually say something. Summarising that debris would only disguise it, so it
is stripped BEFORE a passage is shown, indexed or handed to a model, and a
passage that has nothing left is reported as insufficient rather than padded.

Everything here is lexical and documented; nothing is inferred about meaning.
"""
from __future__ import annotations

import re

# Whole lines (or pipe-separated cells) that are site chrome rather than prose.
_NAV_LINE = re.compile(
    r"^(?:read(?: about| more)?\b.*|learn more.*|explore (?:resources|more|the \w+).*|view (?:raw images|all|more).*|download(?:s)?.*|share.*|"
    r"featured (?:video|story|image).*|related (?:links|content|stories).*|image credit.*|credit:.*|photo credit.*|courtesy.*|"
    r"skip to (?:main )?content.*|menu|home|back to top|more about .*|see (?:also|more).*|watch .*|listen .*|"
    r"nasa/jpl(?:-caltech)?(?:/\w+)*|jpl-caltech|esa/[\w/]+|"
    r"quick facts.*|launch (?:vehicle|location|date|site)\s*:?.*|landing (?:date|site)\s*:\s*.*|mission (?:type|status)\s*:?.*|"
    r"type\s*:?\s*(?:rover|lander|orbiter).*|target\s*:?\s*(?:mars|moon).*|spacecraft\s*:.*|instruments?\s*:.*|"
    r"(?:last )?updated\s*:?.*|page (?:last )?updated.*|published\s*:?.*|\d{1,2} min read|"
    r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}, \d{4}|"
    r"[A-Z][A-Za-z ]{0,40}\s*:\s*(?:[A-Z][\w\- ]{1,30})?)$",
    re.IGNORECASE,
)
# A caption: short, often names an instrument/spacecraft and "this image/selfie/infographic".
_CAPTION = re.compile(r"(?i)\b(this (?:image|selfie|infographic|illustration|animation|video|graphic|mosaic|map|view)|artist'?s? (?:concept|impression|rendering|rendition)|image credit|pictured (?:here|above)|is seen in this|annotated image)\b")
# Sentence-level debris that survives paragraph filtering because it is glued to prose.
_SENT_DEBRIS = re.compile(r"(?i)\b(visit the|one-stop-shop|click here|read more|learn more|download(?:s)? (?:the|all)|sign up|subscribe|follow us|press kit|media (?:gallery|resources)|artist'?s? rendition|annotated image|credit:)\b")
_URL = re.compile(r"https?://\S+|www\.\S+")
_WS = re.compile(r"[ \t\r\f\v ]+")
_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])")
_WORD = re.compile(r"[A-Za-z][A-Za-z\-']+")

STOPWORDS = frozenset("""a an the and or but if then else of in on at to for from by with without into onto over under about above below between
among through during before after as is are was were be been being has have had do does did not no nor so than too very can could may might
shall should will would this that these those it its they them their there here where when which who whom whose what why how all any both
each few more most other some such only own same also just than ever never now""".split())


def clean_passage(text: str) -> str:
    """Drop navigation debris, captions, credits and metadata lines; keep prose.
    Returns "" when nothing resembling a sentence survives."""
    if not text:
        return ""
    # Chunks from the ingester separate blocks with " | " or blank lines.
    pieces: list[str] = []
    for block in re.split(r"\n\s*\n|\s\|\s", text):
        b = _WS.sub(" ", block).strip(" |•-–—")
        if not b:
            continue
        if _NAV_LINE.match(b):
            continue
        if len(b) < 40 and not b.endswith((".", "!", "?")):
            continue                                  # a label, not a sentence
        if _CAPTION.search(b) and (len(b) < 400 or re.search(r"(?i)\bcredit:", b)):
            continue                                  # a caption, however long, once it carries a credit line
        if _URL.search(b) and len(b) < 120:
            continue
        pieces.append(b)
    out = " ".join(pieces)
    out = _URL.sub("", out)
    out = _WS.sub(" ", out).strip()
    return out


def sentences(text: str) -> list[str]:
    """Whole sentences of a cleaned passage, dropping fragments (no verb-ish
    length, no terminal punctuation, or obviously cut off)."""
    out = []
    for s in _SENT_SPLIT.split(text):
        s = s.strip()
        if len(s) < 40 or len(s) > 420:
            continue
        if not s.endswith((".", "!", "?", ")")):
            continue
        if s[0].islower():
            continue                                  # cut mid-sentence by the chunker
        if _SENT_DEBRIS.search(s):
            continue                                  # a nav label or caption fused into a sentence
        out.append(s)
    return out


def content_tokens(text: str) -> set[str]:
    """Lower-cased content words (stopwords and very short tokens removed)."""
    return {w.lower() for w in _WORD.findall(text) if len(w) > 3 and w.lower() not in STOPWORDS}


def support_overlap(claim: str, passage: str) -> float:
    """Fraction of the claim's content words that occur in the passage. A
    LEXICAL check only: it tells you whether the words came from the passage,
    never whether the claim is scientifically correct."""
    c = content_tokens(claim)
    if not c:
        return 0.0
    p = content_tokens(passage)
    return len(c & p) / len(c)


def select_sentences(passage: str, query_terms: set[str], limit: int = 2) -> list[str]:
    """Extractive pick: the sentences sharing most content words with the
    query, in their original order. Empty if nothing overlaps."""
    scored = []
    for i, s in enumerate(sentences(passage)):
        hits = len(content_tokens(s) & query_terms)
        if hits:
            scored.append((-hits, i, s))
    scored.sort()
    keep = sorted(scored[:limit], key=lambda t: t[1])
    return [s for _, _, s in keep]
