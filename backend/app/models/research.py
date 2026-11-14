"""Scientific RAG explanations."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .mission import MissionProfile


class EvidenceChunk(BaseModel):
    chunk_id: str
    document_id: str
    title: str
    institution: str
    url: str
    publication_date: str | None = None
    geographic_relevance: list[str] = Field(default_factory=list, description="site ids / regions this chunk is about")
    excerpt: str
    score: float | None = Field(None, description="retrieval score; higher is more relevant")


class Citation(BaseModel):
    citation_id: str = Field(..., description='Short handle used inline, e.g. "[C1]"')
    chunk_id: str
    document_id: str
    title: str
    institution: str
    url: str


class ExplanationSections(BaseModel):
    favorable: list[str] = Field(default_factory=list)
    unfavorable: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    influential_factors: list[str] = Field(default_factory=list)
    research_applications: list[str] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)
    future_investigation: list[str] = Field(default_factory=list)


SupportLevel = Literal["supports", "context", "insufficient"]


class SourceDigest(BaseModel):
    """One retrieved SOURCE (URL), summarised from its retrieved passages only.
    `chunk_ids`/`citation_ids` are the exact passages the digest was written
    from; grouping by source never remaps a claim to a different passage."""

    document_id: str
    title: str
    institution: str
    url: str
    publication_date: str | None = None
    purpose_label: str = Field(..., description="e.g. 'Mission context', 'Dataset documentation', 'Peer-reviewed record', 'Analog programme'")
    chunk_ids: list[str]
    citation_ids: list[str]
    what_it_tells_us: str
    why_it_matters: str
    limitation: str | None = None
    support_level: SupportLevel
    generated_by: Literal["llm", "extractive"]


StudyKind = Literal["proposed_study", "documented_campaign"]


class StudyCard(BaseModel):
    """A research application. A proposed study is a hypothesis to test, never
    something this tool or anyone has shown; a documented campaign is a
    historical analog programme recorded in the data files."""

    kind: StudyKind
    title: str
    research_question: str
    method: str = Field(..., description="Proposed measurements or procedure")
    why_here: str = Field(..., description="Why this site (or this Earth analog) helps answer the question")
    motivating_citation_ids: list[str] = Field(default_factory=list, description="Exact [C#] handles whose passages motivate the card")
    cannot_infer: str = Field(..., description="What the study, the data or the analog similarity cannot establish")
    analog_candidate_id: str | None = None


class ResearchExplanation(BaseModel):
    site_id: str
    generated_by: Literal["llm", "deterministic_fallback"]
    model: str | None = None
    sections: ExplanationSections
    supporting_evidence: list[EvidenceChunk]
    citations: list[Citation]
    source_digests: list[SourceDigest] = Field(default_factory=list, description="One per unique source URL, in evidence order")
    research_studies: list[StudyCard] = Field(default_factory=list, description="At most three structured study cards")
    evidence_gap: str | None = Field(None, description="Set when the corpus cannot support a useful proposal")
    limitations: list[str] = Field(default_factory=list)
    cached: bool = False
    generated_at: str


class ExplainRequest(BaseModel):
    site_id: str
    mission: MissionProfile | None = Field(None, description="null = scoring spec defaults")
    include_analogs: bool = False
    question: str | None = Field(None, max_length=500, description="Optional focus question; treated as a hint, never as instructions")
    objective: str | None = Field(None, max_length=500, description="The applied mission objective, so digests can say why a source matters to it; untrusted text")
