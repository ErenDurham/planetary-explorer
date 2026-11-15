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
}

interface DiscoveryState {
  runId: string | null;
  weights: Shares;
  /** Shares the capabilities call declared as defaults; Reset restores them. */
  defaultWeights: Shares;
  topK: number;
  view: DiscoveryMapView;
  runs: Record<string, RunState>;
  setRun: (runId: string | null) => void;
  seedDefaults: (defaults: Record<string, number> | undefined) => void;
  setWeight: (id: string, value: number) => void;
  resetWeights: () => void;
  setTopK: (n: number) => void;
  setView: (v: DiscoveryMapView) => void;
  requestRank: () => void;
  selectCandidate: (id: string | null) => void;
}

const EMPTY_RUN: RunState = { ranked: false, selectedCandidateId: null };

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  runId: null,
  weights: sharesFromDefaults(undefined),
  defaultWeights: sharesFromDefaults(undefined),
  topK: TOP_K_DEFAULT,
  view: "map",
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
  selectCandidate: (id) => { const { runId } = get(); if (runId) set((s) => ({ runs: { ...s.runs, [runId]: { ...(s.runs[runId] ?? EMPTY_RUN), selectedCandidateId: id } } })); },
}));

export function useRunState(): RunState {
  return useDiscoveryStore((s) => (s.runId ? s.runs[s.runId] : undefined) ?? EMPTY_RUN);
}
