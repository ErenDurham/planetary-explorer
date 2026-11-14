// Pure helpers for turning slider state into a MissionProfile and for keying
// TanStack Query caches on it.
import type { HardConstraint, MissionProfile } from "@/types";

export function buildMission(
  weights: Record<string, number>,
  hardConstraints: HardConstraint[],
  criterionOrder: string[],
): MissionProfile {
  const criteria = criterionOrder
    .filter((id) => id in weights)
    .map((id) => ({ criterion_id: id, weight: weights[id] }));
  return {
    mission_phase: "landing",
    criteria,
    hard_constraints: hardConstraints,
    missing_data_policy: "common_feature_set",
  };
}

/** Stable, order-independent hash of a mission for cache keys. */
export function missionKey(mission: MissionProfile | null): string {
  if (!mission) return "default";
  const c = [...mission.criteria].sort((a, b) => a.criterion_id.localeCompare(b.criterion_id));
  return c.map((x) => `${x.criterion_id}=${Math.round(x.weight)}`).join("&");
}

export function hasPositiveWeight(weights: Record<string, number>): boolean {
  return Object.values(weights).some((w) => w > 0);
}
