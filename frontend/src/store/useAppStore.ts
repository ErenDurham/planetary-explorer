// Zustand store: synchronous UI state shared across panels. Server data lives
// in TanStack Query (src/hooks), and camera/hover state stays inside the R3F
// tree (src/components/globe) so it never forces a React re-render per frame.
//
// Priority weights are kept in SHARE form: integer percentages that sum to 100
// over the active (data-available) factors, excluded factors at 0. The
// backend normalises whatever it receives, so a share IS the weight it scores
// with, and the number beside a slider equals `normalized_weight` * 100.
import type { ComparisonMode } from "@/lib/comparison";
import { create } from "zustand";
import { setShare, toShares } from "@/lib/allocation";
import type { HardConstraint } from "@/types";

export type Tab = "mission" | "explore" | "analyze" | "compare" | "research";

/** Where the applied objective's weights came from. "offline_rule_based" is the
 * client fallback used when POST /mission/interpret could not be reached; it
 * must never be shown as a model interpretation. */
export type ObjectiveSource = "llm" | "rule_based" | "offline_rule_based";

/** What the interpretation said about WHY the applied allocation looks the
 * way it does. Every string is the interpreter's reading of the text, never a
 * scientific finding about a site. */
export interface AppliedInterpretation {
  /** Per-factor `reason` from the interpretation, by criterion_id. */
  reasons: Record<string, string>;
  rationale: string[];
  tradeoffs: string[];
  /** Goals the landing model cannot score ("cannot be scored by this model"). */
  unsupportedNeeds: string[];
  clarifyingQuestions: string[];
  validationNotes: string[];
  /** Confidence in the READING of the text, never in the allocation's merit. */
  confidence: "low" | "medium" | "high" | null;
  confidenceNote: string;
  /** True when the user edited the proposed shares before applying. */
  editedByUser: boolean;
}

export interface ObjectiveMeta {
  /** `objective_hash` echoed by /mission/interpret; null for a local reading. */
  objectiveHash?: string | null;
  source?: ObjectiveSource;
  model?: string | null;
  interpretation?: AppliedInterpretation | null;
}

/** The last slider move, kept so the recommendation card can explain it and
 * so guidance can send the shares from BEFORE the drag. */
export interface PriorityChange {
  criterionId: string;
  /** Shares before the drag began (the last settled state). */
  previous: Record<string, number>;
}

export interface ComparisonSettings {
  mode: ComparisonMode;
  earthId: string;
  moonId: string;
  section: string;
  details: boolean;
}

export interface AppState {
  comparison: ComparisonSettings;
  setComparison: (patch: Partial<ComparisonSettings>) => void;
  missionObjective: string;
  appliedObjective: string;
  /** The applied objective's suggestion, in shares. Reset restores this. */
  recommendedWeights: Record<string, number>;
  objectiveNotes: string[];
  /** Provenance of the applied suggestion, so the UI never labels a draft as interpreted. */
  appliedObjectiveHash: string | null;
  appliedObjectiveSource: ObjectiveSource | null;
  appliedObjectiveModel: string | null;
  appliedInterpretation: AppliedInterpretation | null;
  /** Applying a suggestion is the ONLY thing that replaces the current shares wholesale. */
  applyObjective: (text: string, weights: Record<string, number>, notes: string[], meta?: ObjectiveMeta) => void;
  selectionRevision: number;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;

  selectedSiteId: string | null;
  selectSite: (id: string | null) => void;

  /** Priority shares by criterion_id, 0..100, summing to 100 over active factors. Empty until seeded. */
  weights: Record<string, number>;
  /** Set one factor's share; the other active factors rescale proportionally. */
  setWeight: (criterionId: string, share: number) => void;
  beginPriorityChange: (criterionId: string) => void;
  /** Replace every share (normalised to shares first). Clears the last-change record. */
  setWeights: (weights: Record<string, number>) => void;
  /** Factors with no data: always 0 and outside the share sum. */
  excludedCriteria: string[];
  setExcludedCriteria: (ids: string[]) => void;
  /** The last slider move, or null after seed / apply / reset. */
  priorityChange: PriorityChange | null;
  /** Hard constraints from the default mission (v1 does not edit them, but they are sent back verbatim). */
  hardConstraints: HardConstraint[];
  setHardConstraints: (c: HardConstraint[]) => void;
  /** Scoring-spec default weights (raw, as the backend states them), captured on first load. */
  defaultWeights: Record<string, number>;
  setDefaultWeights: (weights: Record<string, number>) => void;
  /** Restore the APPLIED objective's suggestion; spec defaults only if nothing was ever applied. */
  resetWeights: () => void;

