import { StageButton } from "@/components/ui/StageButton";
import { useAppStore } from "@/store/useAppStore";
import { useRegionTarget } from "./store";
import type { RegionTarget } from "./model";
/** One entry point for catalog locations and run-scoped discovered footprints. */
export function RegionActions({target,compact=false}: {target:RegionTarget|null;compact?:boolean}) {
  const open=useRegionTarget(s=>s.open);
  const setTab=useAppStore(s=>s.setActiveTab);
  return <div role="group" aria-label="Selected region actions" className={compact ? "ml-auto flex flex-wrap gap-2" : "mt-3 flex flex-wrap gap-3"}>{(["analyze","compare"] as const).map(tab=><StageButton key={tab} size={compact ? "compact" : "default"} disabled={!target} onClick={()=>{if(target){open(target);setTab(tab);}}}>{tab==="analyze"?"Analyze region":"Compare region"}</StageButton>)}</div>;
}
