import { CompareView } from "@/components/layout/CompareView";
import type { Site } from "@/types";

/** Every location uses the original comparative field atlas. */
export function CompareEntry({sites,selectedId}:{sites:Site[]|undefined;selectedId:string|null}) {
  return <CompareView sites={sites} selectedId={selectedId}/>;
}
