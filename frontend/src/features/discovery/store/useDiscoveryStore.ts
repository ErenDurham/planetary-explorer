// Run-scoped UI state for discovery. Independent of the app store's curated
// selections: a discovery candidate id is never written to selectedEarthId,
// and curated analog weights are never read here.
import { create } from "zustand";
import type { DiscoveryCandidate } from "../adapter";
import type { Shares } from "@/lib/allocation";
import { TOP_K_DEFAULT, clampTopK, setDiscoveryShare, sharesFromDefaults } from "../lib/weights";

export type DiscoveryMapView = "map" | "globe";

interface RunState {
  /** The user asked for this run to be ranked (ranking is never automatic on load). */
  ranked: boolean;
  selectedCandidateId: string | null;
  shortlist: DiscoveryCandidate[];
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
  toggleShortlist: (candidate: DiscoveryCandidate) => void;
}

const EMPTY_RUN: RunState = { ranked: false, selectedCandidateId: null, shortlist: [] };

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
  toggleShortlist: (candidate) => {
    const { runId } = get(); if (!runId) return;
    set(s => {
      const run = s.runs[runId] ?? EMPTY_RUN, saved = run.shortlist ?? [];
      const exists = saved.some(c => c.id === candidate.id);
      if (!exists && saved.length >= 3) return {};
      return { runs: { ...s.runs, [runId]: { ...run, shortlist: exists ? saved.filter(c => c.id !== candidate.id) : [...saved, candidate] } } };
    });
  },
  selectCandidate: (id) => { const { runId } = get(); if (runId) set((s) => ({ runs: { ...s.runs, [runId]: { ...(s.runs[runId] ?? EMPTY_RUN), selectedCandidateId: id } } })); },
}));

export function useRunState(): RunState {
  return useDiscoveryStore((s) => (s.runId ? s.runs[s.runId] : undefined) ?? EMPTY_RUN);
}
