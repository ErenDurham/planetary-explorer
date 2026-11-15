import { create } from "zustand";
import type { RegionTarget } from "./model";
interface State { target: RegionTarget | null; catalogTools: boolean; open: (target: RegionTarget) => void; clear: () => void; choose: () => void }
export const useRegionTarget = create<State>(set => ({target:null,catalogTools:false,open:target=>set({target,catalogTools:false}),clear:()=>set({target:null,catalogTools:true}),choose:()=>set({target:null,catalogTools:false})}));
