import { StageButton } from "@/components/ui/StageButton";
import { useAppStore } from "@/store/useAppStore";
import { useRegionTarget } from "./store";
import type { RegionTarget } from "./model";
/** One entry point for catalog locations and run-scoped discovered footprints. */
export function RegionActions({target}: {target:RegionTarget|null}) {
  const open=useRegionTarget(s=>s.open);
  const setTab=useAppStore(s=>s.setActiveTab);
  return <div className="mt-3 flex flex-wrap gap-3">{(["analyze","compare"] as const).map(tab=><StageButton key={tab} disabled={!target} onClick={()=>{if(target){open(target);setTab(tab);}}}>{tab==="analyze"?"Analyze region":"Compare region"}</StageButton>)}</div>;
}
