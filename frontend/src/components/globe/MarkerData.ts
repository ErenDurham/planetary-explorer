// The viewer is deliberately decoupled from the API types: the layout turns
// sites + the current evaluation (landing mode) or the current analog ranking
// (analog mode) into this flat list. One shape serves both bodies and both
// modes; `mode` says which numbers are meaningful.
import type { MarkerAppearance } from "./colors";
import type { SuitabilityStatus } from "@/types";

export type MarkerMode = "landing" | "analog" | "browse" | "mission";

export interface MarkerDatum {
  id: string;
  name: string;
  region: string;
  lat: number;
  lonEast: number;
  /** Which encoding this marker carries. Landing markers never show on Earth. */
  mode: MarkerMode;
  /** Landing mode: relative suitability index 0..100. Analog mode: null. */
  score: number | null;
  /** Landing rank, or analog match rank (1 = strongest). null = unranked. */
  rank: number | null;
  /** Landing mode only. */
  status: SuitabilityStatus | null;
  /** Analog mode only: similarity index 0..100. */
  similarity: number | null;
  /** Analog mode only: why the candidate could not be ranked. */
  unrankableReason: string | null;
  appearance: MarkerAppearance;
}
