"""Analyst-led research is separate from numerical screening and desktop checks."""
from typing import Literal
from urllib.parse import urlparse
from pydantic import Field, field_validator, model_validator
from app.models.discovery import Record, DiscoveryCandidateDetail
from app.models.research import EvidenceChunk

ResearchStatus = Literal["unresearched", "in_progress", "literature_reviewed"]

class ResearchFinding(Record):
    title: str = Field(min_length=3, max_length=250)
    url: str = Field(max_length=2048)
    finding: str = Field(min_length=20, max_length=4000)
    scope: Literal["candidate_specific", "regional_background", "contradictory"]

    @field_validator("title", "finding", mode="before")
    @classmethod
    def substantive_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("url")
    @classmethod
    def safe_url(cls, value):
        p=urlparse(value)
        if p.scheme!="https" or not p.hostname or p.username or p.password:
            raise ValueError("Use a public HTTPS source URL without embedded credentials")
        return value

class ResearchUpdate(Record):
    status: ResearchStatus = "unresearched"
    notes: str = Field("", max_length=12000)
    findings: list[ResearchFinding] = Field(default_factory=list,max_length=20)

    @model_validator(mode="after")
    def reviewed_needs_evidence(self):
        if self.status=="literature_reviewed" and (len(self.notes.strip())<40 or not any(f.scope!="regional_background" for f in self.findings)):
            raise ValueError("Literature reviewed requires a review summary of at least 40 characters and a candidate-specific or contradictory source finding")
        return self

class ResearchRecord(ResearchUpdate):
    run_id: str
    candidate_id: str
    updated_at: str | None = None

class ResearchSearchTask(Record):
    label: str
    query: str
    url: str

class ResearchDossier(Record):
    run_id: str
    candidate_id: str
    candidate: DiscoveryCandidateDetail
    record: ResearchRecord
    research_questions: list[str]
    search_tasks: list[ResearchSearchTask]
    research_brief: str
    background_evidence: list[EvidenceChunk]
    retrieval_status: Literal["background_available", "unavailable"]
    limitations: list[str]
