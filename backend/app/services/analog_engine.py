"""Earth-Mars environmental analog matching. Owner: Engineer 3.

    d_i = |x_Mars,i - x_Earth,i| / scale_i          (numeric, harmonised units)
    d_i = 1 - |A and B| / |A or B|                   (categorical tag sets, Jaccard)
    D   = sum(w_i d_i) / sum(w_i)                    over comparable features
    Similarity = 100 / (1 + D)

Independent of the suitability engine by design. Features missing on either
side are reported as non-comparable and never imputed; so are values that are
not finite numbers (NaN/inf cannot be scored or serialised) and numeric
features whose spec scale is not a positive number.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

from app.models import AnalogMatch, AnalogWeight, EarthCandidate, EnvironmentalProfile, FeatureDistance, Site

SPEC_PATH = Path(__file__).resolve().parents[1] / "config" / "analog_spec.json"

# Wording thresholds for shared_characteristics / important_differences, in
# units of the feature's own comparison scale. They never touch D.
CLOSE_D = 0.5
DIFFERENT_D = 1.0


@lru_cache
def load_spec() -> dict:
    return json.loads(SPEC_PATH.read_text())


def jaccard_distance(a: list[str], b: list[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa and not sb:
        return 0.0
    return 1.0 - len(sa & sb) / len(sa | sb)


def _is_finite_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _value(profile: EnvironmentalProfile | None, fid: str):
    if profile is None:
        return None, None
    m = profile.get(fid)
    if m is None or m.is_missing:
        return None, (m.unit if m else None)
    return m.value, m.unit


def _echo(v):
    """A value safe to put in a response: NaN/inf become None."""
    if isinstance(v, (int, float)) and not isinstance(v, bool) and not math.isfinite(v):
        return None
    return v


def _tags(v) -> list[str] | None:
    """A tag list, or None when the value is not a list of strings (a prose
    sentence must not be split into characters)."""
    if isinstance(v, list) and all(isinstance(t, str) for t in v):
        return v
    return None


def _fmt(x, unit: str | None) -> str:
    u = (unit or "").strip()
    if u == "m":
        s = f"{x:,.0f}"
    elif u == "deg":
        s = f"{x:.2f}"
    elif u in ("W/m2", "Pa"):
        s = f"{x:.0f}"
    elif u == "degC":
        s = f"{x:.1f}"
    elif u == "mm/day":
        s = f"{x:.2f}"
    else:
        s = f"{x:g}"
    return f"{s} {u}".strip()


def _words(tags: list[str]) -> str:
    return ", ".join(t.replace("_", " ") for t in tags)


def feature_distance(fs: dict, mars_p: EnvironmentalProfile, earth_p: EnvironmentalProfile | None, weight: float) -> FeatureDistance:
    fid = fs["feature_id"]
    mv, mars_unit = _value(mars_p, fid)
    ev, earth_unit = _value(earth_p, fid)
    unit = mars_unit or fs.get("unit")
    # Echo the raw values for the UI, except a non-finite number, which json
    # cannot carry; the note says why the feature was not compared.
    base = dict(feature_id=fid, label=fs["label"], mars_value=_echo(mv), earth_value=_echo(ev), unit=unit, scale=fs.get("scale"), raw_weight=weight,
                normalized_weight=None, contribution=None, method=fs["method"])

    def noncomp(note: str) -> FeatureDistance:
        return FeatureDistance(comparable=False, distance=None, note=note, **base)

    if mv is None and ev is None:
        return noncomp(f"{fid} is missing for both the Mars and the Earth site. It is not estimated, and it is left out of D")
    if mv is None:
        return noncomp(f"{fid} is missing for the Mars site. It is not estimated, and it is left out of D")
    if ev is None:
        return noncomp(f"{fid} is missing for the Earth site. It is not estimated, and it is left out of D")

    if fs["method"] == "scaled_absolute_difference":
        expected_unit = fs.get("unit")
        if mars_unit != expected_unit or earth_unit != expected_unit:
            return noncomp(f"The units do not match (Mars {mars_unit}, Earth {earth_unit}, expected {expected_unit}). It is left out of D")
        if not _is_finite_number(mv) or not _is_finite_number(ev):
            return noncomp("The value is not a finite number for at least one site. It is left out of D")
        scale = fs.get("scale")
        if not _is_finite_number(scale) or scale <= 0:
            return noncomp(f"The spec scale for {fid} is not a positive number. It is left out of D")
        diff = abs(float(mv) - float(ev))
        d = diff / float(scale)
        verdict = "close" if d <= CLOSE_D else ("moderately different" if d <= DIFFERENT_D else "very different")
        if "3.7 km" in fs.get("label", ""):
            verdict += " on the matched ~3.7 km baseline"
        note = (f"Mars {_fmt(mv, unit)} vs Earth {_fmt(ev, unit)}: |difference| {_fmt(diff, unit)} / scale {_fmt(scale, unit)}"
                f" = d {d:.2f} ({verdict})")
        return FeatureDistance(comparable=True, distance=d, note=note, **base)

    if fs["method"] == "jaccard_distance":
        mt, et = _tags(mv), _tags(ev)
        if mt is None or et is None:
            return noncomp("Both sites need lists of labels. It is left out of D")
        shared, only_m, only_e = sorted(set(mt) & set(et)), sorted(set(mt) - set(et)), sorted(set(et) - set(mt))
        d = jaccard_distance(mt, et)
        union = len(set(mt) | set(et))
        note = f"shared {len(shared)} of {union} distinct tags" + (f" ({_words(shared)})" if shared else " (none)")
        if only_m:
            note += f"; Mars only: {_words(only_m)}"
        if only_e:
            note += f"; Earth only: {_words(only_e)}"
        note += f"; Jaccard distance {d:.2f}"
        return FeatureDistance(comparable=True, distance=d, note=note, **base)

    return noncomp(f"Unknown method {fs['method']}. It is left out of D")


def _applications(cand: EarthCandidate, shared_terrain: list[str], shared_minerals: list[str]) -> list[str]:
    """Documented analog use only (from the data files). Proposals live in
    `_proposed_studies` and are labelled as hypotheses."""
    return list(cand.known_analog_use)


def _proposed_studies(mars_site: Site, cand: EarthCandidate, shared_terrain: list[str], shared_minerals: list[str], similarity: float | None) -> list[dict]:
    """At most two StudyCard dicts, each motivated by a SHARED characteristic
    that the study would actually use. A mineralogy-only match does not
    motivate a terrain traverse and vice versa. Empty when nothing is shared."""
    cards: list[dict] = []
    sim = f"{similarity:g}" if similarity is not None else "n/a"
    if shared_terrain:
        cards.append({"kind": "proposed_study", "title": f"Terrain-mobility rehearsal on shared landforms ({_words(shared_terrain)})",
                      "research_question": f"Do traverse-planning and hazard-mapping methods tested on {_words(shared_terrain)} at {cand.name} work on the same landforms at {mars_site.name}?",
                      "method": "Run instrumented traverses and terrain mapping on the matched landforms at the Earth site. Compare the predicted and observed trafficability. Then repeat the mapping method on orbital data for the Mars footprint.",
                      "why_here": f"{cand.name} shares these landforms with {mars_site.name}, according to the literature. The matched ~3.7 km terrain values show where regional slope or relief also agree.",
                      "motivating_citation_ids": [], "cannot_infer": f"Similarity {sim} is a rough index over labels and regional values. Earth gravity, atmosphere and radiation are different. It has not been shown that results transfer.",
                      "analog_candidate_id": cand.id})
    if shared_minerals:
        cards.append({"kind": "proposed_study", "title": f"Instrument and sample-handling tests on shared materials ({_words(shared_minerals)})",
                      "research_question": f"Can instrument calibration and sample handling, developed on {_words(shared_minerals)} at {cand.name}, be validated before use on the materials reported at {mars_site.name}?",
                      "method": "Do field spectroscopy and sample preparation on the Earth materials. Compare the instrument response with laboratory reference measurements. Record which procedures depend on conditions found only on Earth.",
                      "why_here": f"Both sites have cited {_words(shared_minerals)}. The comparison is about materials, not landing suitability.",
                      "motivating_citation_ids": [], "cannot_infer": "Mineral labels come from the literature. They are not spectral matches. Weathering, humidity and biology on Earth have no match on Mars.",
                      "analog_candidate_id": cand.id})
    return cards[:2]


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

    mt = _tags(_value(mars_p, "terrain_morphology")[0]) or []
    et = _tags(_value(earth_p, "terrain_morphology")[0]) or []
    mm = _tags(_value(mars_p, "mineralogy_tags")[0]) or []
    em = _tags(_value(earth_p, "mineralogy_tags")[0]) or []
    shared_t, shared_m = sorted(set(mt) & set(et)), sorted(set(mm) & set(em))

    shared: list[str] = []
    diffs: list[str] = []
    if shared_t:
        shared.append(f"Shared landforms: {_words(shared_t)}")
    elif mt and et:
        diffs.append(f"No shared landforms. Mars: {_words(mt)}. Earth: {_words(et)}.")
    if shared_m:
        shared.append(f"Shared minerals: {_words(shared_m)}")
    elif mm and em:
        diffs.append(f"No shared minerals. Mars: {_words(mm)}. Earth: {_words(em)}.")
    for f in comparable:
        if f.method != "scaled_absolute_difference" or f.distance is None:
            continue
        short = f.label.split(" (")[0]
        diff = abs(float(f.mars_value) - float(f.earth_value))
        pair = f"{short}: Mars {_fmt(f.mars_value, f.unit)} vs Earth {_fmt(f.earth_value, f.unit)}"
        if f.distance <= CLOSE_D:
            shared.append(f"{pair} (difference {_fmt(diff, f.unit)}, within half the {_fmt(f.scale, f.unit)} comparison scale)")
        elif f.distance > DIFFERENT_D:
            diffs.append(f"{pair} (difference {_fmt(diff, f.unit)}, {f.distance:.1f}x the {_fmt(f.scale, f.unit)} comparison scale)")

    noncomp = [f"{f.label}: {f.note}" for f in fds if not f.comparable] + list(spec["noncomparable_disclosures"])
    limitations = [
        "Similarity is a rough index (100 / (1 + D)) over the chosen features. It is not a validated probability.",
        "Terrain values are compared on the same ~3.7 km baseline. Metre-scale landforms are not assessed.",
        "Mineral and landform labels come from the literature. They are not spectral measurements.",
    ]
    if earth_p is None:
        limitations.append("The Earth site has no processed profile in this version. No feature could be compared, so there is no similarity."
                           if not comparable else "The Earth site has no processed profile. Only features present for both sites were compared.")
    elif not comparable:
        limitations.append("No feature with a positive weight is present for both sites. The similarity is left undefined instead of guessed.")
    citations = sorted(set(cand.sources) | set(mars_p.sources.keys()) | (set(earth_p.sources.keys()) if earth_p else set()))
    return AnalogMatch(mars_site_id=mars_site.id, earth_candidate=cand, similarity=None if sim is None else round(sim, 2), distance=None if D is None else round(D, 4), rank=None,
                       feature_distances=fds, shared_characteristics=shared, important_differences=diffs, noncomparable_variables=noncomp,
                       research_applications=_applications(cand, shared_t, shared_m), documented_analog_use=list(cand.known_analog_use),
                       proposed_studies=_proposed_studies(mars_site, cand, shared_t, shared_m, None if sim is None else round(sim, 2)),
                       limitations=limitations, citations=citations, completeness_fraction=round(completeness, 3))


def match_all(mars_site: Site, mars_p: EnvironmentalProfile, candidates: list[tuple[EarthCandidate, EnvironmentalProfile | None]], weights: list[AnalogWeight] | None, top_k: int) -> tuple[list[AnalogMatch], list[str]]:
    spec = load_spec()
    w = {fs["feature_id"]: fs["default_weight"] for fs in spec["features"]}
    warnings: list[str] = []
    if weights:
        for aw in weights:
            if aw.feature_id in w:
                w[aw.feature_id] = aw.weight
            else:
                warnings.append(f"Unknown analog weight '{aw.feature_id}' was ignored")
    if sum(w.values()) <= 0:
        warnings.append("All analog weights are zero, so similarity cannot be calculated")
    matches = [match(mars_site, mars_p, c, p, w) for c, p in candidates]
    # Contributions retain full precision even though response distance/index are rounded.
    matches.sort(key=lambda m: (sum(f.contribution for f in m.feature_distances if f.contribution is not None)
                                if m.similarity is not None else float("inf"), m.earth_candidate.id))
    n = 0
    for m in matches:
        if m.similarity is not None:
            n += 1
            m.rank = n
        else:
            m.rank = None
            if sum(w.values()) > 0:
                warnings.append(f"Site '{m.earth_candidate.id}' has no weighted feature that can be compared with '{mars_site.id}'. There is no similarity.")
    return matches[: max(0, top_k)], warnings
