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
    preference: "Prefers sites with flatter ground.",
    description: "How much the ground tilts across the landing region. Steep slopes can tip a lander over.",
    quantity: "Median slope between neighbouring MOLA cells (~3.7 km). It is measured over the ~59 km footprint.",
    caveat: "It cannot see boulders, small craters or metre-scale slopes.",
    effect: "Rewards lower regional slopes. Moving this slider right gives slope more weight in the landing ranking.",
    tradeoff: "Regional slopes cannot show boulders or small landing hazards.",
  },
  surface_roughness: {
    name: "Less rugged ground",
    color: token("--color-ok"),
    preference: "Prefers less rough and bumpy ground, after the overall tilt is removed.",
    description: "How rough and bumpy the ground is after the overall tilt is removed. Rugged ground is harder to land and drive on.",
    quantity: "Detrended relief. This is the standard deviation of MOLA elevation after a best-fit plane is removed, over the footprint.",
    caveat: "It does not measure rock abundance or trafficability. It is related to slope, but slope measures tilt and relief measures bumpiness.",
    effect: "Rewards lower regional relief, after the broad tilt is removed.",
    tradeoff: "It does not measure individual rocks or surface trafficability.",
  },
  elevation_suitability: {
    name: "Lower elevation",
    color: token("--color-info"),
    preference: "Prefers sites at lower elevation.",
    description: "How low the site sits. Lower ground has more atmosphere above it to slow the lander during descent.",
    quantity: "Median MOLA elevation of the footprint, relative to the areoid.",
    caveat: "It stands in for the amount of atmosphere during entry, descent and landing. It is not a descent simulation.",
    effect: "Rewards lower sites. More atmosphere may help entry, descent and landing.",
    tradeoff: "It only uses elevation. It does not simulate your lander's descent.",
  },
  solar_illumination: {
    name: "Solar energy",
    color: token("--color-lavender"),
    preference: "Prefers more sunlight over a year.",
    description: "How much sunlight reaches the site over a Mars year. This is the energy available for solar power.",
    quantity: "Modelled annual-mean sunlight at the top of the atmosphere. It is calculated from latitude and the orbit of Mars.",
    caveat: "It is not solar panel output. Dust, seasons and local shadows are not included.",
    effect: "Rewards more yearly sunlight at the top of the atmosphere. It uses latitude and orbital geometry.",
    tradeoff: "Dust, seasons, local shadows and real panel output are not modelled.",
  },
  thermal_conditions: {
    name: "Thermal conditions",
    color: token("--color-fg-muted"),
    preference: "Would prefer warmer measured surface temperatures.",
    description: "How warm the surface is. No current site has measurements for this.",
    quantity: "Mean surface temperature. No site in the v1 profiles has a measured value.",
    caveat: "It is left out of every score. It cannot change a ranking.",
    effect: "Would reward warmer measured surface temperatures.",
    tradeoff: "No current site has temperature data. This factor cannot affect rankings.",
    unavailableReason: "The v1 profiles have no measured surface temperature. This factor is left out of every score.",
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
    [/\b(safe|safety|landing|lander|risk)\b/i, { terrain_safety: 65, elevation_suitability: 45, surface_roughness: 55 }, "The objective mentions landing safety. Slope, elevation and smooth ground get more weight."],
    [/\b(solar|sunlight|power|energy|illumination)\b/i, { solar_illumination: 75 }, "The objective mentions solar energy. Yearly sunlight gets more weight."],
    [/\b(rover|traverse|drive|smooth|roughness|mobility)\b/i, { surface_roughness: 80, terrain_safety: 65 }, "The objective mentions driving or mobility. Smooth, gently sloping ground gets more weight."],
    [/\b(elevation|descent|atmosphere|edl)\b/i, { elevation_suitability: 80 }, "The objective mentions descent or atmosphere. Lower elevation gets more weight."],
  ];
  // Do not claim to understand negation or arbitrary mission semantics.
  if (/\b(not|avoid|without|ignore|less|deprioriti[sz]e)\b/i.test(text)) {
    notes.push("The objective contains exclusions or tradeoffs. Simple keyword rules cannot read these reliably. The baseline priorities are used, and you can adjust them.");
  } else {
    for (const [pattern, changes, note] of rules) if (pattern.test(text)) { Object.assign(weights, changes); notes.push(note); }
  }
  if (!notes.length) notes.push("No priority keywords were found. The baseline priorities are used. Please review them.");
  if (/\b(ice|water|habitability|biology|life|radiation|base|settlement|moon|lunar|geology|sample|samples|mineral)\b/i.test(text)) notes.push("The objective includes science or habitation needs. The landing model does not cover these needs. Use the evidence and Earth comparisons for them.");
  if (/\b(thermal|temperature|warm|cold)\b/i.test(text)) notes.push("Temperature is not measured yet. A thermal objective cannot be scored.");
  for (const id of excluded) weights[id] = 0;
  return { weights, notes };
}
