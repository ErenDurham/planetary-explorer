"""Curated research behind the landing-priority weights.

`data/evidence/landing_priorities.v1.json` holds a short list of findings from
NASA publications and peer-reviewed landing-site papers. Each finding names
the criteria (and hard constraints) it bears on and the mission types it comes
from. The language model sees this registry and may cite findings by id; it
never supplies a number or a source of its own. Everything shown to the user
(fact, quote, citation, link) is read from here.

Only sources published within the last MAX_SOURCE_AGE_YEARS years are used:
older findings stay in the file but are never offered to the model, cited
or shown. A source without a year is treated as too old.
"""
from __future__ import annotations

import json
from datetime import date
from functools import lru_cache

from app.config.settings import get_settings
from app.models import EvidenceCitation

REGISTRY_FILE = "landing_priorities.v1.json"
MAX_PER_CRITERION = 3
MAX_SOURCE_AGE_YEARS = 15


def cutoff_year() -> int:
    """Oldest publication year still in the window (2011 in 2026)."""
    return date.today().year - MAX_SOURCE_AGE_YEARS


@lru_cache
def registry() -> dict:
    path = get_settings().data_dir / "evidence" / REGISTRY_FILE
    return json.loads(path.read_text(encoding="utf-8"))


def version() -> str:
    return registry()["version"]


def _sources() -> dict[str, dict]:
    return {s["source_id"]: s for s in registry()["sources"]}


def _recent(e: dict) -> bool:
    year = _sources()[e["source_id"]].get("year")
    return isinstance(year, int) and year >= cutoff_year()


def active() -> list[dict]:
    """The findings in use: those whose source is within the age window."""
    return [e for e in registry()["evidence"] if _recent(e)]


def items() -> dict[str, dict]:
    return {e["evidence_id"]: e for e in active()}


def citation(evidence_id: str) -> EvidenceCitation:
    e = items()[evidence_id]
    s = _sources()[e["source_id"]]
    return EvidenceCitation(evidence_id=evidence_id, fact=e["fact"], quotes=list(e["quotes"]), cite=s["cite"], title=s["title"],
                            venue=s["venue"], url=s["url"], source_kind=s["kind"])


def supports(evidence_id: str, criterion_id: str) -> bool:
    e = items().get(evidence_id)
    return bool(e) and criterion_id in e["criteria"]


def for_criterion(criterion_id: str, mission_profile: str, limit: int = 2) -> list[EvidenceCitation]:
    """Findings for a criterion, most relevant to the mission type first:
    exact mission match, then mission-agnostic ('any'), then the rest."""
    ranked = []
    for order, e in enumerate(active()):
        if criterion_id not in e["criteria"]:
            continue
        rank = 0 if mission_profile in e["missions"] else 1 if "any" in e["missions"] else 2
        ranked.append((rank, order, e["evidence_id"]))
    return [citation(eid) for _, _, eid in sorted(ranked)[:limit]]


def for_site(site_id: str) -> list[EvidenceCitation]:
    """Research showing an Earth site has been used to stand in for Mars."""
    return [citation(e["evidence_id"]) for e in active() if site_id in e.get("sites", [])]


def for_constraints() -> dict[str, list[EvidenceCitation]]:
    out: dict[str, list[EvidenceCitation]] = {}
    for e in active():
        for cid in e["constraints"]:
            out.setdefault(cid, []).append(citation(e["evidence_id"]))
    return out


def prompt_block() -> str:
    """The registry as the model sees it: id, what it bears on, the fact and
    the source. Static, so it sits in the cached system prompt."""
    src = _sources()
    rows = []
    for e in active():
        if not (e["criteria"] or e.get("sites")):
            continue
        row = {"id": e["evidence_id"], "criteria": e["criteria"], "missions": e["missions"], "fact": e["fact"],
               "source": f'{src[e["source_id"]]["cite"]} ({src[e["source_id"]]["kind"].replace("_", "-")})'}
        if e.get("sites"):
            row["earth_sites"] = e["sites"]
        rows.append(row)
    return json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
