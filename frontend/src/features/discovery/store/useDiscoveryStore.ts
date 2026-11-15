// Run-scoped UI state for discovery. Independent of the app store's curated
// selections: a discovery candidate id is never written to selectedEarthId,
// and curated analog weights are never read here.
import { create } from "zustand";
import type { Shares } from "@/lib/allocation";
import { TOP_K_DEFAULT, clampTopK, setDiscoveryShare, sharesFromDefaults } from "../lib/weights";

export type DiscoveryMapView = "map" | "globe";

interface RunState {
  /** The user asked for this run to be ranked (ranking is never automatic on load). */
  ranked: boolean;
  selectedCandidateId: string | null;
  /** The first result was selected once when the first ranking arrived; never repeated, so a cleared or changed selection stays. */
  autoSelected: boolean;
}

interface DiscoveryState {
  runId: string | null;
  weights: Shares;
  /** Shares the capabilities call declared as defaults; Reset restores them. */
  defaultWeights: Shares;
  topK: number;
  view: DiscoveryMapView;
  /** Bumped on every non-null selection; the globe reads it as its focus token so re-selecting the same candidate flies to it again. */
  selectionRevision: number;
  runs: Record<string, RunState>;
  setRun: (runId: string | null) => void;
  seedDefaults: (defaults: Record<string, number> | undefined) => void;
  setWeight: (id: string, value: number) => void;
  resetWeights: () => void;
  setTopK: (n: number) => void;
  setView: (v: DiscoveryMapView) => void;
  requestRank: () => void;
  selectCandidate: (id: string | null) => void;
  /** Select the first result once per run; a no-op when something is already selected or it has run before. */
  autoSelectFirst: (id: string) => void;
}

const EMPTY_RUN: RunState = { ranked: false, selectedCandidateId: null, autoSelected: false };

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  runId: null,
  weights: sharesFromDefaults(undefined),
  defaultWeights: sharesFromDefaults(undefined),
  topK: TOP_K_DEFAULT,
  view: "globe",
  selectionRevision: 0,
  runs: {},
  setRun: (runId) => set((s) => ({ runId, runs: runId && !s.runs[runId] ? { ...s.runs, [runId]: { ...EMPTY_RUN } } : s.runs })),
  seedDefaults: (defaults) => set((s) => {
    const next = sharesFromDefaults(defaults);
    const untouched = JSON.stringify(s.weights) === JSON.stringify(s.defaultWeights);
    return { defaultWeights: next, weights: untouched ? { ...next } : s.weights };
  }),
  setWeight: (id, value) => set((s) => { const next = setDiscoveryShare(s.weights, id, value); return next === s.weights ? {} : { weights: next }; }),
  resetWeights: () => set((s) => ({ weights: { ...s.defaultWeights } })),
  setTopK: (n) => set({ topK: clampTopK(n) }),
  setView: (view) => set({ view }),
  requestRank: () => { const { runId } = get(); if (runId) set((s) => ({ runs: { ...s.runs, [runId]: { ...(s.runs[runId] ?? EMPTY_RUN), ranked: true } } })); },
  selectCandidate: (id) => { const { runId } = get(); if (runId) set((s) => ({ selectionRevision: id ? s.selectionRevision + 1 : s.selectionRevision, runs: { ...s.runs, [runId]: { ...(s.runs[runId] ?? EMPTY_RUN), selectedCandidateId: id, autoSelected: true } } })); },
  autoSelectFirst: (id) => { const { runId } = get(); if (!runId) return; set((s) => { const r = s.runs[runId] ?? EMPTY_RUN; if (r.autoSelected || r.selectedCandidateId) return {}; return { selectionRevision: s.selectionRevision + 1, runs: { ...s.runs, [runId]: { ...r, selectedCandidateId: id, autoSelected: true } } }; }); },
}));

export function useRunState(): RunState {
  return useDiscoveryStore((s) => (s.runId ? s.runs[s.runId] : undefined) ?? EMPTY_RUN);
}
