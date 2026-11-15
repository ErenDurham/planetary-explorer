// The three mission objectives the planner offers. Copy and visual identity
// only: what each objective asks the service to optimise is the service's
// business and is described in its contract, not here.
import type { ObjectiveId, OptimizationPreference } from "../adapter/types";

export interface ObjectiveSpec {
  id: ObjectiveId;
  label: string;
  summary: string;
  detail: string;
  /** Design token name for the objective's accent. */
  accent: "info" | "copper" | "teal";
  /** The optimisation preference the planner pre-selects for this objective (the user can change it). */
  suggestedOptimization: OptimizationPreference;
}

export const OBJECTIVES: readonly ObjectiveSpec[] = [
  {
    id: "terrain_survey",
    label: "Terrain Survey",
    summary: "Visit several locations to describe the terrain.",
    detail: "Spread the waypoints across the region. The route then samples different slopes, surfaces and relief. The planner reports what the terrain data show for each leg.",
    accent: "info",
    suggestedOptimization: "balanced",
  },
  {
    id: "geological_sampling",
    label: "Geological Sampling",
    summary: "Plan a route to scientifically interesting sampling points.",
    detail: "Choose research targets with known coordinates. The service then finds a traverse that reaches them within the rover's limits.",
    accent: "copper",
    suggestedOptimization: "lowest_risk",
  },
  {
    id: "research_traverse",
    label: "Research Traverse",
    summary: "Balance the value of the targets, the route distance and the terrain risk.",
    detail: "A longer expedition. Every extra kilometre and every steep leg is weighed against the value of the targets it reaches.",
    accent: "teal",
    suggestedOptimization: "balanced",
  },
] as const;

export function objectiveSpec(id: ObjectiveId | null | undefined): ObjectiveSpec | undefined {
  return OBJECTIVES.find(o => o.id === id);
}

export const OPTIMIZATION_LABEL: Record<OptimizationPreference, { label: string; hint: string }> = {
  shortest_distance: { label: "Shortest distance", hint: "Minimise total path length between the ordered stops." },
  lowest_energy: { label: "Lowest energy", hint: "Prefer legs the service's rover model drives with the least energy." },
  lowest_risk: { label: "Lowest terrain risk", hint: "Avoid steep and rough legs even when that lengthens the route." },
  balanced: { label: "Balanced", hint: "The service's default trade-off between distance, energy and risk." },
};

export const ACCENT_CLASS: Record<ObjectiveSpec["accent"], { text: string; border: string; bg: string; ring: string }> = {
  info: { text: "text-info", border: "border-info/60", bg: "bg-info/10", ring: "ring-info/50" },
  copper: { text: "text-copper-bright", border: "border-copper/60", bg: "bg-copper/10", ring: "ring-copper/50" },
  teal: { text: "text-teal", border: "border-teal/60", bg: "bg-teal/10", ring: "ring-teal/50" },
};
