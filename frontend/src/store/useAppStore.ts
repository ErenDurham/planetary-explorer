import { DEFAULT_MISSION_OBJECTIVE } from "@/lib/defaultObjective";
// Zustand store: synchronous UI state shared across panels. Server data lives
// in TanStack Query (src/hooks), and camera/hover state stays inside the R3F
// tree (src/components/globe) so it never forces a React re-render per frame.
//
// Priority weights are kept in SHARE form: integer percentages that sum to 100
// over the active (data-available) factors, excluded factors at 0. The
// backend normalises whatever it receives, so a share IS the weight it scores
// with, and the number beside a slider equals `normalized_weight` * 100.
import { DEFAULT_PROFILE_WEIGHTS, defaultRequirements, missionViewMode, type MissionType, type AssessmentType } from "@/lib/missionProfiles";
import type { MissionRequirements, ScreeningPlan } from "@/types";
import type { ComparisonMode } from "@/lib/comparison";
import { create } from "zustand";
import { setShare, toShares } from "@/lib/allocation";
import { ANALOG_FEATURE_IDS, otherBody, toAnalogShares, type Body } from "@/lib/analogFeatures";
import type { AnalogCheck, EvidenceCitation, HardConstraint, MissionKind } from "@/types";

export type Tab = "home" | "mission" | "explore" | "analyze" | "compare" | "research";
/** The two ways to explore: browse the featured regions, or find candidate Earth analogs for a reference region. */
export type ExploreMode = "browse" | "find_analogs";

/** The default mission objective (one source: lib/defaultObjective.ts). The app
 * sets its starting priorities from it, and it is the example in the empty
 * Mission Design box (Tab fills it in). */
export const DEFAULT_OBJECTIVE = DEFAULT_MISSION_OBJECTIVE;
export type { Body };

/** What the user is doing: screening Mars landing candidates, or picking an
 * analog site on one body for a reference on the other. Never "ambiguous" in
 * the store - an ambiguous reading must be resolved in the review UI first. */
export type Task = "landing_screening" | "analog_site_selection";

/** How the visible globe's candidates are coloured. `landing_suitability` is
 * only meaningful on Mars; use `effectiveMapMode()` for what to render. */
export type MapMode = "landing_suitability" | "analog_match" | "mission_browse";

/** Palette for analog rank colours. ROYGBIV by default; single hue is the
 * accessible alternative (both are monotonic in rank). */
export type RankPalette = "roygbiv" | "single_hue";

/** A location on either body, as the objective reader or the user named it. */
export interface LocationReference {
  body: Body;
  id: string;
  name: string;
}

/** Everything a reviewed objective settles besides the landing weights. Built
 * by the review UI from `task_interpretation` (direction options resolved,
 * unresolved mentions picked by the user) and applied in ONE store action. */
export interface InterpretationApplication {
  screening?: ScreeningPlan | null;
  task: Task;
  /** Where the user is looking for a location; null falls back to the task's default body. */
  focusBody: Body | null;
  /** Where the mission flies. A Mars mission can look for an Earth test site. */
  missionDestination: Body | null;
  /** The recognised reference site on the OTHER body, or null. */
  reference: LocationReference | null;
  /** Proposed analog-match preferences (shares over the five analog features); null keeps the current ones. */
  analogWeights: Record<string, number> | null;
  /** `objective_hash` of the reading this came from, for stale labels. */
  objectiveHash: string | null;
}

/** Where the applied objective's weights came from. "offline_rule_based" is the
 * client fallback used when POST /mission/interpret could not be reached; it
 * must never be shown as a model interpretation. */
export type ObjectiveSource = "llm" | "rule_based" | "offline_rule_based";

/** What the interpretation said about WHY the applied allocation looks the
 * way it does. Every string is the interpreter's reading of the text, never a
 * scientific finding about a site. */
