// POST /mission/interpret with an offline fallback.
//
// "Suggest priorities" sends the draft objective, the current slider shares
// and the criteria known to be unscorable. The response is a PROPOSAL the user
// reviews and edits before anything reaches the store; nothing here writes
// weights. When the backend cannot be reached (or rejects the call) the same
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
import type { AppliedInterpretation, ObjectiveMeta, ObjectiveSource } from "@/store/useAppStore";
import type { InterpretResponse, WeightSuggestion } from "@/types";

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
        ? "No measurements for this factor; forced to 0."
        : weight === previous
          ? "Unchanged: no keyword rule matched this factor."
          : "Keyword rule matched the objective text.",
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
      "Confidence describes how clearly the text matched the offline keyword rules; it says nothing about how suitable any site is. This reading was made in the browser because the backend could not be reached.",
    validation_notes: excluded.length ? [`Excluded criteria forced to 0: ${excluded.join(", ")}.`] : [],
    scoring_spec_version: "client-rules",
    cached: false,
    generated_at: new Date().toISOString(),
  };
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Turn a proposal (optionally with user-edited shares) into what the store
 * applies. Excluded or no-data factors are forced to 0 here; the store's
 * applyObjective converts the rest to shares summing to 100. */
export function applicationFromInterpretation(
  r: InterpretResponse,
  excluded: string[],
  source: ObjectiveSource,
  edited?: Record<string, number>,
): { weights: Record<string, number>; notes: string[]; meta: ObjectiveMeta } {
  const weights: Record<string, number> = {};
  const reasons: Record<string, string> = {};
  let editedByUser = false;
  for (const s of r.suggestions) {
    const noData = excluded.includes(s.criterion_id) || !s.data_available;
    const proposed = noData ? 0 : clamp(s.weight);
    const value = noData ? 0 : clamp(edited?.[s.criterion_id] ?? s.weight);
    if (!noData && edited && s.criterion_id in edited && value !== proposed) editedByUser = true;
    weights[s.criterion_id] = value;
    reasons[s.criterion_id] = s.reason;
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
  };
  const notes = [
    ...(r.rationale ?? []),
    ...(r.unsupported_needs ?? []).map((n) => `Cannot be scored by this model: ${n}`),
    ...(editedByUser ? ["You edited the proposed shares before applying them."] : []),
  ];
  return { weights, notes, meta: { objectiveHash: r.objective_hash, source, model: r.model ?? null, interpretation } };
}

export function useInterpretObjective() {
  const [state, setState] = useState<InterpretState>({ status: "idle", result: null });
  const seq = useRef(0);

  const run = useCallback(async (objective: string, currentWeights: Record<string, number>, excluded: string[]) => {
    const mine = ++seq.current;
    const text = objective.trim();
    setState({ status: "pending", result: null });
    let result: InterpretResult;
    try {
      const response = await api.interpret({ objective: text, current_weights: currentWeights, excluded_criteria: excluded });
      result = { response, offline: false, requestedText: text, error: null };
    } catch (e) {
      result = {
        response: interpretOffline(text, currentWeights, excluded),
        offline: true,
        requestedText: text,
        error: e instanceof Error ? e : new Error(String(e)),
      };
    }
    if (mine !== seq.current) return; // a newer Suggest click superseded this one
    setState({ status: "done", result });
  }, []);

  const discard = useCallback(() => {
    seq.current += 1;
    setState({ status: "idle", result: null });
  }, []);

  return { ...state, run, discard };
}