  /** Analog weight overrides by feature_id; null = use spec defaults. */
  analogWeights: Record<string, number> | null;
  setAnalogWeight: (featureId: string, weight: number) => void;
  resetAnalogWeights: () => void;

  /** Metric shown in the environmental comparison chart. */
  comparisonFeatureId: string;
  setComparisonFeatureId: (id: string) => void;

  /** UI prefs */
  autoRotate: boolean;
  setAutoRotate: (v: boolean) => void;
  /** Incremented by the reset-camera button; the globe watches it. */
  cameraResetToken: number;
  requestCameraReset: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  missionObjective: "Find a safe landing site with reliable solar energy.",
  appliedObjective: "",
  recommendedWeights: {},
  objectiveNotes: [],
  appliedObjectiveHash: null,
  appliedObjectiveSource: null,
  appliedObjectiveModel: null,
  appliedInterpretation: null,
  applyObjective: (text, weights, notes, meta) => {
    const shares = toShares(weights, get().excludedCriteria);
    set({
      missionObjective: text,
      appliedObjective: text,
      recommendedWeights: shares,
      objectiveNotes: notes,
      weights: { ...shares },
      priorityChange: null,
      appliedObjectiveHash: meta?.objectiveHash ?? null,
      appliedObjectiveSource: meta?.source ?? "offline_rule_based",
      appliedObjectiveModel: meta?.model ?? null,
      appliedInterpretation: meta?.interpretation ?? null,
    });
  },
  selectionRevision: 0,
  comparison: { mode: "all", earthId: "haughton_crater", moonId: "apollo_11", section: "all", details: false },
  setComparison: (patch) => set(s => ({ comparison: { ...s.comparison, ...patch } })),
  activeTab: "explore",
  setActiveTab: (tab) => set({ activeTab: tab }),

  selectedSiteId: null,
  selectSite: (id) => set((s) => ({ selectedSiteId: id, selectionRevision: s.selectionRevision + 1, autoRotate: id ? false : s.autoRotate })),

  weights: {},
  beginPriorityChange: (criterionId) => set(s => ({ priorityChange: { criterionId, previous: { ...s.weights } } })),
  setWeight: (criterionId, share) =>
    set((s) => {
      const next = setShare(s.weights, criterionId, share, s.excludedCriteria);
      if (next === s.weights) return {};
      // one drag = one change record; keep the pre-drag baseline across its pixels
      const previous = s.priorityChange?.criterionId === criterionId ? s.priorityChange.previous : s.weights;
      return { weights: next, priorityChange: { criterionId, previous } };
    }),
  setWeights: (weights) => set((s) => ({ weights: toShares(weights, s.excludedCriteria), priorityChange: null })),
  excludedCriteria: ["thermal_conditions"],
  setExcludedCriteria: (ids) =>
    set((s) => {
      const same = ids.length === s.excludedCriteria.length && ids.every((id) => s.excludedCriteria.includes(id));
      if (same) return {};
      const renorm = (w: Record<string, number>) => (Object.keys(w).length ? toShares(w, ids) : w);
      return { excludedCriteria: [...ids], weights: renorm(s.weights), recommendedWeights: renorm(s.recommendedWeights) };
    }),
  priorityChange: null,
  hardConstraints: [],
  setHardConstraints: (hardConstraints) => set({ hardConstraints }),
  defaultWeights: {},
  setDefaultWeights: (defaultWeights) => set({ defaultWeights }),
  resetWeights: () => {
    const state = get();
    const source = Object.keys(state.recommendedWeights).length ? state.recommendedWeights : toShares(state.defaultWeights, state.excludedCriteria);
    set({ weights: { ...source }, priorityChange: null });
  },

  analogWeights: null,
  setAnalogWeight: (featureId, weight) =>
    set((s) => ({ analogWeights: { ...(s.analogWeights ?? {}), [featureId]: clamp(weight) } })),
  resetAnalogWeights: () => set({ analogWeights: null }),

  comparisonFeatureId: "elevation_median_m",
  setComparisonFeatureId: (comparisonFeatureId) => set({ comparisonFeatureId }),

  autoRotate: true,
  setAutoRotate: (autoRotate) => set({ autoRotate }),
  cameraResetToken: 0,
  requestCameraReset: () => set((s) => ({ cameraResetToken: s.cameraResetToken + 1 })),
}));

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
