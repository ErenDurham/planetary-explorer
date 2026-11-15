import type { ReactNode } from "react";
import { ContourArtwork } from "@/components/atlas/AtlasSurface";
/** The original analysis-page heading, shared by every region source. */
export function AnalysisHeader({description,children}:{description:string;children:ReactNode}){
 return <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><ContourArtwork/><div><h1 className="text-xl font-semibold">Site analysis</h1><p className="mt-1 text-sm text-fg-muted">{description}</p></div>{children}</div>;
}
