import { DEFAULT_MISSION_OBJECTIVE } from "@/lib/defaultObjective";
// POST /mission/interpret with an offline fallback.
//
// Saving a mission sends its text, the current slider shares and the criteria
// known to be unscorable. `run` resolves to the proposal (or null when a newer
// call superseded it); the caller decides what reaches the store, and nothing
// here writes weights. When the backend cannot be reached (or rejects the call) the same
// proposal shape is built locally from the keyword rules in lib/objective.ts
// and flagged `offline: true`, so the UI can label it as a rule-based reading
// and never as a model interpretation.
//
// `applicationFromInterpretation` is the one place a proposal is turned into
// what the store applies: the validated weights (excluded / no-data factors
// forced to 0, the store then converts to shares), the notes, and the
// provenance plus per-factor reasons the "why these priorities" panel shows.
import { useCallback, useRef, useState } from "react";
import { api } from "@/services/api";
import { recommendObjective } from "@/lib/objective";
import type { AppliedInterpretation, InterpretationApplication, ObjectiveMeta, ObjectiveSource } from "@/store/useAppStore";
import { toAnalogShares } from "@/lib/analogFeatures";
import type { DirectionOption, EvidenceCitation, InterpretResponse, SiteReference, TaskInterpretation, WeightSuggestion } from "@/types";

export interface InterpretResult {
  response: InterpretResponse;
  /** True when the proposal was produced client-side because the backend was unavailable. */
  offline: boolean;
  /** The exact draft text the proposal was made for; compared against the draft for staleness. */
  requestedText: string;
  /** The error that forced the fallback, when any. */
  error: Error | null;
}

export interface InterpretState {
  status: "idle" | "pending" | "done";
  result: InterpretResult | null;
}

/** Labels for criteria when the rule fallback has no backend label to hand. */
const FALLBACK_LABELS: Record<string, string> = {
  terrain_safety: "Terrain safety (regional slope)",
  elevation_suitability: "Elevation suitability (EDL atmosphere)",
  surface_roughness: "Surface roughness (detrended relief)",
  thermal_conditions: "Thermal conditions",
  solar_illumination: "Solar illumination (annual mean, top of atmosphere)",
};

/** Small, stable, non-cryptographic hash so an offline reading still gets an
 * objective_hash the staleness check can compare. Prefixed so it can never be
 * mistaken for a backend hash. */
export function localObjectiveHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `local-${h.toString(16).padStart(8, "0")}`;
}

/** Build an InterpretResponse-shaped proposal from the keyword rules. Used only
 * when POST /mission/interpret fails; `generated_by` is always "rule_based". */
