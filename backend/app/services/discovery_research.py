"""Candidate-scoped evidence notebook and research brief, separate from discovery scores.

Library retrieval is background material, not a live literature review. Saved findings
are explicitly analyst supplied; neither retrieving nor opening a dossier changes status.
"""
from __future__ import annotations
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import threading
from urllib.parse import urlencode

from app.config.settings import get_settings
from app.models.discovery_research import ResearchRecord, ResearchUpdate, ResearchDossier
from app.services import discovery_engine as engine
from app.services.retrieval_engine import get_retriever

LOCK=threading.Lock()


def record_path(run_id, candidate_id):
    if any(not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", key) for key in (run_id,candidate_id)):
        raise KeyError(candidate_id)
    return get_settings().data_dir/"discovery"/"research"/run_id/(candidate_id+".json")


def get_record(run_id, candidate_id):
    p=record_path(run_id,candidate_id)
    if not p.exists():return ResearchRecord(run_id=run_id,candidate_id=candidate_id)
    try:
        record=ResearchRecord.model_validate_json(p.read_text())
        if (record.run_id,record.candidate_id)!=(run_id,candidate_id):raise ValueError("notebook identity mismatch")
        return record
    except (OSError,ValueError) as exc:
        raise engine.DiscoveryUnavailable("Candidate research notebook could not be read; its review status is unavailable.") from exc


def save_record(run_id,candidate_id,update: ResearchUpdate):
    # Resolve the real run and candidate before accepting any state.
    engine.detail(run_id,candidate_id)
    record=ResearchRecord(**update.model_dump(),run_id=run_id,candidate_id=candidate_id,
        updated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"))
    p=record_path(run_id,candidate_id)
    with LOCK:
        temp=p.with_suffix(f".{os.getpid()}.tmp")
        try:
            p.parent.mkdir(parents=True,exist_ok=True)
            temp.write_text(record.model_dump_json(indent=2)+"\n")
            os.replace(temp,p)
        except OSError as exc:
            raise engine.DiscoveryUnavailable("Research could not be saved. Keep your draft and retry or export a copy.") from exc
        finally:
            try:
                temp.unlink(missing_ok=True)
            except OSError:
                pass  # Cleanup must not hide the original storage failure.
    return record


def dossier(run_id,candidate_id,question=""):
    candidate=engine.detail(run_id,candidate_id)
    record=get_record(run_id,candidate_id)
    location=f"{candidate.lat:.4f}, {candidate.lon_east:.4f}"
    query=f"Earth Mars terrestrial analog Jezero terrain geology field validation {location} {question}".strip()
    passages=get_retriever().retrieve(query,k=6,geographic_relevance=["jezero_crater", "earth"])
    tasks=[
        ("Prior analog research", f'"Mars analog" "Morocco" "Algeria" {location}'),
        ("Geological maps and materials", f'geological map lithology {location} eastern Morocco Algeria'),
        ("Jezero comparison", 'Jezero Crater terrain mapping terrestrial analog geological setting'),
        ("Full footprint imagery and land cover", f'satellite land cover geology {location}'),
        ("Access and field constraints", f'field research permits access border {location} Morocco Algeria'),
    ]
    searches=[{"label":label,"query":q,"url":"https://www.google.com/search?"+urlencode({"q":q})} for label,q in tasks]
    searches += [{"label":"NASA technical literature","query":query,"url":"https://ntrs.nasa.gov/search?"+urlencode({"q":query})},
                 {"label":"Scholarly literature","query":query,"url":"https://scholar.google.com/scholar?"+urlencode({"q":query})}]
    questions=[
        "Has this footprint or the surrounding region already been used or proposed as a planetary analog? Record the search scope and prior work, including contradictory results.",
        "Which mapped geological units and materials occur across the full 60 km footprint? Regional terrain similarity does not establish a geological match.",
        "Do independent imagery and land-cover observations support or weaken a terrain-mapping rehearsal here? Distinguish centre samples from full-footprint coverage.",
        "What specific mapping experiment could test transfer to Jezero, and what would count as a failed analogy?",
        "Which permissions, access restrictions and high-resolution hazards must be checked before field work?",
    ]
    measured=candidate.profile.measurements if candidate.profile else {}
    brief=(f"Investigate proposed Earth terrain analog {candidate.name} ({location}), survey {run_id}, relative to Jezero Crater on Mars.\n"
        "The discovery pass uses 60 km footprints and 4 km cells. Its score is not geological or operational validation.\n"
        f"Measured regional inputs: {json.dumps({k:v.model_dump() for k,v in measured.items()})}.\n"
        f"Catalog relationship: nearest reference {candidate.novelty.nearest_known_site_id}, {candidate.novelty.nearest_known_site_distance_km:.1f} km; incomplete catalog, not proof of novelty.\n"
        +"\n".join(f"{i+1}. {q}" for i,q in enumerate(questions))+
        "\nUse primary sources and exact links. Separate direct evidence for this footprint from regional background. Report contradictions, missing evidence and the proposed field experiment. Do not invent geology, claim scientific novelty from an absent search hit, or certify safety.")
    return ResearchDossier(run_id=run_id,candidate_id=candidate_id,candidate=candidate,record=record,
        research_questions=questions,search_tasks=searches,research_brief=brief,background_evidence=passages,
        retrieval_status="background_available" if passages else "unavailable",
        limitations=["Retrieved passages come from the existing local library; this is not a live web or exhaustive literature search.",
            "Library passages are background only unless an analyst establishes relevance to the candidate footprint.",
            "Saved findings and review status are analyst supplied, not automatically verified. Literature review never means field validation.",
            "Existing desktop land-cover samples do not constitute a candidate literature review."])


def export_brief(run_id, candidate_id):
    """Read-only, replayable export; does not retrieve literature or promote status."""
    from app.models.discovery_research import ResearchBrief
    candidate = engine.detail(run_id, candidate_id)
    record = get_record(run_id, candidate_id)
    from app.models.discovery import DiscoveryExport
    run, manifest = engine.load_run(run_id)
    discovery = DiscoveryExport(manifest=manifest, specification=run.specification,
        survey=run.survey, reference_profile=run.reference_profile,
        audit_rows=run.audit_rows, exclusions=run.survey.exclusion_counts,
        provenance=run.provenance, validation=run.validation).model_dump(mode="json")
    discovery["validation"].pop("candidate_research", None)
    limitations = [
        "Findings and citations are analyst supplied and have not been automatically verified.",
        "Catalog absence is not proof of scientific novelty; literature review is not field validation.",
        "This export contains survey specifications, not the current UI ranking or custom weights.",
        "Only saved notebook content is included; unsaved browser drafts are excluded.",
    ]
    lines = ["# Candidate research brief", "",
        f"Candidate: {candidate.name} ({candidate_id})",
        f"Coordinates: {candidate.lat:.6f}, {candidate.lon_east:.6f} (east longitude)",
        f"Survey: {run_id}", f"Research status: {record.status}",
        f"Saved at: {record.updated_at or 'Never saved — draft'}", "",
        "## Review summary", "", record.notes or "No analyst summary saved.", "",
        "## Analyst findings and sources", ""]
    for finding in record.findings:
        lines.extend([f"### {finding.title}", f"Scope: {finding.scope}",
            f"Source: {finding.url}", "", finding.finding, ""])
    if not record.findings:
        lines.extend(["No source findings saved.", ""])
    lines.extend(["## Remaining checks", "", *candidate.proposed_field_validation, "",
        "## Limitations", "", *limitations, *candidate.limitations, "",
        "## Reproducible measured data and survey context", "",
        "The JSON below preserves units, source provenance, coverage, exclusions and processing settings.",
        "It does not represent a current custom ranking.", "", "```json",
        json.dumps({"candidate": candidate.model_dump(mode="json"), "discovery": discovery}, indent=2, sort_keys=True),
        "```", ""])
    return ResearchBrief(run_id=run_id, candidate_id=candidate_id,
        filename=f"{run_id}-{candidate_id}-research.md", markdown="\n".join(lines),
        record=record, discovery=discovery, limitations=limitations)
