import { useAppStore } from "@/store/useAppStore";
import { useRegionTarget } from "./store";
import type { RegionTarget } from "./model";
/** One entry point for catalog locations and run-scoped discovered footprints. */
export function RegionActions({target}: {target:RegionTarget|null}) {
  const open=useRegionTarget(s=>s.open);
  const setTab=useAppStore(s=>s.setActiveTab);
  return <div className="mt-3 flex flex-wrap gap-3">{(["analyze","compare"] as const).map(tab=><button key={tab} type="button" disabled={!target} className="rounded border border-line-strong px-3 py-2 text-sm text-info disabled:opacity-40" onClick={()=>{if(target){open(target);setTab(tab);}}}>{tab==="analyze"?"Analyze region":"Compare region"}</button>)}</div>;
}
