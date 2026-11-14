"""Weight-sensitivity sweep (rank stability) for one focus site.

Pure functions over the scoring and ranking engines; no I/O, no randomness,
no language model. For each ACTIVE criterion c (weight > 0 and a value on
every evaluated site, i.e. exactly the set scoring_engine.valid_criteria keeps)
the sweep moves c's effective share s_c by d percentage points, one at a time:

    s_c' = clamp(s_c + d/100, 0, 1)
    s_i' = s_i * (1 - s_c') / (1 - s_c)        for every other active i

so the other active priorities keep their mutual ratios and the remaining
share is redistributed among them. Raw weights sent to the engine are
100 * s' for active criteria; inactive criteria keep the raw weight the
applied mission gave them (they carry no influence either way). Every point
is then scored with scoring_engine.evaluate and ordered with
ranking_engine.rank - the same code path, spec, constraints and
missing-data policy as POST /scoring/evaluate. No criterion is added, nothing
is imputed, no threshold moves.

A share driven to 0 drops the criterion (the engine renormalises over the
rest); a share driven to 1 leaves one criterion, which the engine reports as
insufficient_data. Both are honest scenarios and are reported as such.
"""
from __future__ import annotations

import math

from app.models import (
    EnvironmentalProfile,
    ExcludedCriterion,
    MissionProfile,
    ScenarioSiteOutcome,
    SensitivityBreakpoint,
    SensitivityPoint,
    SensitivityResponse,
    SensitivitySweep,
    Site,
    SuitabilityResult,
)
from app.services import ranking_engine, scoring_engine

ASSUMPTION = ("One priority is moved at a time. The other active priorities keep their mutual ratios and share the "
              "remainder, so every scenario's active weights still sum to 100. Inactive priorities (weight 0 or no data) "
              "are unchanged. Each scenario is re-scored by the same engine, spec, hard constraints, candidate set and "
              "missing-data policy as the applied ranking.")


def base_shares(mission: MissionProfile, kept: list[str]) -> dict[str, float]:
    """Effective normalised weights of the active criteria under the applied mission."""
    w = {c.criterion_id: float(c.weight) for c in mission.criteria if c.criterion_id in kept}
    total = sum(w.values())
    if total <= 0:
        return {}
    return {cid: v / total for cid, v in w.items()}


def scenario_weights(mission: MissionProfile, kept: list[str], criterion_id: str, delta_pp: float) -> tuple[dict[str, float], float]:
    """Raw weights for the scenario where `criterion_id`'s effective share moves by
    `delta_pp` percentage points, the other active shares scaled to keep their
    ratios. Returns (weights, target share). Requires >= 2 active criteria."""
    shares = base_shares(mission, kept)
    if criterion_id not in shares or len(shares) < 2:
        raise ValueError("sweep needs at least two active criteria including the swept one")
    s = shares[criterion_id]
    target = min(1.0, max(0.0, s + delta_pp / 100.0))
    rest = 1.0 - s
    weights = {c.criterion_id: float(c.weight) for c in mission.criteria}
    for cid, si in shares.items():
        if cid == criterion_id:
            weights[cid] = 100.0 * target
        else:
            weights[cid] = 100.0 * (si * (1.0 - target) / rest if rest > 0 else 0.0)
    return weights, target


def _with_weights(mission: MissionProfile, weights: dict[str, float]) -> MissionProfile:
    return MissionProfile(mission_phase=mission.mission_phase,
                          criteria=[{"criterion_id": c.criterion_id, "weight": weights.get(c.criterion_id, c.weight)} for c in mission.criteria],
                          hard_constraints=mission.hard_constraints, missing_data_policy=mission.missing_data_policy)


def _evaluate(sites: list[Site], profiles: dict[str, EnvironmentalProfile], mission: MissionProfile) -> tuple[list[SuitabilityResult], list[str]]:
    results, warnings = scoring_engine.evaluate(sites, profiles, mission)
    return ranking_engine.rank(results), warnings


def point(sites: list[Site], profiles: dict[str, EnvironmentalProfile], mission: MissionProfile, weights: dict[str, float],
          focus_site_id: str, delta_pp: float, swept: str | None) -> SensitivityPoint:
    ranked, _ = _evaluate(sites, profiles, _with_weights(mission, weights))
    focus = next((r for r in ranked if r.site_id == focus_site_id), None)
    ok = [r for r in ranked if r.status == "ok"]
    leader = ok[0] if ok else None
    runner = ok[1] if len(ok) > 1 else None
    share = None
    active = 0
    if focus is not None:
        active = focus.completeness.criteria_supported
        if swept is not None:
            f = next((x for x in focus.factor_scores if x.criterion_id == swept), None)
            share = f.normalized_weight if f is not None else None
    elif ranked:
        active = ranked[0].completeness.criteria_supported
    gap = None  # only a ranked (status ok) focus site gets a gap; an ineligible score is not comparable
    if focus is not None and focus.status == "ok" and focus.score is not None and leader is not None and leader.score is not None:
        other = runner if leader.site_id == focus.site_id else leader
        gap = None if other is None or other.score is None else _raw_score(focus) - _raw_score(other)
    return SensitivityPoint(delta_pp=delta_pp, share=share, weights=weights, active_count=active,
                            focus_status=focus.status if focus else None, focus_score=focus.score if focus else None, focus_rank=focus.rank if focus else None,
                            leader_site_id=leader.site_id if leader else None, leader_site_name=leader.site_name if leader else None, leader_score=leader.score if leader else None,
                            runner_up_site_id=runner.site_id if runner else None, runner_up_site_name=runner.site_name if runner else None, runner_up_score=runner.score if runner else None,
                            gap_to_alternative=gap,
                            ranking=[ScenarioSiteOutcome(site_id=r.site_id, site_name=r.site_name, status=r.status, score=r.score, rank=r.rank) for r in ranked])


