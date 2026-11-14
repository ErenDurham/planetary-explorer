"""Rank suitability results. Owner: Engineer 3.

Order: status ok by score descending (ties broken by site_id for determinism),
then insufficient_data, then ineligible. Only `ok` rows receive a rank.
"""
from __future__ import annotations

from app.models import SuitabilityResult

_ORDER = {"ok": 0, "insufficient_data": 1, "ineligible": 2}


def rank(results: list[SuitabilityResult]) -> list[SuitabilityResult]:
    ordered = sorted(results, key=lambda r: (_ORDER[r.status], -(r.score if r.score is not None else -1.0), r.site_id))
    n = 0
    for r in ordered:
        if r.status == "ok":
            n += 1
            r.rank = n
        else:
            r.rank = None
    return ordered
