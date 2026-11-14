"""Earth-Mars environmental analog matching. Owner: Engineer 3.

    d_i = |x_Mars,i - x_Earth,i| / scale_i          (numeric, harmonised units)
    d_i = 1 - |A and B| / |A or B|                   (categorical tag sets, Jaccard)
    D   = sum(w_i d_i) / sum(w_i)                    over comparable features
    Similarity = 100 / (1 + D)

Independent of the suitability engine by design. Features missing on either
side are reported as non-comparable and never imputed.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from app.models import AnalogMatch, AnalogWeight, EarthCandidate, EnvironmentalProfile, FeatureDistance, Site

SPEC_PATH = Path(__file__).resolve().parents[1] / "config" / "analog_spec.json"


@lru_cache
def load_spec() -> dict:
    return json.loads(SPEC_PATH.read_text())


def jaccard_distance(a: list[str], b: list[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa and not sb:
        return 0.0
    return 1.0 - len(sa & sb) / len(sa | sb)


def _value(profile: EnvironmentalProfile | None, fid: str):
    if profile is None:
        return None, None
    m = profile.get(fid)
    if m is None or m.is_missing:
        return None, (m.unit if m else None)
    return m.value, m.unit


def feature_distance(fs: dict, mars_p: EnvironmentalProfile, earth_p: EnvironmentalProfile | None, weight: float) -> FeatureDistance:
    fid = fs["feature_id"]
    mv, unit = _value(mars_p, fid)
    ev, _ = _value(earth_p, fid)
    base = dict(feature_id=fid, label=fs["label"], mars_value=mv, earth_value=ev, unit=unit or fs.get("unit"), scale=fs.get("scale"), raw_weight=weight, normalized_weight=None, contribution=None, method=fs["method"])
    if mv is None or ev is None:
        return FeatureDistance(comparable=False, distance=None, note="missing on one side; not imputed", **base)
    if fs["method"] == "scaled_absolute_difference":
        if not isinstance(mv, (int, float)) or not isinstance(ev, (int, float)):
            return FeatureDistance(comparable=False, distance=None, note="non-numeric value", **base)
        return FeatureDistance(comparable=True, distance=abs(float(mv) - float(ev)) / float(fs["scale"]), note=None, **base)
    if fs["method"] == "jaccard_distance":
        if not isinstance(mv, list) or not isinstance(ev, list):
            return FeatureDistance(comparable=False, distance=None, note="expected tag lists", **base)
        return FeatureDistance(comparable=True, distance=jaccard_distance(mv, ev), note=f"shared: {sorted(set(mv) & set(ev)) or 'none'}", **base)
    return FeatureDistance(comparable=False, distance=None, note=f"unknown method {fs['method']}", **base)


def _applications(cand: EarthCandidate, shared_terrain: list[str], shared_minerals: list[str]) -> list[str]:
    apps = list(cand.known_analog_use)
    if shared_terrain:
        apps.append("Terrain-mobility and landing-approach rehearsals on " + ", ".join(t.replace("_", " ") for t in shared_terrain))
    if shared_minerals:
        apps.append("Instrument calibration and sample-handling tests against " + ", ".join(m.replace("_", " ") for m in shared_minerals))
    return apps


def match(mars_site: Site, mars_p: EnvironmentalProfile, cand: EarthCandidate, earth_p: EnvironmentalProfile | None, weights: dict[str, float]) -> AnalogMatch:
    spec = load_spec()
    fds = [feature_distance(fs, mars_p, earth_p, weights.get(fs["feature_id"], fs["default_weight"])) for fs in spec["features"]]
    comparable = [f for f in fds if f.comparable and f.raw_weight > 0]
    wsum = sum(f.raw_weight for f in comparable)
    D = None
    if comparable and wsum > 0:
        for f in comparable:
            f.normalized_weight = f.raw_weight / wsum
            f.contribution = f.normalized_weight * (f.distance or 0.0)
        D = sum(f.contribution for f in comparable)
    sim = None if D is None else 100.0 / (1.0 + D)
    weighted = [f for f in fds if f.raw_weight > 0]
    completeness = (len(comparable) / len(weighted)) if weighted else 0.0

    mt, _ = _value(mars_p, "terrain_morphology"); et, _ = _value(earth_p, "terrain_morphology")
    mm, _ = _value(mars_p, "mineralogy_tags"); em, _ = _value(earth_p, "mineralogy_tags")
    shared_t = sorted(set(mt or []) & set(et or [])); shared_m = sorted(set(mm or []) & set(em or []))
    shared = [f"Terrain: {', '.join(shared_t)}" for _ in [0] if shared_t] + [f"Composition: {', '.join(shared_m)}" for _ in [0] if shared_m]
    for f in comparable:
        if f.method == "scaled_absolute_difference" and f.distance is not None and f.distance <= 0.5:
            shared.append(f"{f.label}: Mars {f.mars_value:g} vs Earth {f.earth_value:g} {f.unit or ''} (close at the harmonised scale)")
    diffs = [f"{f.label}: Mars {f.mars_value:g} vs Earth {f.earth_value:g} {f.unit or ''}" for f in comparable if f.method == "scaled_absolute_difference" and f.distance is not None and f.distance > 1.0]
    noncomp = [f"{f.label}: {f.note}" for f in fds if not f.comparable] + list(spec["noncomparable_disclosures"])
    limitations = [
        "Similarity is a heuristic index (100 / (1 + D)) over the configured features, not a validated probability.",
        "Terrain statistics are compared at a harmonised ~3.7 km baseline; metre-scale morphology is not assessed.",
        "Composition and morphology tags are literature-derived categorical labels, not spectral measurements.",
    ]
    if earth_p is None:
        limitations.append("Earth candidate has no processed profile; only categorical tags were compared.")
    citations = sorted(set(cand.sources) | set(mars_p.sources.keys()) | (set(earth_p.sources.keys()) if earth_p else set()))
    return AnalogMatch(mars_site_id=mars_site.id, earth_candidate=cand, similarity=None if sim is None else round(sim, 2), distance=None if D is None else round(D, 4), rank=None,
                       feature_distances=fds, shared_characteristics=shared, important_differences=diffs, noncomparable_variables=noncomp,
                       research_applications=_applications(cand, shared_t, shared_m), limitations=limitations, citations=citations, completeness_fraction=round(completeness, 3))


def match_all(mars_site: Site, mars_p: EnvironmentalProfile, candidates: list[tuple[EarthCandidate, EnvironmentalProfile | None]], weights: list[AnalogWeight] | None, top_k: int) -> tuple[list[AnalogMatch], list[str]]:
    spec = load_spec()
    w = {fs["feature_id"]: fs["default_weight"] for fs in spec["features"]}
    warnings: list[str] = []
    if weights:
        for aw in weights:
            if aw.feature_id in w:
                w[aw.feature_id] = aw.weight
            else:
                warnings.append(f"ignored unknown analog weight '{aw.feature_id}'")
    if sum(w.values()) <= 0:
        warnings.append("all analog weights are zero; similarity cannot be computed")
    matches = [match(mars_site, mars_p, c, p, w) for c, p in candidates]
    matches.sort(key=lambda m: (-(m.similarity if m.similarity is not None else -1.0), m.earth_candidate.id))
    for i, m in enumerate(matches, 1):
        m.rank = i if m.similarity is not None else None
    return matches[:top_k], warnings
