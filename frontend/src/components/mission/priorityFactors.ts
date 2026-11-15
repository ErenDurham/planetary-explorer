import { token } from "@/lib/theme";
// What the Mission Design priority views need to know about one factor,
// whichever planet it belongs to. Both planets use the same scoring criteria
// (no-data ones left out); Earth only changes what the (i) box says. The slider, pie,
// hover card and "Why these priorities?" components only see this shape, so
// both planets look and behave the same.
import { PRIORITY_GUIDE, factorName } from "@/lib/objective";
import type { CriterionSpec } from "@/types";

export interface PriorityFactor {
  id: string;
  name: string;
  color: string;
  /** One line under the name: what raising this factor prefers. */
  preference: string;
  /** One fixed sentence on what the factor represents (hover popup). */
  description: string;
  /** The (i) box. */
  quantity: string;
  caveat: string;
  rule: string;
}

/** The scorable Mars landing factors (factors with no data are left out). */
export function marsFactors(criteria: CriterionSpec[], excluded: string[]): PriorityFactor[] {
  return criteria.filter((c) => !excluded.includes(c.criterion_id)).map((c) => {
    const g = PRIORITY_GUIDE[c.criterion_id];
    return {
      id: c.criterion_id,
      name: factorName(c.criterion_id, c.label),
      color: g?.color ?? token("--color-fg-muted"),
      preference: g?.preference ?? c.rationale,
      description: g?.description ?? c.label,
      quantity: g?.quantity ?? `${c.feature_id.replace(/_/g, " ")}${c.unit ? ` (${c.unit})` : ""}`,
      caveat: g?.caveat ?? "Regional screening only.",
      rule: `Scoring rule (backend, unchanged): ${c.function.direction.replace(/_/g, " ")}. Fully suitable at ${c.function.full} ${c.unit}; zero at ${c.function.zero} ${c.unit}.`,
    };
  });
}

/** Earth mode: the same factors, names, colours and descriptions as Mars;
 * only the (i) box says what the Earth data are and how each one is used. */
export function earthFactors(criteria: CriterionSpec[], excluded: string[]): PriorityFactor[] {
  const source = "Earth sites: Copernicus GLO-90 elevation model, averaged to ~3.7 km cells so it compares directly with the Mars (MOLA) values.";
  const earth: Record<string, { quantity: string; rule: string }> = {
    terrain_safety: { quantity: `Median regional slope. ${source}`, rule: "Drives the Earth site ranking as its slope share (closeness to the target slope)." },
    surface_roughness: { quantity: `Detrended regional relief. ${source}`, rule: "Drives the Earth site ranking as its relief share (closeness to the target relief)." },
    elevation_suitability: { quantity: `Median elevation. ${source}`, rule: "Recorded as an Earth priority; the Earth site ranking does not score elevation yet." },
    solar_illumination: { quantity: "Annual-mean top-of-atmosphere sunlight from latitude, as for Mars.", rule: "Recorded as an Earth priority; the Earth site ranking does not score sunlight yet." },
  };
  return marsFactors(criteria, excluded).map((f) => ({ ...f, ...(earth[f.id] ?? { rule: "Recorded as an Earth priority; not scored for Earth sites." }) }));
}