export interface AppliedInterpretation {
  screening?: ScreeningPlan | null;
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
  /** Research findings cited for each weight, by criterion_id (from the evidence registry). */
  evidence: Record<string, EvidenceCitation[]>;
  /** Research behind each hard constraint, by constraint_id. */
  constraintEvidence: Record<string, EvidenceCitation[]>;
  missionProfile: MissionKind;
  /** The same reading for the Earth factors. */
  earth: { reasons: Record<string, string>; evidence: Record<string, EvidenceCitation[]> } | null;
  /** The Earth <-> Mars cross-reference behind both sets of priorities. */
  analog: AnalogCheck | null;
}

export interface ObjectiveMeta {
  /** `objective_hash` echoed by /mission/interpret; null for a local reading. */
  objectiveHash?: string | null;
  source?: ObjectiveSource;
  model?: string | null;
  interpretation?: AppliedInterpretation | null;
  /** Task / body / reference reading applied together with the weights. */
  taskApplication?: InterpretationApplication | null;
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
  missionType: MissionType;
  setMissionType: (kind: MissionType) => void;
  missionProfileWeights: Record<AssessmentType, Record<string, number>>;
  missionRequirements: Record<Body, MissionRequirements>;
  setMissionProfileWeight: (id: string, value: number) => void;
  resetMissionProfileWeights: () => void;
  /** Earth-mode priorities: the SAME criteria as the Mars landing weights, in shares,
   * with their own values. Terrain and smoothness also drive the Earth site
   * ranking (its slope / relief shares, `missionProfileWeights.rover_field_test`). */
  earthWeights: Record<string, number>;
  /** What the applied mission suggested for Earth; Reset restores it. */
  recommendedEarthWeights: Record<string, number>;
  setEarthWeight: (criterionId: string, share: number) => void;
  resetEarthWeights: () => void;
  /** Apply the reading's Earth weights (normalised to shares) and remember them for Reset. */
  applyEarthSuggestion: (weights: Record<string, number>) => void;
  /** Rank Earth sites by closeness to Mars data: the targets become the paired Mars site's values. */
  /** Rank Earth sites by their analog similarity to this Mars site (null = the slope/relief targets). */
  setEarthReference: (marsSiteId: string | null) => void;
  patchMissionRequirements: (patch: Partial<MissionRequirements>) => void;
  applyTaskObjective: (text: string, weights: Record<string, number>, requirements: Partial<MissionRequirements>) => void;
  missionFocusOverride: Body | null;
  suggestedMissionFocus: Body | null;
  setMissionFocus: (body: Body | null) => void;
  missionDraftDirty: boolean;
  setMissionDraftDirty: (dirty: boolean) => void;
  /** True once a mission has been saved in the Mission Design chat box (the tab opens on the chat box alone until then). */
  missionDesigned: boolean;
  setMissionDesigned: (designed: boolean) => void;
  exploreStage: "mission" | "analogs";
  exploreRevision: number;
  navigateExplore: (stage: "mission" | "analogs", initialMissionId?: string) => void;
  comparison: ComparisonSettings;
  /** The resolved pair currently displayed by Compare, including catalogue defaults. */
  comparisonPair: {earthId: string | null; marsId: string | null} | null;
  setComparisonPair: (pair: {earthId: string | null; marsId: string | null} | null) => void;
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
  /** Which Explore experience is shown. Browse is the default; Find Earth Analogs is the discovery survey. */
  exploreMode: ExploreMode;
  setExploreMode: (mode: ExploreMode) => void;
  /** Jump to Explore in Find Earth Analogs mode (from a region's detail, the Research page or an objective). */
  openFindAnalogs: () => void;

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

