"""Rank a pool of candidates on one body against a reference on the other.

Shares `feature_distance()` with analog_engine so the pairwise maths is
identical in both directions. Differences from /analogs/match:

* COMMON BASIS: a feature enters the ranking only if it has positive weight
  AND is comparable for EVERY candidate in the pool. Otherwise every pair would
  be scored on a different feature set and a candidate missing a hard feature
  would be flattered. Excluded features are reported with the reason.
* UNRANKABLE: with an empty basis the whole pool is unrankable; a candidate
  whose basis values are somehow non-comparable is reported as unrankable
  rather than scored on fewer features.
* TIES: rank is assigned on full-precision distance; equal distances share the
  order given by site id (documented `tie_rule`); display rounding never
  creates a tie.
* rank_color_position = (rank-1)/(ranked_count-1), 0 when one candidate is
  ranked, so a client can map the FULL pool monotonically onto a palette.
"""
from __future__ import annotations

from app.models import AnalogWeight, EnvironmentalProfile
from app.models.analog_rank import AnalogRankRequest, AnalogRankResponse, ExcludedFeature, LocationRef, RankedCandidate
from app.services.analog_engine import CLOSE_D, DIFFERENT_D, _fmt, _tags, _value, _words, feature_distance, load_spec

TIE_RULE = "Rank by full-precision distance D ascending; equal D ordered by candidate id ascending. Rounded display values that look equal are not ties."


def _resolve_weights(weights: list[AnalogWeight] | None) -> tuple[dict[str, float], list[str]]:
    spec = load_spec()
    w = {fs["feature_id"]: float(fs["default_weight"]) for fs in spec["features"]}
    warnings: list[str] = []
    for aw in weights or []:
        if aw.feature_id in w:
            w[aw.feature_id] = float(aw.weight)
        else:
            warnings.append(f"ignored unknown analog weight '{aw.feature_id}'")
    return w, warnings


def _pair_fds(mars_p: EnvironmentalProfile, earth_p: EnvironmentalProfile | None, w: dict[str, float]):
    return [feature_distance(fs, mars_p, earth_p, w.get(fs["feature_id"], fs["default_weight"])) for fs in load_spec()["features"]]


def _narrative(fds, mars_p, earth_p):
    shared, diffs = [], []
    mt = _tags(_value(mars_p, "terrain_morphology")[0]) or []
    et = _tags(_value(earth_p, "terrain_morphology")[0]) or []
    mm = _tags(_value(mars_p, "mineralogy_tags")[0]) or []
    em = _tags(_value(earth_p, "mineralogy_tags")[0]) or []
    st, sm = sorted(set(mt) & set(et)), sorted(set(mm) & set(em))
    if st:
        shared.append(f"Terrain morphology shared: {_words(st)}")
    elif mt and et:
        diffs.append(f"Terrain morphology: no shared tags")
    if sm:
        shared.append(f"Composition shared: {_words(sm)}")
    elif mm and em:
        diffs.append("Composition: no shared tags")
    for f in fds:
        if f.comparable and f.method == "scaled_absolute_difference" and f.distance is not None and f.raw_weight > 0:
            short = f.label.split(" (")[0]
            pair = f"{short}: Mars {_fmt(f.mars_value, f.unit)} vs Earth {_fmt(f.earth_value, f.unit)}"
            if f.distance <= CLOSE_D:
                shared.append(pair + " (close at the harmonised scale)")
            elif f.distance > DIFFERENT_D:
                diffs.append(pair + f" ({f.distance:.1f}x the comparison scale)")
    return shared, diffs


