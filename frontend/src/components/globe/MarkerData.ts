// The viewer is deliberately decoupled from the API types: the layout turns
// sites + the current evaluation into this flat list.
import type { MarkerAppearance } from "./colors";
import type { SuitabilityStatus } from "@/types";

export interface MarkerDatum {
  id: string;
  name: string;
  region: string;
  lat: number;
  lonEast: number;
  score: number | null;
  rank: number | null;
  status: SuitabilityStatus | null;
  appearance: MarkerAppearance;
}
