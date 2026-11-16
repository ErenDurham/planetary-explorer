"""Read-only answers over the same ordered candidates displayed by the UI."""
from dataclasses import dataclass, field
import math
import re
import unicodedata


def normalized(text):
    text = unicodedata.normalize("NFKD", text.casefold())
    return " ".join(re.sub(r"[^a-z0-9]+", " ", "".join(c for c in text if not unicodedata.combining(c))).split())


def display(value):
    if value is None:
        return "unknown"
    if isinstance(value, (float, int)):
        return f"{value:.2f}".rstrip("0").rstrip(".") if value else "0"
    if isinstance(value, list):
        return ", ".join(v.replace("_", " ") for v in value) or "no documented tags"
    return str(value)


@dataclass
class Candidate:
    id: str
    name: str
    score: float | None
    rank: int | None
    factors: dict = field(default_factory=dict)
    gaps: list[str] = field(default_factory=list)


def from_assessment(results):
    return [Candidate(r.site_id, r.site_name, r.score, r.rank,
                      {f.feature_id: (f.label, f.value, f.unit, f.contribution, f.note)
                       for f in r.factors if f.normalized_weight}, r.evidence_gaps) for r in results]


def from_landing(results):
    return [Candidate(r.site_id, r.site_name, r.score, r.rank,
                      {f.feature_id: (f.label, f.feature_value, f.unit, f.weighted_contribution, f.rationale)
                       for f in r.factor_scores if f.normalized_weight}, r.limitations + r.risks) for r in results]


def from_analogs(ranked):
    # Analog contributions are weighted distance penalties, not index points.
    return [Candidate(r.location.id, r.location.name, r.similarity, r.rank,
                      {f.feature_id: (f.label, f.earth_value if ranked.candidate_body == "earth" else f.mars_value,
                                      f.unit, -f.contribution if f.contribution is not None else None, f.note or "")
                       for f in r.feature_distances if f.normalized_weight},
                      [r.unrankable_reason] if r.unrankable_reason else []) for r in ranked.candidates]


def from_discovery(ranked):
    return [Candidate(c.id, c.name, c.similarity_index, c.display_rank,
                      {f.feature_id: (f.feature_id.replace("_", " "), f.earth_value,
                                      f.unit, -f.contribution, "Survey comparison with Jezero Crater")
                       for f in c.feature_distances if f.normalized_weight},
                      c.limitations) for c in ranked.candidates]


def mentioned(question, candidates):
    text = " " + normalized(question) + " "
    found = []
    for candidate in candidates:
        aliases = {normalized(candidate.name), normalized(candidate.id.replace("_", " "))}
        # Parenthetical qualifiers and id suffixes need not be typed by the user.
        aliases.add(normalized(candidate.name.split("(")[0]))
        if any(alias and " " + alias + " " in text for alias in aliases):
            found.append(candidate)
    # A distinctive partial name is usable only when it identifies one candidate.
    for word in set(normalized(question).split()) - {"crater", "planum", "ravine", "valley", "site", "north", "south", "pole"}:
        matches = [c for c in candidates if len(word) >= 5 and word in normalized(c.name).split()]
        if len(matches) == 1 and matches[0] not in found:
            found.append(matches[0])
    return found