def rank_pool(req: AnalogRankRequest, store) -> AnalogRankResponse:
    spec = load_spec()
    cand_body = req.candidate_body or ("mars" if req.reference_body == "earth" else "earth")
    if cand_body == req.reference_body:
        raise ValueError("candidate_body must differ from reference_body")
    w, warnings = _resolve_weights(req.weights)

    # Reference and pool, always expressed as canonical (mars_profile, earth_profile) pairs.
    if req.reference_body == "mars":
        ref_site = store.site(req.reference_id)
        ref_prof = store.profile(req.reference_id)
        if ref_site is None or ref_prof is None:
            raise KeyError(req.reference_id)
        ref = LocationRef(body="mars", id=ref_site.id, name=ref_site.name, lat=ref_site.lat, lon_east=ref_site.lon_east)
        pool = [(LocationRef(body="earth", id=c.id, name=c.name, lat=c.lat, lon_east=c.lon_east), ref_prof, store.earth_profile(c.id)) for c in store.earth_candidates()]
    else:
        ref_cand = store.earth_candidate(req.reference_id)
        ref_prof = store.earth_profile(req.reference_id)
        if ref_cand is None or ref_prof is None:
            raise KeyError(req.reference_id)
        ref = LocationRef(body="earth", id=ref_cand.id, name=ref_cand.name, lat=ref_cand.lat, lon_east=ref_cand.lon_east)
        pool = [(LocationRef(body="mars", id=s.id, name=s.name, lat=s.lat, lon_east=s.lon_east), store.profile(s.id), ref_prof) for s in store.sites("mars")]

    labels = {fs["feature_id"]: fs["label"] for fs in spec["features"]}
    per_cand = [(loc, mp, ep, _pair_fds(mp, ep, w)) for loc, mp, ep in pool]

    # Common basis: positive weight and comparable for every candidate.
    excluded: list[ExcludedFeature] = []
    basis: list[str] = []
    for fid in labels:
        if w.get(fid, 0) <= 0:
            excluded.append(ExcludedFeature(feature_id=fid, label=labels[fid], reason="weight is 0 for this ranking"))
            continue
        missing = [loc.id for loc, _, _, fds in per_cand if not next(f for f in fds if f.feature_id == fid).comparable]
        if missing:
            excluded.append(ExcludedFeature(feature_id=fid, label=labels[fid], reason=f"not comparable for {len(missing)} of {len(per_cand)} candidates ({', '.join(missing[:3])}{'...' if len(missing) > 3 else ''}); dropped pool-wide so every pair is scored on the same features"))
            continue
        basis.append(fid)
    wsum = sum(w[f] for f in basis)
    eff = {f: w[f] / wsum for f in basis} if wsum > 0 else {}
    if not basis:
        warnings.append("no positive-weight feature is comparable across the whole pool; the pool is unrankable")

    cands: list[RankedCandidate] = []
    for loc, mp, ep, fds in per_cand:
        for f in fds:
            f.normalized_weight = eff.get(f.feature_id) if f.feature_id in eff else None
            f.contribution = (f.normalized_weight * (f.distance or 0.0)) if f.normalized_weight is not None and f.distance is not None else None
        D = sum(f.contribution for f in fds if f.contribution is not None) if basis else None
        sim = None if D is None else 100.0 / (1.0 + D)
        shared, diffs = _narrative(fds, mp, ep)
        srcs = sorted(set(mp.sources.keys()) | (set(ep.sources.keys()) if ep else set()))
        cands.append(RankedCandidate(location=loc, rank=None, rank_color_position=None, similarity=None if sim is None else round(sim, 2), distance=None if D is None else round(D, 6),
                                     feature_distances=fds, coverage_fraction=1.0 if basis else 0.0,
                                     unrankable_reason=None if basis else "no common comparable feature basis in this pool",
                                     shared_characteristics=shared, important_differences=diffs, sources=srcs))
    ranked = [c for c in cands if c.distance is not None]
    ranked.sort(key=lambda c: (c.distance, c.location.id))
    n = len(ranked)
    for i, c in enumerate(ranked, 1):
        c.rank = i
        c.rank_color_position = 0.0 if n == 1 else (i - 1) / (n - 1)
    ordered = ranked + [c for c in cands if c.distance is None]
    return AnalogRankResponse(reference=ref, candidate_body=cand_body, basis_features=basis, excluded_features=excluded, effective_weights=eff,
                              candidates=ordered, pool_size=len(cands), ranked_count=n, tie_rule=TIE_RULE,
                              analog_spec_version=spec["version"], profile_version=store.profile_version,
                              planetary_differences=list(spec["noncomparable_disclosures"]), warnings=warnings, client_request_id=req.client_request_id)