export function interpretOffline(
  objective: string,
  currentWeights: Record<string, number>,
  excluded: string[],
  labels: Record<string, string> = FALLBACK_LABELS,
): InterpretResponse {
  const plan = recommendObjective(objective, currentWeights, excluded);
  const ids = new Set([...Object.keys(currentWeights), ...Object.keys(plan.weights)]);
  const suggestions: WeightSuggestion[] = [...ids].map((id) => {
    const previous = currentWeights[id] ?? 0;
    const weight = plan.weights[id] ?? previous;
    const isExcluded = excluded.includes(id);
    return {
      criterion_id: id,
      label: labels[id] ?? id,
      weight,
      previous_weight: previous,
      reason: isExcluded
        ? "This factor has no measurements, so it is set to 0."
        : weight === previous
          ? "No keyword rule matched this factor, so it did not change."
          : "A keyword rule matched the objective text.",
      data_available: !isExcluded,
    };
  });
  const unsupported = plan.notes.filter((n) => /outside the current landing model|cannot yet be scored/.test(n));
  return {
    objective,
    objective_hash: localObjectiveHash(objective.trim()),
    generated_by: "rule_based",
    model: null,
    suggestions,
    rationale: plan.notes.filter((n) => !unsupported.includes(n)),
    tradeoffs: [],
    unsupported_needs: unsupported,
    clarifying_questions: [],
    confidence: "low",
    confidence_note:
      "Confidence shows how clearly the text matched the offline keyword rules. It says nothing about how suitable a site is. The backend could not be reached, so this reading was made in the browser.",
    validation_notes: excluded.length ? [`Excluded criteria forced to 0: ${excluded.join(", ")}.`] : [],
    mission_profile: "other",
    earth_suggestions: [],
    constraint_evidence: {},
    evidence_version: null,
    scoring_spec_version: "client-rules",
    cached: false,
    generated_at: new Date().toISOString(),
  };
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** What the review UI settled that the reading left open. */
export interface TaskResolution {
  /** The direction the user picked when `task === "ambiguous"`. */
  direction?: DirectionOption | null;
  /** The site the user picked for an unresolved mention (never guessed). */
  reference?: SiteReference | null;
  /** Analog shares after the user edited the proposal, if they did. */
  analogShares?: Record<string, number> | null;
}

/**
 * Turn the task reading into the ONE store application a reviewed objective
 * makes, or null when it cannot be applied yet: an ambiguous task with no
 * direction chosen. The recognised reference wins over a user pick only when
 * the reading actually recognised one; an unresolved mention is never
 * guessed.
 */
export function taskApplicationFromInterpretation(ti: TaskInterpretation | null | undefined, objectiveHash: string | null, resolution: TaskResolution = {}): InterpretationApplication | null {
  if (!ti) return null;
  let task = ti.task;
  let focus = ti.focus_body ?? null;
  if (task === "ambiguous") {
    if (!resolution.direction || resolution.direction.task === "ambiguous") return null;
    task = resolution.direction.task;
    focus = resolution.direction.focus_body;
  }
  const picked = ti.reference_site ?? resolution.reference ?? null;
  const reference = picked ? { body: picked.body, id: picked.id, name: picked.name } : null;
  // an analog search looks on the body OPPOSITE the reference when the text did not say
  if (!focus) focus = task === "landing_screening" ? "mars" : reference ? (reference.body === "earth" ? "mars" : "earth") : null;
  const suggestions = ti.analog_suggestions ?? [];
  // an empty or all-zero proposal says nothing, so the current shares are kept (null = keep)
  const proposed = suggestions.some((a) => a.weight > 0) ? Object.fromEntries(suggestions.map((a) => [a.feature_id, a.weight])) : null;
  const analogWeights = resolution.analogShares ?? (proposed ? toAnalogShares(proposed) : null);
  return {
    task,
    focusBody: focus,
    missionDestination: ti.mission_destination ?? (task === "landing_screening" ? "mars" : null),
    reference,
    analogWeights,
    objectiveHash,
  };
}

/** Turn a proposal (optionally with user-edited shares) into what the store
 * applies. Excluded or no-data factors are forced to 0 here; the store's
 * applyObjective converts the rest to shares summing to 100. */
export function applicationFromInterpretation(
  r: InterpretResponse,
  excluded: string[],
  source: ObjectiveSource,
  edited?: Record<string, number>,
  resolution: TaskResolution = {},
): { weights: Record<string, number>; notes: string[]; meta: ObjectiveMeta; earthWeights: Record<string, number> | null } {
  const weights: Record<string, number> = {};
  const reasons: Record<string, string> = {};
  const evidence: Record<string, EvidenceCitation[]> = {};
  let editedByUser = false;
  for (const s of r.suggestions) {
    const noData = excluded.includes(s.criterion_id) || !s.data_available;
    const proposed = noData ? 0 : clamp(s.weight);
    const value = noData ? 0 : clamp(edited?.[s.criterion_id] ?? s.weight);
    if (!noData && edited && s.criterion_id in edited && value !== proposed) editedByUser = true;
    weights[s.criterion_id] = value;
    reasons[s.criterion_id] = s.reason;
    evidence[s.criterion_id] = s.evidence ?? [];
  }
  const interpretation: AppliedInterpretation = {
    reasons,
    rationale: r.rationale ?? [],
    tradeoffs: r.tradeoffs ?? [],
    unsupportedNeeds: r.unsupported_needs ?? [],
    clarifyingQuestions: r.clarifying_questions ?? [],
    validationNotes: r.validation_notes ?? [],
    confidence: r.confidence ?? null,
    confidenceNote: r.confidence_note,
    editedByUser,
    evidence,
    constraintEvidence: r.constraint_evidence ?? {},
    missionProfile: r.mission_profile ?? "other",
    analog: r.analog_check ?? null,
    earth: (r.earth_suggestions ?? []).length
      ? { reasons: Object.fromEntries((r.earth_suggestions ?? []).map((e) => [e.factor_id, e.reason])), evidence: Object.fromEntries((r.earth_suggestions ?? []).map((e) => [e.factor_id, e.evidence ?? []])) }
      : null,
  };
  const notes = [
    ...(r.rationale ?? []),
    ...(r.unsupported_needs ?? []).map((n) => `Cannot be scored by this model: ${n}`),
    ...(editedByUser ? ["You edited the suggested shares before saving them."] : []),
  ];
  // This exact built-in preset has a known direction even without the backend.
  // Do not guess task semantics for arbitrary user text.
  const taskApplication = taskApplicationFromInterpretation(r.task_interpretation, r.objective_hash, resolution)
    ?? (r.objective.trim() === DEFAULT_MISSION_OBJECTIVE ? {
      task: "analog_site_selection" as const, focusBody: "earth" as const,
      missionDestination: "mars" as const,
      reference: { body: "mars" as const, id: "jezero_crater", name: "Jezero Crater" },
      analogWeights: { slope_regional_median_deg: 30, roughness_regional_m: 30, terrain_morphology: 25, mineralogy_tags: 10, precipitation_mm_day: 5 },
      objectiveHash: r.objective_hash,
    } : null);
  const earth = r.earth_suggestions ?? [];
  const earthWeights = earth.some((e) => e.weight > 0) ? Object.fromEntries(earth.map((e) => [e.factor_id, e.weight])) : null;
  return { weights, notes, meta: { objectiveHash: r.objective_hash, source, model: r.model ?? null, interpretation, taskApplication }, earthWeights };

}

export function useInterpretObjective() {
  const [state, setState] = useState<InterpretState>({ status: "idle", result: null });
  const seq = useRef(0);

  const run = useCallback(async (objective: string, currentWeights: Record<string, number>, excluded: string[]): Promise<InterpretResult | null> => {
    const mine = ++seq.current;
    const text = objective.trim();
    setState({ status: "pending", result: null });
    let result: InterpretResult;
    try {
      const response = await api.interpret({ objective: text, current_weights: currentWeights, excluded_criteria: excluded, use_llm: true });
      result = { response, offline: false, requestedText: text, error: null };
    } catch (e) {
      result = {
        response: interpretOffline(text, currentWeights, excluded),
        offline: true,
        requestedText: text,
        error: e instanceof Error ? e : new Error(String(e)),
      };
    }
    if (mine !== seq.current) return null; // a newer save superseded this one
    setState({ status: "done", result });
    return result;
  }, []);

  const discard = useCallback(() => {
    seq.current += 1;
    setState({ status: "idle", result: null });
  }, []);

  return { ...state, run, discard };
}