def answer(question, candidates, label, selected_id=None, analog=False):
    """Return (grounded answer or None, candidates referenced by the question).

    Ordinals are list positions (including ties), matching the displayed list.
    Never infer a preference or a measurement from the question itself.
    """
    chosen = mentioned(question, candidates)
    comparison = bool(re.search(r"compar|difference|versus|\bvs\b|less than|higher|lower|better|worse", question, re.I))
    ordinal = re.search(r"\b(?:ranked\s+)?candidates?\s*#?(\d+)\s*(?:and|&|versus|vs\.?|,)\s*(?:candidate\s*)?#?(\d+)\b", question, re.I)
    if ordinal:
        positions = [int(n) for n in ordinal.groups()]
        if any(n < 1 or n > len(candidates) for n in positions):
            return f"Candidate positions {positions[0]} and {positions[1]} are not both available. This list contains {len(candidates)} candidates; choose two available positions or name the sites.", []
        chosen = [candidates[n - 1] for n in positions]
        comparison = True
    if comparison and len(chosen) == 1 and selected_id:
        selected = next((c for c in candidates if c.id == selected_id), None)
        if selected and selected not in chosen:
            chosen.append(selected)
    if comparison and len(chosen) != 2:
        return "Which two sites should I compare? Name both locations or use candidate 1 and 2 from the current list. A partial name must identify one location.", chosen
    if not comparison:
        return None, chosen
    a, b = chosen
    heading = f"{label}: {a.name} scores {display(a.score)} (rank {display(a.rank)}); {b.name} scores {display(b.score)} (rank {display(b.rank)})."
    if a.score is None or b.score is None:
        heading += " Missing evidence prevents a complete scored comparison; unknown values are not zero."
    elif a.rank == b.rank and math.isclose(a.score, b.score, abs_tol=1e-10):
        heading += " They are tied; list order does not establish that either is better."
    elif a.score == b.score:
        heading += " Displayed scores round to the same value; the ranks preserve the full-precision calculation."
    else:
        higher = a if a.score > b.score else b
        heading += f" {higher.name} has the higher index under the current priorities."
    differences = []
    keys = set(a.factors) | set(b.factors)
    def importance(key):
        av = a.factors.get(key, (None, None, None, None, None))[3]
        bv = b.factors.get(key, (None, None, None, None, None))[3]
        return abs((av or 0) - (bv or 0))
    for key in sorted(keys, key=lambda k: (-importance(k), k))[:3]:
        af, bf = a.factors.get(key), b.factors.get(key)
        name = (af or bf)[0]
        def describe(f):
            if not f or f[3] is None:
                return "unknown / excluded"
            unit = f" {f[2]}" if f[2] else ""
            points = f"weighted distance penalty {display(-f[3])}" if analog else f"{display(f[3])} index points"
            return f"{display(f[1])}{unit} ({points})"
        differences.append(f"{name}: {a.name} has {describe(af)}; {b.name} has {describe(bf)}.")
    if analog:
        differences.append("Smaller weighted distance penalties mean greater similarity to the current reference; similarity is not landing suitability.")
    elif differences:
        differences.append("These are contributions under the current model, not probabilities or confirmed resource accessibility.")
    gaps = list(dict.fromkeys(a.gaps + b.gaps))
    return "\n\n".join([heading, " ".join(differences)] + gaps[:2]), chosen


def summary(candidates, label):
    scored = [c for c in candidates if c.score is not None]
    if not scored:
        return f"{label}: no candidates can currently be ranked. Review the required targets and missing evidence; unknown measurements are not zero."
    leaders = [c for c in scored if c.rank == scored[0].rank]
    names = ", ".join(c.name for c in leaders)
    tied = " They are tied; list order does not establish a better match." if len(leaders) > 1 else ""
    return f"{label}: {names} {'share' if len(leaders)>1 else 'has'} the leading score of {display(scored[0].score)}.{tied} These results reflect only the configured criteria and available regional evidence."


def pair_answer(ranked, candidate):
    """A cross-body pair has one similarity score, not two competing ranks."""
    lines = [f"{candidate.location.name} compared with {ranked.reference.name}: analog similarity {display(candidate.similarity)} / 100; candidate rank {display(candidate.rank)} among {ranked.candidate_body.title()} sites for this reference."]
    for f in sorted(candidate.feature_distances, key=lambda f: -(f.contribution or 0)):
        if f.normalized_weight is not None:
            unit = f" {f.unit}" if f.unit else ""
            lines.append(f"{f.label}: Mars {display(f.mars_value)}{unit}; Earth {display(f.earth_value)}{unit}. Weighted distance penalty: {display(f.contribution)}.")
        if len(lines) == 4:
            break
    lines.append("Smaller distance penalties mean a closer match on the comparable features. Earth–Mars similarity is separate from landing suitability; missing features cannot establish equivalence or safety.")
    return "\n\n".join(lines)
