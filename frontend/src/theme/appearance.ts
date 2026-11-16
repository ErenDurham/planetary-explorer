import {create} from "zustand";
export type Appearance = "dark" | "light";
const key = "planetary-appearance";
function savedMode(): Appearance { try { return localStorage.getItem(key) === "light" ? "light" : "dark"; } catch { return "dark"; } }
/** Appearance stays separate from scientific state and does not remount the app. */
export const useAppearance = create<{mode:Appearance; toggle:()=>void}>((set)=>({
 mode:savedMode(),
 toggle:()=>set(s=>{const mode=s.mode === "dark" ? "light" : "dark";try{localStorage.setItem(key,mode);}catch{/* Storage may be unavailable. */}return {mode};}),
}));
