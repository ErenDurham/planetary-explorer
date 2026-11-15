import { token } from "@/lib/theme";
/** Transparent suggestions, never a claim that free text expands the scoring model. */

/** Plain-language copy for each scoring factor. `preference` is the one-line
 * sentence shown beside the slider; `quantity` and `caveat` are the longer
 * explanation in the info tip. Colours are shared with the charts. The
 * numbers that score a site come from the backend's scoring spec; nothing
 * here changes a threshold or a formula. */
export interface PriorityGuide {
  name: string;
  color: string;
  /** What raising this factor prefers, in one short sentence. */
  preference: string;
  /** What the priority represents, in one static sentence (hover popups). */
  description: string;
  /** The measured or modelled quantity actually scored. */
  quantity: string;
  /** What the quantity cannot tell you. */
  caveat: string;
  /** Legacy longer copy, still used by the charts' tooltips. */
  effect: string;
  tradeoff: string;
  /** Present only for factors the v1 profiles cannot score. */
  unavailableReason?: string;
}

export const PRIORITY_GUIDE: Record<string, PriorityGuide> = {
  terrain_safety: {
    name: "Low slopes",
    color: token("--color-copper-bright"),
    preference: "Prefers sites where the ground is flatter, with less tilt.",
    description: "How gently the ground tilts across the landing region, since steep slopes can tip a lander over.",
    quantity: "Median slope between neighbouring ~3.7 km MOLA cells over the ~59 km footprint.",
    caveat: "Cannot see boulders, craters or metre-scale slopes.",
    effect: "Rewards lower regional slopes. Moving this right increases their influence on the landing ranking.",
    tradeoff: "Regional slopes cannot resolve boulders or small landing hazards.",
  },
  surface_roughness: {
    name: "Less rugged ground",
    color: token("--color-ok"),
    preference: "Prefers ground that is less rough and bumpy (the overall tilt aside).",
    description: "How rough and bumpy the ground is once its overall tilt is set aside; rugged ground is harder to land and drive on.",
    quantity: "Detrended relief: standard deviation of MOLA elevation after a best-fit plane, over the footprint.",
    caveat: "Not rock abundance or trafficability. Related to slope but distinct: tilt versus bumpiness.",
    effect: "Rewards less regional relief after removing the broad terrain tilt.",
    tradeoff: "This does not measure individual rocks or surface trafficability.",
  },
  elevation_suitability: {
    name: "Lower elevation",
    color: token("--color-info"),
    preference: "Prefers lower-lying footprints.",
    description: "How low the site sits, since lower ground leaves more atmosphere to slow the lander as it descends.",
    quantity: "Footprint median MOLA elevation relative to the areoid.",
    caveat: "A proxy for the atmospheric column during entry, descent and landing, not a descent simulation.",
    effect: "Rewards lower sites, where more atmosphere may help entry, descent and landing.",
    tradeoff: "This is an elevation proxy, not a simulation of your lander's descent.",
  },
  solar_illumination: {
    name: "Solar energy",
    color: token("--color-lavender"),
    preference: "Prefers more annual sunlight.",
    description: "How much sunlight reaches the site over a Mars year, the energy available for solar power.",
    quantity: "Modelled annual-mean top-of-atmosphere insolation from latitude and Mars' orbit.",
    caveat: "Not panel output; dust, seasons and local shadows are ignored.",
    effect: "Rewards greater annual sunlight above the atmosphere, using latitude and orbital geometry.",
    tradeoff: "Dust, seasons, local shadows and actual panel output are not modelled.",
  },
  thermal_conditions: {
    name: "Thermal conditions",
    color: token("--color-fg-muted"),
    preference: "Would prefer warmer measured surface temperatures.",
    description: "How warm the surface is, which no current candidate site has measurements for.",
    quantity: "Mean surface temperature; no site in the v1 profiles carries a measured value.",
    caveat: "Excluded from every score. It is not treated as measured and cannot move a ranking.",
    effect: "Would reward warmer measured surface temperatures.",
    tradeoff: "Temperature data is unavailable across the current sites; this factor cannot affect rankings.",
    unavailableReason: "No measured surface temperature in the v1 profiles; excluded from every score, not treated as measured.",
  },
};

/** Display name for a criterion id, falling back to the backend label. */
export function factorName(id: string, fallback?: string): string {
  return PRIORITY_GUIDE[id]?.name ?? fallback ?? id.replace(/_/g, " ");
}

export function recommendObjective(text: string, defaults: Record<string, number>, excluded: string[]) {
  const weights = { ...defaults };
  const notes: string[] = [];
  const rules: Array<[RegExp, Record<string, number>, string]> = [
    [/\b(safe|safety|landing|lander|risk)\b/i, { terrain_safety: 65, elevation_suitability: 45, surface_roughness: 55 }, "Landing safety language increases the emphasis on slopes, lower elevation and regional smoothness."],
    [/\b(solar|sunlight|power|energy|illumination)\b/i, { solar_illumination: 75 }, "Solar energy language increases the emphasis on annual sunlight."],
    [/\b(rover|traverse|drive|smooth|roughness|mobility)\b/i, { surface_roughness: 80, terrain_safety: 65 }, "Surface mobility language increases the emphasis on smooth and gently sloping terrain."],
    [/\b(elevation|descent|atmosphere|edl)\b/i, { elevation_suitability: 80 }, "Descent and atmosphere language increases the emphasis on lower elevation."],
  ];
  // Do not claim to understand negation or arbitrary mission semantics.
  if (/\b(not|avoid|without|ignore|less|deprioriti[sz]e)\b/i.test(text)) {
    notes.push("This objective contains exclusions or tradeoffs. Simple keyword rules cannot interpret those reliably; starting from baseline priorities for you to adjust.");
  } else {
    for (const [pattern, changes, note] of rules) if (pattern.test(text)) { Object.assign(weights, changes); notes.push(note); }
  }
  if (!notes.length) notes.push("The mission does not name a priority directly, so the app made a best guess: the standard starting weights. Adjust them if needed.");
  if (/\b(ice|water|habitability|biology|life|radiation|base|settlement|moon|lunar|geology|sample|samples|mineral)\b/i.test(text)) notes.push("This objective includes science or habitation needs outside the current landing model. These weights cannot optimise those needs; use the evidence and Earth comparisons separately.");
  if (/\b(thermal|temperature|warm|cold)\b/i.test(text)) notes.push("Temperature is currently unmeasured, so a thermal objective cannot yet be scored.");
  for (const id of excluded) weights[id] = 0;
  return { weights, notes };
}
