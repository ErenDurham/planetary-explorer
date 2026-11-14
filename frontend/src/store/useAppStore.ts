// Zustand store: synchronous UI state shared across panels. Server data lives
// in TanStack Query (src/hooks), and camera/hover state stays inside the R3F
// tree (src/components/globe) so it never forces a React re-render per frame.
import { create } from "zustand";
import type { HardConstraint } from "@/types";

export type Tab = "explore" | "analyze" | "compare";

export interface AppState {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;

  selectedSiteId: string | null;
  selectSite: (id: string | null) => void;

  /** Slider weights by criterion_id, 0..100. Empty until /scoring/default-mission loads. */
  weights: Record<string, number>;
  setWeight: (criterionId: string, weight: number) => void;
  setWeights: (weights: Record<string, number>) => void;
  /** Hard constraints from the default mission (v1 does not edit them, but they are sent back verbatim). */
  hardConstraints: HardConstraint[];
  setHardConstraints: (c: HardConstraint[]) => void;
  /** Default weights captured on first load so "reset" needs no refetch. */
  defaultWeights: Record<string, number>;
  setDefaultWeights: (weights: Record<string, number>) => void;
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
  activeTab: "explore",
  setActiveTab: (tab) => set({ activeTab: tab }),

  selectedSiteId: null,
  selectSite: (id) => set({ selectedSiteId: id }),

  weights: {},
  setWeight: (criterionId, weight) =>
    set((s) => ({ weights: { ...s.weights, [criterionId]: clamp(weight) } })),
  setWeights: (weights) => set({ weights }),
  hardConstraints: [],
  setHardConstraints: (hardConstraints) => set({ hardConstraints }),
  defaultWeights: {},
  setDefaultWeights: (defaultWeights) => set({ defaultWeights }),
  resetWeights: () => set({ weights: { ...get().defaultWeights } }),

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