  // ---- mission vs view (Earth-Mars release) -------------------------------
  /** What the user is doing. Set by applying a reviewed objective; never by hovering, typing or clicking candidates. */
  task: Task;
  /** Where the mission flies (an Earth analog search for a Mars mission keeps "mars"). */
  missionDestination: Body | null;
  /** Preferred body where the user is looking for a location. */
  selectionBody: Body;
  /** The globe currently shown. Independently overridable from `selectionBody`. */
  viewedBody: Body;
  /** False after a manual body switch, until the user applies another objective or clicks "Follow objective". */
  followObjective: boolean;
  /** Selected location on each body. `selectedSiteId` is kept as the MARS alias for existing code. */
  selectedEarthId: string | null;
  selectedMarsId: string | null;
  /** Select a location on `body`. Never touches the other body's selection or the objective. */
  selectLocation: (body: Body, id: string | null) => void;
  /** Show a body. `{ manual: true }` records a user override (followObjective = false). */
  setViewedBody: (body: Body, opts?: { manual?: boolean }) => void;
  /** Return the view to the applied objective's focus body (and set followObjective = true). */
  followObjectiveNow: () => void;
  /** How the visible globe's candidates are coloured; see `effectiveMapMode`. */
  mapMode: MapMode;
  setMapMode: (mode: MapMode) => void;
  rankPalette: RankPalette;
  setRankPalette: (p: RankPalette) => void;
  /** The applied objective's task reading (null until something is applied). */
  appliedTask: Task | null;
  appliedFocusBody: Body | null;
  appliedMissionDestination: Body | null;
  appliedReference: LocationReference | null;
  /** `objective_hash` of the applied reading, echoed by /mission/interpret (or a local- prefixed hash). */
  appliedObjectiveRequestId: string | null;
  /** Increments every time a reviewed objective is applied; consumers key one-time effects on it. */
  objectiveRevision: number;
  /** Apply a reviewed task reading on its own (applyObjective does this too when meta.taskApplication is set). */
  applyInterpretation: (app: InterpretationApplication) => void;
  /** The applied objective's proposed analog preferences (shares). Reset restores these. */
  recommendedAnalogWeights: Record<string, number> | null;
  /** The analog shares in force the moment the objective was applied. */
  appliedAnalogWeights: Record<string, number> | null;
  /** Replace every analog share at once (normalised to shares over the five features). */
  setAnalogWeights: (weights: Record<string, number>) => void;
  /** One-time best-match hint for the body that has no selection yet; labelled "Suggested reference", never auto-selected. */
  suggestedSelection: { body: Body; id: string; name: string; forReferenceId: string } | null;
  setSuggestedSelection: (s: { body: Body; id: string; name: string; forReferenceId: string } | null) => void;
  /** Jump to Explore showing `body` with `id` selected and the camera flying to it (for the Compare view). */
  showOnGlobe: (body: Body, id: string) => void;

