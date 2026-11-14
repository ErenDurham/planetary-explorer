"""Source-level evidence digests and structured research study cards
(work items C and D).

Digests
-------
`build_digests(evidence, site, result, objective, llm_items=None)` groups the
retrieved chunks by source URL and returns one `SourceDigest` per source. The
passages are cleaned first (`text_cleaning.clean_passage`), so navigation
labels, captions and credits never reach a summary. Two producers:

* extractive (always available, labelled `generated_by="extractive"`): the
  one or two cleaned sentences sharing the most content words with the site,
  its tags, the scored factors and the applied objective. If no sentence
  overlaps, the digest says "Insufficient relevant evidence" instead of
  inventing relevance.
* model (`generated_by="llm"`): the explanation engine may hand in model
  digests; `accept_llm_digest()` admits one only if its document_id is a
  retrieved source, every chunk_id it cites belongs to that source, every
  number it states appears in that source's passages, and the wording of
  "what_it_tells_us" shares at least SUPPORT_MIN of its content words with
  the passages. Otherwise the extractive digest is used for that source and a
  limitation says why. The overlap test is lexical: it establishes that the
  words came from the passage, not that the claim is scientifically right.

Study cards
-----------
`build_study_cards(...)` proposes at most three `StudyCard`s. Each card is a
hypothesis to test, built only when the inputs can motivate it: a measured
terrain profile plus a passage about the topographic dataset or landing-site
selection; cited composition/aqueous tags plus a passage that mentions them;
an Earth analog whose SHARED characteristics are the ones the study would use
(a mineralogy-only match does not motivate a terrain traverse). Documented
analog campaigns come from the data files and are labelled as such, never as
proposals. When nothing can be motivated, the list is empty and
`evidence_gap` explains it. Model-proposed cards go through
`accept_llm_card()`: cited handles must exist and the cited passages must
lexically support the card's question, no unknown numbers, kind must be
proposed_study.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from app.models import AnalogMatch, Citation, EnvironmentalProfile, EvidenceChunk, Site, SourceDigest, StudyCard, SuitabilityResult
from app.services.text_cleaning import clean_passage, content_tokens, select_sentences, sentences, support_overlap

log = logging.getLogger(__name__)

SUPPORT_MIN = 0.45           # fraction of a digest's content words that must occur in its passages
CARD_SUPPORT_MIN = 0.30      # fraction of a card's question+why_here words that must occur in cited passages
MAX_CARDS = 3
_NUMBER = re.compile(r"(?<![A-Za-z_\[])-?\d[\d,]*(?:\.\d+)?(?![\]\w])")

# Words too generic to count as evidence that a sentence is ABOUT this site or objective.
GENERIC_SITE_WORDS = {"crater", "craters", "planum", "planitia", "basin", "rim", "region", "margin", "outlet", "boundary", "valley", "valleys", "desert", "area",
                      "field", "summit", "central", "mars", "earth", "site", "sites", "landing", "vallis", "terra", "mons", "impact", "plain", "plains", "lander",
                      "rover", "mission", "station", "memorial", "nasa", "esa", "jpl", "science", "surface", "landing", "selected"}
GENERIC_OBJECTIVE_WORDS = {"near", "site", "sites", "mars", "mission", "find", "place", "area", "good", "best", "with", "without", "reliable", "safe", "safely",
                           "landing", "land", "prioritise", "prioritize", "maximise", "maximize", "ignore", "over", "more", "less", "want", "need"}
TOPIC_WORDS = {
    "terrain": {"mola", "altimeter", "topograph", "elevation", "slope", "slopes", "landing site", "landing-site", "hazard", "hazards", "ellipse", "relief", "roughness"},
    "aqueous": {"delta", "lake", "lacustrine", "fluvial", "river", "clay", "clays", "phyllosilicate", "carbonate", "sulfate", "sulphate", "hematite",
                "aqueous", "water", "ice", "hydrated", "permafrost", "habitab", "organic", "biosignature", "sediment"},
    "analog": {"analog", "analogue", "field", "campaign", "test", "trial", "rover trial", "expedition", "station", "simulation"},
}
PURPOSE_RULES: list[tuple[re.Pattern, str, str]] = [
    (re.compile(r"(?i)pds|megdr|mola|dataset|data record|aareadme|catalog|copernicus|power|registry", re.I), "Dataset documentation",
     "Describes the dataset and its caveats, not this site specifically; it cannot validate a site's score."),
    (re.compile(r"(?i)journal|crossref|doi|agu|aaas|elsevier|wiley|science \(|peer-reviewed", re.I), "Peer-reviewed record",
     "Bibliographic record and abstract only; the full paper was not retrieved, so detailed results are not available here."),
    (re.compile(r"(?i)analog|arads|haughton|mars institute|mdrs|desert research|hmp", re.I), "Analog programme",
     "Documents an Earth field programme; it does not show that results transfer to this Mars site."),
    (re.compile(r"(?i)nomenclature|gazetteer|usgs", re.I), "Nomenclature / geography", "Naming and location reference only."),
    (re.compile(r"(?i)nasa science|mission|rover|lander|perseverance|curiosity|insight|viking|opportunity|spirit|exomars|esa", re.I), "Mission context",
     "Mission overview text documents landing context and history; it does not validate the model's quantitative score."),
]


def _source_key(url: str) -> str:
    return re.sub(r"#.*$", "", url).rstrip("/")


def purpose_for(title: str, institution: str, url: str) -> tuple[str, str]:
    blob = f"{title} {institution} {url}"
    for pat, label, limitation in PURPOSE_RULES:
        if pat.search(blob):
            return label, limitation
    return "Reference page", "General reference; relevance to this site is indirect."


def group_by_source(evidence: list[EvidenceChunk]) -> list[list[EvidenceChunk]]:
    groups: dict[str, list[EvidenceChunk]] = {}
    for e in evidence:
        groups.setdefault(_source_key(e.url), []).append(e)
    return list(groups.values())


def query_terms(site: Site, result: SuitabilityResult | None, objective: str | None) -> set[str]:
    bits = [site.name, site.region, site.description, site.heritage or ""] + [t.replace("_", " ") for t in site.tags]
    if result:
        bits += [f.label for f in result.factor_scores if f.suitability is not None]
    if objective:
        bits.append(objective[:500])
    return content_tokens(" ".join(bits))


def _trim(text: str, max_chars: int = 240) -> str:
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars].rsplit(" ", 1)[0]
    return cut.rstrip(",;:") + "..."


def _site_terms(site: Site) -> set[str]:
    """Distinctive words for this site: its name, region, heritage mission and
    tags, minus words that appear in most site names ("crater", "planitia")."""
    raw = content_tokens(site.name + " " + site.region + " " + (site.heritage or "") + " " + " ".join(t.replace("_", " ") for t in site.tags))
    return {w for w in raw if w not in GENERIC_SITE_WORDS}


def _objective_terms(objective: str | None) -> set[str]:
    return {w for w in content_tokens(objective or "") if w not in GENERIC_OBJECTIVE_WORDS}


def extractive_digest(group: list[EvidenceChunk], site: Site, result: SuitabilityResult | None, objective: str | None, citation_by_chunk: dict[str, str]) -> SourceDigest:
    first = group[0]
    label, limitation = purpose_for(first.title, first.institution, first.url)
    passages = [clean_passage(e.excerpt) for e in group]
    joined = " ".join(p for p in passages if p)
    terms = query_terms(site, result, objective)
    picked = select_sentences(joined, terms, limit=2)
    site_hits = sorted(_site_terms(site) & content_tokens(" ".join(picked))) if picked else []
    obj_hits = sorted(_objective_terms(objective) & content_tokens(" ".join(picked))) if picked and objective else []
    if not picked:
        level = "insufficient"
        what = "Insufficient relevant evidence in the retrieved passages: no sentence addresses this site or the current priorities."
        why = "Retrieved for lexical similarity only; nothing in it can be used to support a claim about this site."
    else:
        level = "supports" if len(site_hits) >= 2 or (site_hits and obj_hits) else "context"
        what = _trim(picked[0], 260)
        if level == "supports":
            why_bits = ["names " + ", ".join(site_hits[:3])]
            if obj_hits:
                why_bits.append("touches the objective (" + ", ".join(obj_hits[:3]) + ")")
            why = "Relevant because it " + " and ".join(why_bits) + "."
        elif obj_hits:
            why = "Background only: it touches the objective (" + ", ".join(obj_hits[:3]) + ") but does not name this site."
        else:
            why = "Provides background for the topic rather than evidence about this site."
    return SourceDigest(document_id=first.document_id, title=first.title, institution=first.institution, url=first.url, publication_date=first.publication_date,
                        purpose_label=label, chunk_ids=[e.chunk_id for e in group], citation_ids=[citation_by_chunk[e.chunk_id] for e in group if e.chunk_id in citation_by_chunk],
                        what_it_tells_us=what, why_it_matters=why, limitation=limitation, support_level=level, generated_by="extractive")


def accept_llm_digest(item: dict[str, Any], groups: list[list[EvidenceChunk]], citation_by_chunk: dict[str, str]) -> tuple[SourceDigest | None, str | None]:
    """Validate one model digest against the retrieved sources. Returns
    (digest, None) or (None, reason)."""
    doc = str(item.get("document_id", ""))
    group = next((g for g in groups if g[0].document_id == doc), None)
    if group is None:
        return None, f"digest for unknown source '{doc}'"
    allowed_ids = {e.chunk_id for e in group}
    cited = [c for c in item.get("chunk_ids") or [] if c in allowed_ids]
    if not cited:
        return None, f"digest for {doc} cites no passage from that source"
    passages = " ".join(clean_passage(e.excerpt) for e in group)
    what = str(item.get("what_it_tells_us", "")).strip()
    why = str(item.get("why_it_matters", "")).strip()
    if not what:
        return None, f"empty digest for {doc}"
    if len((what + " " + why).split()) > 90:
        return None, f"digest for {doc} too long"
    for text in (what, why):
        for tok in _NUMBER.findall(text):
            if tok.replace(",", "") not in passages.replace(",", ""):
                return None, f"digest for {doc} states a number not in its passages ({tok})"
    if support_overlap(what, passages) < SUPPORT_MIN:
        return None, f"digest for {doc} is not worded from its passages"
    level = item.get("support_level") if item.get("support_level") in ("supports", "context", "insufficient") else "context"
    first = group[0]
    label, default_limit = purpose_for(first.title, first.institution, first.url)
    return SourceDigest(document_id=doc, title=first.title, institution=first.institution, url=first.url, publication_date=first.publication_date,
                        purpose_label=str(item.get("purpose_label") or label)[:60], chunk_ids=cited, citation_ids=[citation_by_chunk[c] for c in cited if c in citation_by_chunk],
                        what_it_tells_us=what, why_it_matters=why, limitation=(str(item.get("limitation")).strip() or default_limit) if item.get("limitation") else default_limit,
                        support_level=level, generated_by="llm"), None


def build_digests(evidence: list[EvidenceChunk], site: Site, result: SuitabilityResult | None, objective: str | None, citations: list[Citation],
                  llm_items: list[dict[str, Any]] | None = None) -> tuple[list[SourceDigest], list[str]]:
    groups = group_by_source(evidence)
    by_chunk = {c.chunk_id: c.citation_id for c in citations}
    notes: list[str] = []
    accepted: dict[str, SourceDigest] = {}
    for item in llm_items or []:
        d, why = accept_llm_digest(item, groups, by_chunk)
        if d is not None:
            accepted[d.document_id] = d
        elif why:
            notes.append("Model digest replaced by extractive text: " + why + ".")
    out = [accepted.get(g[0].document_id) or extractive_digest(g, site, result, objective, by_chunk) for g in groups]
    return out, notes


# --------------------------------------------------------------------------
# Study cards
# --------------------------------------------------------------------------
def _chunks_about(evidence: list[EvidenceChunk], words: set[str]) -> list[EvidenceChunk]:
    out = []
    for e in evidence:
        low = clean_passage(e.excerpt).lower()
        if low and any(w in low for w in words):
            out.append(e)
    return out


def _value(profile: EnvironmentalProfile, fid: str):
    m = profile.get(fid)
    return None if (m is None or m.is_missing) else m.value


def build_study_cards(site: Site, profile: EnvironmentalProfile, result: SuitabilityResult | None, evidence: list[EvidenceChunk], analogs: list[AnalogMatch] | None,
                      citations: list[Citation], objective: str | None) -> tuple[list[StudyCard], str | None]:
    by_chunk = {c.chunk_id: c.citation_id for c in citations}
    cards: list[StudyCard] = []

    # 1. Terrain-scale validation: needs measured regional terrain AND a passage about the dataset or site selection.
    slope, rough = _value(profile, "slope_regional_median_deg"), _value(profile, "roughness_regional_m")
    terrain_chunks = _chunks_about(evidence, TOPIC_WORDS["terrain"])
    if slope is not None and rough is not None and terrain_chunks:
        cards.append(StudyCard(
            kind="proposed_study", title=f"Does the regional terrain statistic predict landing-scale hazards at {site.name}?",
            research_question=f"Do the ~3.7 km MOLA slope and relief values that rank {site.name} here (median slope {slope:g} deg, detrended relief {rough:g} m) correspond to metre-scale slopes and rock hazards inside a realistic landing ellipse?",
            method="Sample HiRISE/CTX-derived digital terrain models at 1-5 m baselines over the footprint, count rocks from HiRISE images, and compare the distributions with the regional MOLA statistics used by this tool.",
            why_here=f"{site.name} has a complete regional terrain profile and retrieved documentation of the topographic data and its sampling caveats, so the comparison can be made without new orbital data.",
            motivating_citation_ids=[by_chunk[e.chunk_id] for e in terrain_chunks[:3] if e.chunk_id in by_chunk],
            cannot_infer="Regional statistics cannot resolve lander-scale hazards, and the suitability score is a screening index; neither establishes that a landing would be safe.",
        ))

    # 2. Aqueous / composition study: needs cited composition tags and a passage mentioning them.
    aq_tags = [t for t in site.tags if any(w in t for w in ("delta", "lake", "clay", "carbonate", "sulfate", "hematite", "phyllosilicate", "hydrated", "periglacial", "polygonal", "outflow", "fluvial", "silica"))]
    aq_chunks = _chunks_about(evidence, {t.replace("_", " ") for t in aq_tags} | ({"delta", "lake", "clay", "carbonate", "sulfate", "hematite", "ice", "water"} if aq_tags else set()))
    if aq_tags and aq_chunks:
        tag_words = ", ".join(t.replace("_", " ") for t in aq_tags[:4])
        cards.append(StudyCard(
            kind="proposed_study", title=f"Record of past water at {site.name}: {tag_words}",
            research_question=f"What depositional or alteration history produced the {tag_words} reported for {site.name}, and how well are those materials preserved for in-situ or returned-sample analysis?",
            method="Targeted orbital spectroscopy (CRISM) over the footprint to map the cited units, then in-situ or returned-sample mineralogy and organic chemistry on the mapped outcrops.",
            why_here=f"The cited literature for {site.name} documents these materials, and the retrieved passages describe their setting, so the hypotheses are specific rather than generic.",
            motivating_citation_ids=[by_chunk[e.chunk_id] for e in aq_chunks[:3] if e.chunk_id in by_chunk],
            cannot_infer="Composition tags are literature-derived labels, not spectral measurements made by this tool, and they have no bearing on the landing suitability score.",
        ))

    # 3. Analog transfer: only an analog whose SHARED characteristics are terrain (the thing a field trial would use).
    if analogs:
        for a in analogs:
            shared_terrain = [s for s in a.shared_characteristics if s.lower().startswith("terrain morphology") or "slope" in s.lower() or "relief" in s.lower()]
            if not shared_terrain:
                continue
            analog_chunks = _chunks_about(evidence, {a.earth_candidate.name.split(" - ")[0].lower().split(" (")[0]} | {w.lower() for w in a.earth_candidate.region.split()[:1]})
            cards.append(StudyCard(
                kind="proposed_study", title=f"Field rehearsal at {a.earth_candidate.name} on terrain it shares with {site.name}",
                research_question=f"Do traverse-planning and terrain-mapping methods exercised at {a.earth_candidate.name} transfer to the {site.name} landforms they share?",
                method="Run instrumented traverses and terrain mapping on the matched landforms at the Earth site, measure where predicted and observed trafficability diverge, then test the method on orbital data for the Mars footprint.",
                why_here="Shared at the harmonised ~3.7 km baseline: " + "; ".join(shared_terrain[:2]) + ".",
                motivating_citation_ids=[by_chunk[e.chunk_id] for e in analog_chunks[:2] if e.chunk_id in by_chunk],
                cannot_infer=f"The similarity index ({a.similarity}) is a heuristic; Earth gravity, atmosphere and radiation differ, and no transfer has been demonstrated.",
                analog_candidate_id=a.earth_candidate.id,
            ))
            break

    cards = cards[:MAX_CARDS]
    gap = None
    if not cards:
        gap = ("No study can be motivated from the retrieved passages and measurements: no passage addresses this site's terrain data or cited materials, "
               "and no Earth analog shares terrain characteristics with it. The gap is in the corpus, not in the site.")
    return cards, gap


def accept_llm_card(item: dict[str, Any], evidence: list[EvidenceChunk], citations: list[Citation], allowed_numbers_blob: str) -> tuple[StudyCard | None, str | None]:
    handles = {c.citation_id: c for c in citations}
    chunk_by_id = {e.chunk_id: e for e in evidence}
    if item.get("kind", "proposed_study") != "proposed_study":
        return None, "model may only propose studies; documented campaigns come from the data files"
    cited = [h for h in item.get("motivating_citation_ids") or [] if h in handles]
    if not cited:
        return None, "card cites no retrieved passage"
    text = " ".join(str(item.get(k, "")) for k in ("title", "research_question", "method", "why_here", "cannot_infer"))
    for tok in _NUMBER.findall(text):
        if tok.replace(",", "") not in allowed_numbers_blob:
            return None, f"card states a number not in the inputs ({tok})"
    passages = " ".join(clean_passage(chunk_by_id[handles[h].chunk_id].excerpt) for h in cited if handles[h].chunk_id in chunk_by_id)
    if support_overlap(str(item.get("research_question", "")) + " " + str(item.get("why_here", "")), passages) < CARD_SUPPORT_MIN:
        return None, "cited passages do not lexically support the card's question"
    try:
        return StudyCard(kind="proposed_study", title=str(item.get("title", ""))[:160], research_question=str(item.get("research_question", "")),
                         method=str(item.get("method", "")), why_here=str(item.get("why_here", "")), motivating_citation_ids=cited,
                         cannot_infer=str(item.get("cannot_infer") or "Not established by this study design."), analog_candidate_id=item.get("analog_candidate_id")), None
    except Exception as e:  # noqa: BLE001
        return None, f"card failed validation ({type(e).__name__})"
