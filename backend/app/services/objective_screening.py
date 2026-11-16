"""Bounded free-text requirements mapped to the supplied catalogue vocabulary.

This proposes user preferences, never new measurements, tags, or evidence.
The same plan is used with and without an LLM. Unknown goals are disclosed.
"""
import re
from app.models.objective import ScreeningPlan
from app.models.mission_assessment import MissionRequirements
from app.services.data_loader import get_store

ALIASES = {
 "clays":r"clays?|clay minerals?|phyllosilicates?", "sulfates":r"sul(?:f|ph)ates?",
 "carbonates":r"carbonates?", "basalt":r"basalts?|basaltic", "olivine":r"olivines?",
 "iron_oxides":r"iron oxides?", "volcanic_glass":r"volcanic glass",
 "water_ice":r"water ice|ice deposits?", "regolith":r"regolith",
 "delta":r"deltas?|deltaic", "impact_crater":r"impact craters?",
 "lava_plain":r"lava plains?", "layered_deposits":r"layered deposits?",
 "outflow_channel_deposits":r"outflow channels?(?: deposits?)?",
 "paleolake_basin":r"paleolakes?(?: basins?)?|ancient lakes?",
 "periglacial":r"periglacial", "polygonal_terrain":r"polygonal terrain|polygons?",
 "smooth_plains":r"smooth plains?", "northern_lowlands":r"northern lowlands?",
}

def _mentions(text, pattern):
    for m in re.finditer(r"\b(?:"+pattern+r")\b",text,re.I):
        prefix=re.split(r"[;.!?]|\b(?:but|favou?r|prefer|instead|prioriti[sz]e|include|with|find|seek|look for)\b",text[:m.start()],flags=re.I)[-1]
        negative=bool(re.search(r"\b(avoid|exclude|without|no|rather than|not interested in|do not want|don't want|not(?! only))\b",prefix,re.I))
        yield m,negative

def _positive(text, pattern):
    return any(not negative for _,negative in _mentions(text,pattern))

def _negative(text, pattern):
    return any(negative for _,negative in _mentions(text,pattern))


def screening_plan(text, body="mars"):
    if re.search(r"\b(moon|lunar)\b",text,re.I):
        return None
    store=get_store()
    sites=store.sites() if body=="mars" else store.earth_candidates()
    profiles=[store.profile(s.id) if body=="mars" else store.earth_profile(s.id) for s in sites]
    def vocabulary(feature):
        return {v for p in profiles if p for m in [p.get(feature)] if m and not m.is_missing and isinstance(m.value,list) for v in m.value}
    materials=vocabulary("mineralogy_tags"); landforms=vocabulary("terrain_morphology")
    found=lambda tags: sorted(t for t in tags if _positive(text,ALIASES.get(t,re.escape(t.replace("_"," ")))))
    excluded=sorted(t for t in materials if _negative(text,ALIASES.get(t,re.escape(t.replace("_"," ")))))
    targets=[t for t in found(materials) if t not in excluded]; shapes=found(landforms)
    # Nearby ice is evidence to investigate, not an alternative mineral target.
    if "water_ice" in targets and re.search(r"\b(near|nearby|closest|nearest|proximity|distance|adjacent)\b",text,re.I):
        targets.remove("water_ice")
    research=bool(targets or excluded or (shapes and re.search(r"\b(study|research|investigate|sample|sampling|analy[sz]e)\b",text,re.I)) or re.search(r"\b(mineral\w*|geolog\w*|hydrated|clays?|sulphates?|sulfates?|carbonates?|jarosite|opal|sulfur|sulphur|gypsum|hematite|pyroxene|silica|smectite|chlorides?|basalts?|research|study|subsurface ice|water ice|water accessibility|water[- ]equivalent hydrogen|ice accessibility|biosignatures?|astrobiolog\w*)\b",text,re.I))
    base=bool(re.search(r"\b(permanent (?:moon |mars )?base|base[- ]building|base planning|(?:establish|build|construct) (?:a |the )?(?:research )?base|settlement|colony|habitat|outpost)\b",text,re.I))
    kind="research" if targets else "base_planning" if base else "research" if research else "landing"
    limits=[]
    if re.search(r"\b(ice|water|hydrogen|accessible|accessibility|closest|nearest|extraction)\b",text,re.I):
        limits.append("No comparable distance to mapped ice, ice depth, extraction yield or water accessibility measurements are available. Ranking cannot optimise these goals; water-related minerals alone do not establish an accessible water resource.")
    unknown=[t for t in ("jarosite","opal","sulfur","sulphur","gypsum","hematite","pyroxene","silica","smectite","chloride","chlorides") if _positive(text,t) and t not in materials]
    if unknown: limits.append("No catalogue mineral tags for "+", ".join(unknown)+"; these are not treated as documented matches or as physically absent.")
    if kind=="research" and not targets and not shapes and not unknown and re.search(r"\b(water[- ]related mineral\w*|hydrated minerals?)\b",text,re.I):
        targets=sorted((materials & {"clays","sulfates","carbonates"}) - set(excluded))
    if kind=="research" and not targets and not shapes:
        limits.append("No supported material or landform target was recognised. Choose a documented target before ranking; no landing score substitutes for this research goal.")
    # Explicit alternatives mean any qualifying tag, not an advantage for many tags.
    match="any" if re.search(r"\b(or|any|such as)\b|water[- ]related|hydrated mineral",text,re.I) and not re.search(r"\b(all of|both|every)\b",text,re.I) else "coverage"
    if unknown and match == "coverage":
        targets=[]
        shapes=[]
        limits.append("Not every required mineral can be verified from catalogue tags, so no complete-match ranking is calculated. Choose supported targets or alternatives.")
    req=MissionRequirements(material_targets=targets,excluded_material_targets=excluded,landform_targets=shapes,material_match=match)
    weights={"materials":100 if not shapes else 98 if targets else 0,"landforms":100 if shapes and not targets else 2 if shapes else 0} if kind=="research" else {}
    if kind == "research" and re.search(r"\b(safe|safety|slopes?|roughness|relief|sunlight|solar|power|elevation|radiation|temperature)\b", text, re.I):
        limits.append("Research target alignment scores materials and landforms only. Terrain safety, solar power, elevation and environmental hazards are not optimised by this ranking; inspect their separate evidence before choosing a site.")
    if base: limits.append("Base viability cannot be scored from the available regional profiles; review missing resource, hazard and infrastructure evidence.")
    return ScreeningPlan(body=body,mission_type=kind,requirements=req,weights=weights,limitations=limits)