  /** UI prefs */
  autoRotate: boolean;
  setAutoRotate: (v: boolean) => void;
  /** Incremented by the reset-camera button; the globe watches it. */
  cameraResetToken: number;
  requestCameraReset: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  missionType: "landing",
  setMissionType: (kind) => set(s => {
    if (kind === "landing" && s.selectionBody !== "mars") return {};
    return {missionType:kind,exploreStage:"mission",viewedBody:s.selectionBody,mapMode:missionViewMode(s.selectionBody,kind),exploreRevision:s.exploreRevision+1};
  }),
  missionProfileWeights: structuredClone(DEFAULT_PROFILE_WEIGHTS),
  missionRequirements: {earth:defaultRequirements(),mars:defaultRequirements()},
  setMissionProfileWeight: (id,value) => set(s => {
    if(s.missionType === "landing" || !(id in s.missionProfileWeights[s.missionType])) return {};
    return {missionProfileWeights:{...s.missionProfileWeights,[s.missionType]:setShare(s.missionProfileWeights[s.missionType],id,value)}};
  }),
  resetMissionProfileWeights: () => set(s => s.missionType === "landing" ? {} : ({missionProfileWeights:{...s.missionProfileWeights,[s.missionType]:{...DEFAULT_PROFILE_WEIGHTS[s.missionType]}}})),
  earthWeights: {},
  recommendedEarthWeights: {},
  setEarthWeight: (criterionId, share) => set(s => {
    const next = setShare(s.earthWeights, criterionId, share, s.excludedCriteria);
    return next === s.earthWeights ? {} : { earthWeights: next, missionProfileWeights: { ...s.missionProfileWeights, rover_field_test: roverSharesFrom(next) } };
  }),
  resetEarthWeights: () => set(s => ({ earthWeights: { ...s.recommendedEarthWeights }, missionProfileWeights: { ...s.missionProfileWeights, rover_field_test: roverSharesFrom(s.recommendedEarthWeights) } })),
  setEarthReference: (marsSiteId) => set(s => ({ missionRequirements: { ...s.missionRequirements, earth: { ...s.missionRequirements.earth, analog_reference_id: marsSiteId } } })),
  applyEarthSuggestion: (weights) => set(s => {
    const shares = toShares(weights, s.excludedCriteria);
    return { earthWeights: shares, recommendedEarthWeights: { ...shares }, missionProfileWeights: { ...s.missionProfileWeights, rover_field_test: roverSharesFrom(shares) } };
  }),
  patchMissionRequirements: (patch) => set(s => ({missionRequirements:{...s.missionRequirements,[s.selectionBody]:{...s.missionRequirements[s.selectionBody],...patch}}})),
  applyTaskObjective: (text,weights,requirements) => set(s => ({missionObjective:text,appliedObjective:text,missionDraftDirty:false,appliedObjectiveSource:"rule_based",appliedObjectiveModel:null,
    missionProfileWeights:s.missionType === "landing" ? s.missionProfileWeights : {...s.missionProfileWeights,[s.missionType]:weights},
    missionRequirements:{...s.missionRequirements,[s.selectionBody]:{...s.missionRequirements[s.selectionBody],...requirements}},objectiveRevision:s.objectiveRevision+1})),
  missionFocusOverride: null,
  suggestedMissionFocus: null,
  setMissionFocus: (body) => set(s => {
    const focus = body ?? s.suggestedMissionFocus ?? s.selectionBody;
    const kind = missionTypeFor(focus, s.missionType);
    return {missionType:kind,missionFocusOverride: body, selectionBody: focus, appliedFocusBody: focus,
      viewedBody: focus, exploreStage: "mission", followObjective: true,
      mapMode: missionViewMode(focus,kind),
      exploreRevision: s.exploreRevision + 1, selectionRevision: s.selectionRevision + 1, autoRotate: false};
  }),
  missionDraftDirty: false,
  setMissionDraftDirty: (missionDraftDirty) => set({ missionDraftDirty }),
  missionDesigned: false,
  setMissionDesigned: (missionDesigned) => set({ missionDesigned }),
  exploreStage: "mission",
  exploreRevision: 0,
  navigateExplore: (stage, initialMissionId) => set(s => {
    const body = stage === "mission" ? s.selectionBody : otherBody(s.selectionBody);
    const id = selectedIdFor(s, s.selectionBody) ?? initialMissionId;
    return { activeTab: "explore", exploreMode: "browse" as ExploreMode, exploreStage: stage, viewedBody: body, followObjective: stage === "mission",
      mapMode: stage === "mission" ? missionViewMode(s.selectionBody,s.missionType) : "analog_match",
      ...(id ? s.selectionBody === "earth" ? { selectedEarthId: id } : { selectedMarsId: id, selectedSiteId: id } : {}),
      exploreRevision: s.exploreRevision + 1, selectionRevision: s.selectionRevision + 1, autoRotate: false };
  }),
  missionObjective: DEFAULT_MISSION_OBJECTIVE,
  appliedObjective: "",
  recommendedWeights: {},
  objectiveNotes: [],
  appliedObjectiveHash: null,
  appliedObjectiveSource: null,
  appliedObjectiveModel: null,
  appliedInterpretation: null,
  applyObjective: (text, weights, notes, meta) => {
    const state = get();
    const shares = toShares(weights, state.excludedCriteria);
    set({
      missionObjective: text,
      missionDraftDirty: false,
      appliedObjective: text,
      recommendedWeights: shares,
      objectiveNotes: notes,
      weights: { ...shares },
      priorityChange: null,
      appliedObjectiveHash: meta?.objectiveHash ?? null,
      appliedObjectiveSource: meta?.source ?? "offline_rule_based",
      appliedObjectiveModel: meta?.model ?? null,
      appliedInterpretation: meta?.interpretation ?? null,
      ...(meta?.taskApplication ? taskPatch(state, meta.taskApplication) : {appliedTask:null,appliedReference:null}),
    });
  },
  selectionRevision: 0,
  comparisonPair: null,
  setComparisonPair: (comparisonPair) => set({comparisonPair}),
  comparison: { mode: "all", earthId: "haughton_crater", moonId: "apollo_11", section: "all", details: false },
  setComparison: (patch) => set(s => ({ comparison: { ...s.comparison, ...patch } })),
  // Home explains the purpose and offers entry points; mission drafts and selections survive returning.
  activeTab: "home",
  setActiveTab: (tab) => set({ activeTab: tab }),
  // Explore opens on Browse Regions (established analogs, mission scoring); Find Unresearched Analogs is one switch away
  exploreMode: "browse",
  setExploreMode: (exploreMode) => set({ exploreMode }),
  openFindAnalogs: () => set({ activeTab: "explore", exploreMode: "find_analogs" }),

