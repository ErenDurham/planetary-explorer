import { create } from "zustand";
import type { RegionTarget } from "./model";
interface State { target: RegionTarget | null; open: (target: RegionTarget) => void; clear: () => void }
export const useRegionTarget = create<State>(set => ({target:null,open:target=>set({target}),clear:()=>set({target:null})}));
