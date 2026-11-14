"""Structured, citation-backed explanations. Owner: Engineer 4.

BASELINE IMPLEMENTATION (Phase 1): the deterministic fallback only. It
assembles the explanation from the numeric SuitabilityResult, the profile and
the retrieved evidence, so the app is fully usable with no LLM configured.
Engineer 4 adds the LLM path (Pydantic-validated structured output, citation
validation against retrieved chunk ids, caching) and keeps this as the
fallback when the LLM is unconfigured, fails or returns invalid citations.

Hard rules (docs/SCIENTIFIC_METHOD.md section 7.4): the LLM never produces a
number, never changes a score, and may only cite chunk_ids it was given.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.models import AnalogMatch, Citation, EnvironmentalProfile, EvidenceChunk, ExplanationSections, ResearchExplanation, Site, SuitabilityResult


def build_query(site: Site, profile: EnvironmentalProfile, result: SuitabilityResult | None, question: str | None) -> str:
    parts = [site.name, site.region, site.description]
    if site.heritage:
        parts.append(site.heritage)
    parts += [t.replace("_", " ") for t in site.tags]
    if result:
        parts += [f.label for f in result.factor_scores if f.suitability is not None]
    if question:
        parts.append(question[:300])
    return " ".join(parts)


def citations_for(evidence: list[EvidenceChunk]) -> list[Citation]:
    return [Citation(citation_id=f"[C{i}]", chunk_id=e.chunk_id, document_id=e.document_id, title=e.title, institution=e.institution, url=e.url) for i, e in enumerate(evidence, 1)]


def validate_citation_ids(text_citation_ids: list[str], allowed: list[Citation]) -> list[str]:
    """Keep only citation handles that correspond to retrieved evidence."""
    ok = {c.citation_id for c in allowed}
    return [c for c in text_citation_ids if c in ok]


def deterministic(site: Site, profile: EnvironmentalProfile, result: SuitabilityResult | None, evidence: list[EvidenceChunk], analogs: list[AnalogMatch] | None) -> ResearchExplanation:
    cits = citations_for(evidence)
    by_doc = {c.document_id: c.citation_id for c in cits}
    def cite(e: EvidenceChunk) -> str:
        return by_doc.get(e.document_id, "")

    sec = ExplanationSections()
    if result:
        for f in sorted((f for f in result.factor_scores if f.suitability is not None), key=lambda f: -(f.weighted_contribution or 0)):
            line = f"{f.label}: {f.feature_value:g} {f.unit or ''} -> suitability {f.suitability:.2f}, contributing {f.weighted_contribution or 0:.1f} of {result.score or 0:.1f} points."
            (sec.favorable if f.suitability >= 0.6 else sec.unfavorable).append(line)
            sec.influential_factors.append(f"{f.label} (normalised weight {f.normalized_weight or 0:.2f})")
        sec.risks += result.risks or ["No scored criterion fell below the 0.4 suitability level at the regional scale."]
        if not result.eligibility.eligible:
            sec.risks += [f"Fails hard constraint {c.constraint_id}: {c.feature_value:g} {c.operator} {c.threshold} is false. {c.rationale}" for c in result.eligibility.failed_constraints]
        sec.missing_evidence += [f"Criterion excluded: {c}" for c in result.completeness.excluded_criteria]
    sec.missing_evidence += [f"No measurement for {fid} in profile {profile.profile_version}." for fid in profile.completeness.missing_feature_ids]
    for e in evidence[:4]:
        sec.research_applications.append(f"{e.title} ({e.institution}) {cite(e)}: {e.excerpt[:220].strip()}...")
    if analogs:
        for a in analogs[:2]:
            sec.research_applications.append(f"Closest Earth analog: {a.earth_candidate.name}, similarity {a.similarity} (" + "; ".join(a.shared_characteristics[:2]) + ").")
    sec.future_investigation += [
        "Sample HiRISE/CTX-derived DTMs over the landing ellipse to replace regional MOLA slopes with metre-scale hazard maps.",
        "Integrate THEMIS/TES thermal inertia and rock abundance so the thermal and hazard criteria can be scored.",
    ]
    if not evidence:
        sec.missing_evidence.append("No scientific documents were retrieved (index empty or unavailable); explanation is built from measurements and scoring only.")
    return ResearchExplanation(site_id=site.id, generated_by="deterministic_fallback", model=None, sections=sec, supporting_evidence=evidence, citations=cits,
                               limitations=["Deterministic template assembled from measurements, scoring results and retrieved excerpts; no language model was used.",
                                            "Citations point at retrieved passages only; read the source before relying on a claim."],
                               cached=False, generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"))


def explain(site: Site, profile: EnvironmentalProfile, result: SuitabilityResult | None, evidence: list[EvidenceChunk], analogs: list[AnalogMatch] | None, question: str | None) -> ResearchExplanation:
    """Entry point used by the API. Phase 1: deterministic only. Engineer 4
    adds: if settings.anthropic_api_key -> try LLM with structured output,
    validate citations, fall back to deterministic on any failure."""
    return deterministic(site, profile, result, evidence, analogs)