  selectedSiteId: null,
  selectSite: (id) => get().selectLocation("mars", id),

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
      return { excludedCriteria: [...ids], weights: renorm(s.weights), recommendedWeights: renorm(s.recommendedWeights), earthWeights: renorm(s.earthWeights), recommendedEarthWeights: renorm(s.recommendedEarthWeights) };
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
  // A slider move keeps the five analog shares summing to 100 (lib/allocation).
  setAnalogWeight: (featureId, weight) =>
    set((s) => {
      if (!ANALOG_FEATURE_IDS.includes(featureId)) return {};
      const current = toAnalogShares(s.analogWeights);
      const next = setShare(current, featureId, clamp(weight));
      return next === current ? {} : { analogWeights: next };
    }),
  setAnalogWeights: (weights) => set({ analogWeights: toAnalogShares(weights) }),
  /** Restore the applied objective's recommended analog preferences; spec defaults if none was applied. */
  resetAnalogWeights: () => set((s) => ({ analogWeights: s.recommendedAnalogWeights ? { ...s.recommendedAnalogWeights } : null })),
  recommendedAnalogWeights: null,
  appliedAnalogWeights: null,

  task: "landing_screening",
  missionDestination: "mars",
  selectionBody: "mars",
  viewedBody: "mars",
  followObjective: true,
  selectedEarthId: null,
  selectedMarsId: null,
  selectLocation: (body, id) =>
    set((s) => {
      const patch: Partial<AppState> = body === "earth" ? { selectedEarthId: id } : { selectedMarsId: id, selectedSiteId: id };
      // the user picked on this body, so any seeded hint for it is moot
      if (s.suggestedSelection?.body === body) patch.suggestedSelection = null;
      return { ...patch, selectionRevision: s.selectionRevision + 1, autoRotate: id ? false : s.autoRotate };
    }),
  setViewedBody: (body, opts) =>
    set((s) => {
      if (s.viewedBody === body && !opts?.manual) return {};
      return { viewedBody: body, ...(opts?.manual ? { followObjective: false } : {}) };
    }),
  followObjectiveNow: () => set((s) => ({ viewedBody: s.appliedFocusBody ?? s.selectionBody, followObjective: true })),
  mapMode: "landing_suitability",
  setMapMode: (mapMode) => set({ mapMode }),
  rankPalette: "roygbiv",
  setRankPalette: (rankPalette) => set({ rankPalette }),
  appliedTask: null,
  appliedFocusBody: null,
  appliedMissionDestination: null,
  appliedReference: null,
  appliedObjectiveRequestId: null,
  objectiveRevision: 0,
  applyInterpretation: (app) => set((s) => taskPatch(s, app)),
  suggestedSelection: null,
  setSuggestedSelection: (suggestedSelection) => set({ suggestedSelection }),
  showOnGlobe: (body, id) =>
    set((s) => ({
      activeTab: "explore",
      viewedBody: body,
      exploreStage: body === s.selectionBody ? "mission" : "analogs",
      mapMode: body === s.selectionBody ? missionViewMode(body,s.missionType) : "analog_match",
      // a request to look at a body other than the objective's is an override
      followObjective: s.appliedFocusBody == null || s.appliedFocusBody === body ? s.followObjective : false,
      ...(body === "earth" ? { selectedEarthId: id } : { selectedMarsId: id, selectedSiteId: id }),
      selectionRevision: s.selectionRevision + 1,
      autoRotate: false,
    })),

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

/** The patch a reviewed objective applies, once. It sets the task, where to
 * look, where the mission flies, the reference (selecting it on its own body)
 * and the analog preferences. Nothing else in the store ever writes these. */
/** The Earth site ranking scores regional slope and relief: their shares follow
 * the Earth "Low slopes" and "Less rugged ground" priorities. */
export function roverSharesFrom(earth: Record<string, number>): Record<string, number> {
  const slope = earth.terrain_safety ?? 0, relief = earth.surface_roughness ?? 0;
  return slope + relief > 0 ? toShares({ slope, relief }) : { ...DEFAULT_PROFILE_WEIGHTS.rover_field_test };
}

/** Mars means Mars landing screening; Earth means a field-test site (rover
 * field testing unless an Earth profile is already chosen). Switching planet
 * therefore always switches the mission view, in both directions. */
function missionTypeFor(focus: Body, current: MissionType): MissionType {
  if(current === "research" || current === "base_planning")return current;
  if (focus === "mars") return "landing";
  return current === "landing" ? "rover_field_test" : current;
}

function taskPatch(s: AppState, app: InterpretationApplication): Partial<AppState> {
  const suggestedFocus: Body = app.focusBody ?? (app.task === "landing_screening" ? "mars" : app.reference ? otherBody(app.reference.body) : s.selectionBody);
  const focus = app.screening?.body ?? s.missionFocusOverride ?? suggestedFocus;
  const kind = app.screening?.mission_type ?? missionTypeFor(focus, s.missionType);
  const analog = app.analogWeights ? toAnalogShares(app.analogWeights) : null;
  const patch: Partial<AppState> = {
    missionType: kind,
    ...(app.screening ? {
      missionFocusOverride:null,
      missionRequirements:{...s.missionRequirements,[focus]:{...defaultRequirements(),...app.screening.requirements}},
      ...(kind!=="landing" && Object.values(app.screening.weights).some(w=>w>0) ? {missionProfileWeights:{...s.missionProfileWeights,[kind]:{...app.screening.weights}}} : {}),
    } : {}),
    suggestedMissionFocus: suggestedFocus,
    task: app.task,
    missionDestination: app.missionDestination ?? (app.task === "landing_screening" ? "mars" : s.missionDestination),
    selectionBody: focus,
    exploreStage: "mission",
    viewedBody: focus,
    followObjective: true,
    mapMode: missionViewMode(focus,kind),
    appliedTask: app.task,
    appliedFocusBody: focus,
    appliedMissionDestination: app.missionDestination ?? null,
    appliedReference: app.reference,
    appliedObjectiveRequestId: app.objectiveHash,
    objectiveRevision: s.objectiveRevision + 1,
    suggestedSelection: null,
  };
  if (analog) {
    patch.recommendedAnalogWeights = analog;
    patch.appliedAnalogWeights = { ...analog };
    patch.analogWeights = { ...analog };
  }
  if (app.reference) {
    if (app.reference.body === "earth") patch.selectedEarthId = app.reference.id;
    else { patch.selectedMarsId = app.reference.id; patch.selectedSiteId = app.reference.id; }
    patch.selectionRevision = s.selectionRevision + 1;
  }
  return patch;
}

/** Landing colours only exist on Mars; everywhere else the globe is in analog mode. */
export function effectiveMapMode(s: Pick<AppState, "viewedBody" | "mapMode">): MapMode {
  return s.mapMode === "mission_browse" ? "mission_browse" : s.viewedBody === "mars" ? s.mapMode : "analog_match";
}

/** The reference for ranking the VIEWED body's candidates: the selected location on the other body. */
export function referenceIdFor(s: Pick<AppState, "viewedBody" | "selectedEarthId" | "selectedMarsId">): string | null {
  return s.viewedBody === "earth" ? s.selectedMarsId : s.selectedEarthId;
}

/** The selected id on `body`. */
export function selectedIdFor(s: Pick<AppState, "selectedEarthId" | "selectedMarsId">, body: Body): string | null {
  return body === "earth" ? s.selectedEarthId : s.selectedMarsId;
}
