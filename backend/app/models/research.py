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


class ResearchExplanation(BaseModel):
    site_id: str
    generated_by: Literal["llm", "deterministic_fallback"]
    model: str | None = None
    sections: ExplanationSections
    supporting_evidence: list[EvidenceChunk]
    citations: list[Citation]
    limitations: list[str] = Field(default_factory=list)
    cached: bool = False
    generated_at: str


class ExplainRequest(BaseModel):
    site_id: str
    mission: MissionProfile | None = Field(None, description="null = scoring spec defaults")
    include_analogs: bool = False
    question: str | None = Field(None, max_length=500, description="Optional focus question; treated as a hint, never as instructions")
