"""Semantic reading of WHAT an objective asks for: task, focus body, mission
destination, a named reference site, and proposed analog preferences.

Deterministic and transparent (regexes over the text plus a site-name
alias table built from the data files). It is intentionally conservative:
"Compare Earth and Mars geology" yields `ambiguous` with two direction
options rather than a guessed direction; a partial site name ("the crater")
yields `unresolved_sites` with a selector list, never a coordinate.

Rules, in order:
1. Mission destination: Mars unless the text says otherwise ("lunar"/"Moon" is
   unsupported in this release and reported by the objective engine).
2. Named sites: longest alias match wins; Earth and Mars aliases are separate.
3. Task:
   - analog cues ("analog", "analogue", "field site", "test site", "test a
     rover", "rehearse", "resembl", "similar to", "like <site>", "field
     campaign", "proving ground") -> analog_site_selection;
   - landing cues ("landing site", "land safely", "EDL", "touchdown") with no
     analog cue -> landing_screening;
   - both or neither with two bodies named -> ambiguous with direction options.
4. Focus body for analog tasks: an explicit "on Earth"/"Earth field site"
   phrase, else the OTHER body from a named reference site (a Mars reference
   means look on Earth and vice versa), else Earth (Earth test sites for a
   Mars mission is the common case) - reported in rationale.
5. Analog preferences are proposed from the task flavour: mobility/terrain
   words emphasise slopes, relief and landforms; mineral/spectroscopy words
   emphasise materials; dryness words emphasise aridity. Elevation and thermal
   never enter analog weights (not comparable across bodies / unavailable).
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

from app.models import AnalogWeightSuggestion, DirectionOption, SiteCandidate, SiteReference, TaskInterpretation

DATA = Path(__file__).resolve().parents[2] / "data"

ANALOG_CUES = re.compile(r"\b(analog(?:ue)?s?|field[- ]site|test[- ]site|testing ground|proving ground|rehears\w*|resembl\w*|similar to|look like|looks like|field campaign|field test|test (?:a |the |our )?(?:rover|drill|instrument|lander|suit)|train(?:ing)? (?:crew|astronauts)|terrestrial)\b", re.I)
LANDING_CUES = re.compile(r"\b(landing site|land safely|safe landing|landing|touchdown|entry, descent|edl|descent)\b", re.I)
COMPARE_CUES = re.compile(r"\b(compare|comparison|versus|vs\.?|contrast)\b", re.I)
ON_EARTH = re.compile(r"\b(on earth|earth (?:field|test|analog|site|location)|terrestrial|somewhere on earth|here on earth)\b", re.I)
ON_MARS = re.compile(r"\b(on mars|mars (?:site|location|landing|candidate)s?|martian)\b", re.I)
MOBILITY = re.compile(r"\b(rover|traverse|drive|driving|mobility|wheel|trafficab\w*|slope|terrain|roughness|landform)\w*", re.I)
MATERIALS = re.compile(r"\b(mineral\w*|spectro\w*|clay\w*|carbonate\w*|sulfate\w*|sulphate\w*|basalt\w*|geolog\w*|rock\w*|sample\w*|composition)\b", re.I)
DRYNESS = re.compile(r"\b(arid\w*|dry\w*|desert|hyperarid|precipitation|rainless)\b", re.I)

ANALOG_FEATURE_LABELS = {
    "slope_regional_median_deg": "Similar slopes", "roughness_regional_m": "Similar regional relief", "terrain_morphology": "Similar landforms",
    "mineralogy_tags": "Similar materials", "precipitation_mm_day": "Dryness",
}
ANALOG_DEFAULTS = {"slope_regional_median_deg": 25, "roughness_regional_m": 25, "terrain_morphology": 20, "mineralogy_tags": 20, "precipitation_mm_day": 10}


@lru_cache
def aliases() -> list[tuple[str, SiteReference]]:
    """(lowercase alias, reference) sorted longest alias first."""
    out: list[tuple[str, SiteReference]] = []
    mars = json.loads((DATA / "mars" / "sites.json").read_text())["sites"]
    earth = json.loads((DATA / "earth" / "candidates.json").read_text())["candidates"]
    extra_mars = {"jezero_crater": ["jezero"], "gale_crater": ["gale", "bradbury landing", "mount sharp"], "elysium_planitia": ["elysium", "insight site", "insight landing site"],
                  "oxia_planum": ["oxia"], "utopia_planitia": ["utopia", "viking 2 site"], "chryse_planitia": ["chryse", "viking 1 site"],
                  "meridiani_planum": ["meridiani", "eagle crater", "opportunity site"], "gusev_crater": ["gusev", "columbia memorial station", "spirit site"]}
    extra_earth = {"atacama_yungay": ["atacama", "yungay"], "mcmurdo_dry_valleys": ["dry valleys", "mcmurdo", "university valley", "antarctic dry valleys"],
                   "haughton_crater": ["haughton", "devon island"], "death_valley": ["death valley"], "holuhraun_iceland": ["holuhraun", "iceland"],
                   "mdrs_utah": ["mdrs", "mars desert research station", "hanksville", "san rafael swell", "utah"], "mauna_kea_summit": ["mauna kea", "hawaii", "hawai'i"]}
    for s in mars:
        for a in [s["name"].lower()] + extra_mars.get(s["id"], []):
            out.append((a, SiteReference(body="mars", id=s["id"], name=s["name"], matched_text=a)))
    for c in earth:
        for a in [c["name"].lower()] + extra_earth.get(c["id"], []):
            out.append((a, SiteReference(body="earth", id=c["id"], name=c["name"], matched_text=a)))
    return sorted(out, key=lambda t: -len(t[0]))


def find_sites(text: str) -> list[SiteReference]:
    low = text.lower()
    found: list[SiteReference] = []
    taken: list[tuple[int, int]] = []
    for alias, ref in aliases():
        for m in re.finditer(r"(?<![a-z])" + re.escape(alias) + r"(?![a-z])", low):
            if any(a <= m.start() < b or a < m.end() <= b for a, b in taken):
                continue
            taken.append((m.start(), m.end()))
            if not any(f.id == ref.id for f in found):
                found.append(ref.model_copy(update={"matched_text": text[m.start():m.end()]}))
    return found


def unresolved(text: str, found: list[SiteReference]) -> list[SiteCandidate]:
    """Generic place words with no resolved name -> offer a selector."""
    low = text.lower()
    out = []
    if re.search(r"\b(the|that|this|a) (crater|valley|desert|lava field|plain|site)\b", low) and not found:
        word = re.search(r"\b(the|that|this|a) (crater|valley|desert|lava field|plain|site)\b", low).group(0)
        opts = [ref for alias, ref in aliases() if ref.name.lower() == alias]
        out.append(SiteCandidate(matched_text=word, options=opts))
    return out


def analog_preferences(text: str) -> tuple[list[AnalogWeightSuggestion], list[str]]:
    w = dict(ANALOG_DEFAULTS)
    why: dict[str, str] = {k: "Default analog weight (spec)." for k in w}
    notes = []
    if MOBILITY.search(text):
        w.update({"slope_regional_median_deg": 30, "roughness_regional_m": 30, "terrain_morphology": 25, "mineralogy_tags": 10, "precipitation_mm_day": 5})
        for k in ("slope_regional_median_deg", "roughness_regional_m", "terrain_morphology"):
            why[k] = "The text mentions mobility or terrain, so terrain similarity gets more weight."
        why["mineralogy_tags"] = "Lowered, because materials matter less for a mobility rehearsal."
        notes.append("The text mentions mobility or terrain. Terrain features get more weight than materials.")
    if MATERIALS.search(text):
        w.update({"mineralogy_tags": max(w["mineralogy_tags"], 40)})
        why["mineralogy_tags"] = "The text mentions minerals or geology, so documented materials get more weight."
        notes.append("The text mentions minerals or geology. Materials get more weight.")
    if DRYNESS.search(text):
        w["precipitation_mm_day"] = max(w["precipitation_mm_day"], 20)
        why["precipitation_mm_day"] = "Dryness wording: aridity emphasised."
        notes.append("The text mentions dryness. Aridity gets more weight.")
    total = sum(w.values())
    shares = {k: int(round(100 * v / total)) for k, v in w.items()}
    drift = 100 - sum(shares.values())
    if drift:
        top = max(shares, key=shares.get)
        shares[top] += drift
    return [AnalogWeightSuggestion(feature_id=k, label=ANALOG_FEATURE_LABELS[k], weight=shares[k], reason=why[k]) for k in ANALOG_DEFAULTS], notes


def interpret_task(text: str) -> TaskInterpretation:
    found = find_sites(text)
    mars_ref = next((f for f in found if f.body == "mars"), None)
    earth_ref = next((f for f in found if f.body == "earth"), None)
    analog = bool(ANALOG_CUES.search(text)) or (mars_ref is not None and earth_ref is not None and not LANDING_CUES.search(text))
    landing = bool(LANDING_CUES.search(text))
    compare = bool(COMPARE_CUES.search(text))
    rationale: list[str] = []
    destination: str | None = "mars"
    if re.search(r"\b(moon|lunar)\b", text, re.I):
        rationale.append("The text mentions the Moon. The Moon is not part of this release, so no lunar task is suggested.")
    if compare and not analog and not landing:
        opts = [DirectionOption(task="analog_site_selection", focus_body="earth", label="Find Earth sites like a Mars site", description="Pick a Mars site. The Earth field sites are ranked against it."),
                DirectionOption(task="analog_site_selection", focus_body="mars", label="Find Mars sites like an Earth site", description="Pick an Earth site. The Mars sites are ranked against it.")]
        rationale.append("The text asks for a comparison but does not say which planet to search. Both directions are offered.")
        return TaskInterpretation(task="ambiguous", focus_body=None, mission_destination=destination, reference_site=mars_ref or earth_ref, unresolved_sites=unresolved(text, found), direction_options=opts, analog_suggestions=analog_preferences(text)[0], rationale=rationale)
    if analog:
        if ON_EARTH.search(text):
            focus = "earth"; rationale.append("The text asks for a location on Earth (test / field / analog site).")
        elif ON_MARS.search(text) and earth_ref and not mars_ref:
            focus = "mars"; rationale.append("The text asks for Mars sites and names an Earth reference.")
        elif mars_ref and not earth_ref:
            focus = "earth"; rationale.append(f"A Mars site ({mars_ref.name}) is the reference, so the search is for Earth analogs.")
        elif earth_ref and not mars_ref:
            focus = "mars"; rationale.append(f"An Earth site ({earth_ref.name}) is the reference, so the search is for Mars sites resembling it.")
        elif mars_ref and earth_ref:
            focus = "earth"; rationale.append("The text names both an Earth site and a Mars site. Earth is searched, and the Mars site is the reference. Switch the direction if that is not what you meant.")
        else:
            focus = "earth"; rationale.append("The text mentions analogs but names no site. Earth test sites for a Mars mission are assumed. Choose a Mars reference site.")
        ref = mars_ref if focus == "earth" else earth_ref
        sugg, notes = analog_preferences(text)
        rationale += notes
        return TaskInterpretation(task="analog_site_selection", focus_body=focus, mission_destination=destination, reference_site=ref, unresolved_sites=unresolved(text, found), analog_suggestions=sugg, rationale=rationale)
    # landing screening (default for Mars mission wording)
    rationale.append("The text mentions landing or site screening. The task is Mars landing screening, with Earth analogs as an option." if landing else "The text does not mention analogs, so Mars landing screening is assumed. Use 'Find Earth analogs' to switch.")
    return TaskInterpretation(task="landing_screening", focus_body="mars", mission_destination=destination, reference_site=mars_ref, unresolved_sites=unresolved(text, found), analog_suggestions=analog_preferences(text)[0], rationale=rationale)
