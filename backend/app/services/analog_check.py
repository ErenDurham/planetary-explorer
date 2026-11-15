"""The Earth <-> Mars cross-reference behind the mission priorities.

The chain, for both planets:
  Mars:  an Earth site research shows suits this mission -> its measured data
         -> a Mars site's measured data -> how they compare. If the Mars data
         is comparable to the proven Earth site, that Mars spot is good.
  Earth: an Earth site's data -> is it comparable to the Mars site's data?
         Yes -> good test site; no -> not.

The Earth ranking itself is the analog similarity to the paired Mars site
(services/mission_assessment.py); the comparison here uses the same scales.

Everything numeric here is measured data from the site profiles (Earth:
Copernicus GLO-90 based; Mars: MOLA based, both on ~3.7 km cells). The model
only chooses WHICH Earth and Mars site to pair; this module does the maths.
"""
from __future__ import annotations

from app.models.objective import AnalogCheck, AnalogFactorCheck
from app.services import evidence
from app.models import AnalogWeight
from app.models.analog_rank import AnalogRankRequest
from app.services.analog_engine import DIFFERENT_D, load_spec
from app.services.analog_rank_engine import rank_pool
from app.services.data_loader import get_store

# criterion -> (feature, unit, tolerance). The tolerance is the analog spec's
# comparison scale times DIFFERENT_D, so "comparable" here means exactly what
# the Earth ranking and Explore's analog view call close or moderately
# different (slope within 1.5 deg, relief within 100 m), never "very different".
def _tolerance(feature_id: str) -> float:
    fs = next(f for f in load_spec()["features"] if f["feature_id"] == feature_id)
    return float(fs["scale"]) * DIFFERENT_D


COMPARED = {
    "terrain_safety": ("slope_regional_median_deg", "deg", _tolerance("slope_regional_median_deg")),
    "surface_roughness": ("roughness_regional_m", "m", _tolerance("roughness_regional_m")),
}
NOT_COMPARABLE = {
    "elevation_suitability": ("elevation_median_m", "m", "This cannot be compared across planets. Earth elevations are above sea level. Mars elevations are above the MOLA areoid."),
    "solar_illumination": ("insolation_toa_annual_mean_wm2", "W/m2", "This cannot be compared directly. Mars receives 0.431 of Earth's sunlight (NASA Mars Fact Sheet)."),
}


def _value(profile, feature_id: str) -> float | None:
    if profile is None:
        return None
    v, _ = get_store().feature_value(profile, feature_id)   # (value, measurement); None when missing
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def earth_ids() -> list[str]:
    return [c.id for c in get_store().earth_candidates()]


def mars_ids() -> list[str]:
    return [s.id for s in get_store().sites("mars")]


def site_table() -> list[dict]:
    """Measured values of every Earth and Mars site, for the model to cross-reference."""
    store = get_store()
    feats = {**{k: v[0] for k, v in COMPARED.items()}, **{k: v[0] for k, v in NOT_COMPARABLE.items()}}
    rows = []
    for c in store.earth_candidates():
        p = store.earth_profile(c.id)
        rows.append({"planet": "earth", "id": c.id, **{f: _round(_value(p, f)) for f in feats.values()}})
    for s in store.sites("mars"):
        p = store.profile(s.id)
        rows.append({"planet": "mars", "id": s.id, **{f: _round(_value(p, f)) for f in feats.values()}})
    return rows


def _round(v: float | None) -> float | None:
    return None if v is None else round(v, 2)


def closest_mars(earth_id: str) -> str | None:
    """The Mars site most similar to an Earth site: the top of the analog
    ranking (slope, relief, landforms, minerals, dryness; analog spec weights),
    the same calculation that ranks Earth sites against a Mars site."""
    try:
        ranked = rank_pool(AnalogRankRequest(reference_body="earth", reference_id=earth_id, candidate_body="mars"), get_store())
    except KeyError:
        return None
    top = next((c for c in ranked.candidates if c.rank == 1), None)
    return top.location.id if top else None


def _tags(profile, feature_id: str) -> list[str]:
    if profile is None:
        return []
    v, _ = get_store().feature_value(profile, feature_id)
    return [t for t in v if isinstance(t, str)] if isinstance(v, list) else []


def default_earth_site(mission_profile: str) -> str:
    """Without the model's choice: the Earth site with the most research for this
    kind of mission (then any research), else the first candidate."""
    ids = earth_ids()
    def score(cid: str) -> tuple[int, int]:
        items = [e for e in evidence.active() if cid in e.get("sites", [])]
        return (sum(1 for e in items if mission_profile in e["missions"]), len(items))
    return max(ids, key=score) if ids else ""


def check(earth_id: str, mars_id: str, chosen_by: str) -> AnalogCheck | None:
    store = get_store()
    earth, mars = store.earth_candidate(earth_id), store.site(mars_id)
    if earth is None or mars is None:
        return None
    ep, mp = store.earth_profile(earth_id), store.profile(mars_id)
    factors: list[AnalogFactorCheck] = []
    for cid, (feature, unit, tol) in COMPARED.items():
        ev, mv = _value(ep, feature), _value(mp, feature)
        if ev is None or mv is None:
            factors.append(AnalogFactorCheck(criterion_id=cid, earth_value=ev, mars_value=mv, unit=unit, tolerance=tol, comparable=None,
                                             note="One of the two sites has no measured value, so they cannot be compared."))
            continue
        diff = abs(ev - mv)
        ok = diff <= tol
        factors.append(AnalogFactorCheck(criterion_id=cid, earth_value=round(ev, 2), mars_value=round(mv, 2), unit=unit, difference=round(diff, 2), tolerance=tol,
                                         comparable=ok, note=("Comparable" if ok else "Not comparable") + f": differ by {diff:.2f} {unit} (comparable within {tol:g} {unit})."))
    for cid, (feature, unit, why) in NOT_COMPARABLE.items():
        factors.append(AnalogFactorCheck(criterion_id=cid, earth_value=_round(_value(ep, feature)), mars_value=_round(_value(mp, feature)), unit=unit,
                                         comparable=None, note=why))
    shared = {f: sorted(set(_tags(ep, f)) & set(_tags(mp, f))) for f in ("terrain_morphology", "mineralogy_tags")}
    return AnalogCheck(earth_site_id=earth.id, earth_site_name=earth.name, mars_site_id=mars.id, mars_site_name=mars.name,
                       research=evidence.for_site(earth.id), factors=factors, chosen_by=chosen_by,
                       shared_landforms=shared["terrain_morphology"], shared_minerals=shared["mineralogy_tags"])