def _raw_score(r: SuitabilityResult) -> float:
    """Full-precision score from the contributions (the reported score is rounded to 0.01)."""
    return sum(f.weighted_contribution for f in r.factor_scores if f.weighted_contribution is not None)


def deltas(range_pp: float, step_pp: float) -> list[float]:
    n = int(math.floor(range_pp / step_pp))
    return sorted({round(-range_pp, 6), 0.0, round(range_pp, 6), *(round(k * step_pp, 6) for k in range(-n, n + 1))})


def _describe(p: SensitivityPoint, kind: str) -> str:
    if kind == "leader":
        return f"{p.leader_site_name} leads" if p.leader_site_name else "no ranked leader"
    if p.focus_rank is not None:
        return f"rank {p.focus_rank}"
    return p.focus_status.replace("_", " ") if p.focus_status else "not in candidate set"


def breakpoints(points: list[SensitivityPoint]) -> list[SensitivityBreakpoint]:
    out: list[SensitivityBreakpoint] = []
    for a, b in zip(points, points[1:]):
        if a.leader_site_id != b.leader_site_id:
            out.append(SensitivityBreakpoint(kind="leader", from_delta_pp=a.delta_pp, to_delta_pp=b.delta_pp, before=_describe(a, "leader"), after=_describe(b, "leader")))
        if (a.focus_rank, a.focus_status) != (b.focus_rank, b.focus_status):
            out.append(SensitivityBreakpoint(kind="focus_rank", from_delta_pp=a.delta_pp, to_delta_pp=b.delta_pp, before=_describe(a, "focus"), after=_describe(b, "focus")))
    return out


def _note(label: str, points: list[SensitivityPoint], rank_stable: bool, leader_stable: bool, range_pp: float) -> str:
    ranks = [p.focus_rank for p in points if p.focus_rank is not None]
    if not ranks:
        return f"The selected site is not ranked at any point of the tested range (+/-{range_pp:g} pp on {label})."
    if rank_stable and leader_stable:
        return f"Rank {ranks[0]} at every point within the tested range (+/-{range_pp:g} pp on {label}); the leader does not change."
    parts = []
    if rank_stable:
        parts.append(f"The selected site keeps rank {ranks[0]} within the tested range")
    else:
        parts.append(f"The selected site's rank moves between {min(ranks)} and {max(ranks)} within the tested range")
    if leader_stable:
        parts.append("the leader does not change")
    else:
        leaders = []
        for p in points:
            if p.leader_site_name and (not leaders or leaders[-1] != p.leader_site_name):
                leaders.append(p.leader_site_name)
        parts.append("the leader changes: " + " -> ".join(leaders))
    return "; ".join(parts) + f" (+/-{range_pp:g} pp on {label})."


def sweep(sites: list[Site], profiles: dict[str, EnvironmentalProfile], mission: MissionProfile, focus_site_id: str,
          range_pp: float = 5.0, step_pp: float = 1.0, profile_version: str = "", client_request_id: str | None = None) -> SensitivityResponse:
    spec = scoring_engine.load_spec()
    labels = {c["criterion_id"]: c["label"] for c in spec["criteria"]}
    evaluated = {s.id: profiles[s.id] for s in sites if profiles.get(s.id) is not None}
    kept, dropped = scoring_engine.valid_criteria(mission, evaluated)
    shares = base_shares(mission, kept)
    base_weights = {c.criterion_id: float(c.weight) for c in mission.criteria}
    base = point(sites, profiles, mission, base_weights, focus_site_id, 0.0, None)
    warnings = [f"criterion '{k}' excluded: {v}" for k, v in dropped.items()]
    focus_name = next((s.name for s in sites if s.id == focus_site_id), None)
    too_few = len(kept) < 2
    sweeps: list[SensitivitySweep] = []
    if too_few:
        warnings.append("fewer than two criteria are active, so no one-at-a-time sweep is possible")
    else:
        for cid in kept:
            pts: list[SensitivityPoint] = []
            for d in deltas(range_pp, step_pp):
                w, _ = scenario_weights(mission, kept, cid, d)
                pts.append(point(sites, profiles, mission, w, focus_site_id, d, cid))
            ranks = [p.focus_rank for p in pts if p.focus_rank is not None]
            rank_stable = len({(p.focus_rank, p.focus_status) for p in pts}) == 1
            leader_stable = len({p.leader_site_id for p in pts}) == 1
            sweeps.append(SensitivitySweep(criterion_id=cid, label=labels.get(cid, cid), base_share=shares[cid], points=pts, breakpoints=breakpoints(pts),
                                           focus_rank_min=min(ranks) if ranks else None, focus_rank_max=max(ranks) if ranks else None,
                                           focus_rank_stable=rank_stable, leader_stable=leader_stable,
                                           note=_note(labels.get(cid, cid), pts, rank_stable, leader_stable, range_pp)))
    return SensitivityResponse(focus_site_id=focus_site_id, focus_site_name=focus_name, active_criteria=kept,
                               inactive=[ExcludedCriterion(criterion_id=k, label=labels.get(k, k), reason=v) for k, v in dropped.items()],
                               base_shares=shares, base=base, sweeps=sweeps, range_pp=range_pp, step_pp=step_pp, assumption=ASSUMPTION,
                               too_few_active=too_few, scoring_spec_version=spec["version"], profile_version=profile_version, mission=mission,
                               warnings=warnings, client_request_id=client_request_id)
