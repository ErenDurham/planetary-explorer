import type { ComparisonCatalog } from "@/types";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { fireEvent,render,screen,waitFor } from "@testing-library/react";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { RegionAnalysis } from "./RegionAnalysis";
import { useRegionTarget } from "./store";
import { useDiscoveryStore } from "@/features/discovery/store/useDiscoveryStore";
import { discoveryEngine } from "@/services/discoveryEngine";
import { api } from "@/services/api";
import { discoveryService,setDiscoveryService } from "@/features/discovery/adapter";
import { capabilities,candidates,detail,exportPayload,connectedService } from "@/features/discovery/test/fixtures";
import catalog from "@/test/fixtures/comparison_catalog.json";
const original=discoveryService();
beforeEach(()=>{
 useDiscoveryStore.setState(useDiscoveryStore.getInitialState(),true);
 useRegionTarget.getState().open({kind:"discovered",id:candidates[1].id,runId:capabilities.runs[0].run_id});
 vi.spyOn(discoveryEngine,"capabilities").mockResolvedValue(capabilities);
 vi.spyOn(discoveryEngine,"export").mockResolvedValue({...exportPayload,reference_profile:detail(candidates[0].id).profile!,audit_rows:candidates.map(candidate=>({candidate,profile:detail(candidate.id).profile,screening_reasons:[]}))});
 vi.spyOn(api,"comparisonCatalog").mockResolvedValue(catalog as unknown as ComparisonCatalog);
});
afterEach(()=>{vi.restoreAllMocks();setDiscoveryService(original);useRegionTarget.setState(useRegionTarget.getInitialState(),true);});
function mount(){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><RegionAnalysis target={useRegionTarget.getState().target!}/></QueryClientProvider>);}
it("uses the original analysis structure for a found region and reranks through the backend when weights change",async()=>{
 const service=connectedService();setDiscoveryService(service);mount();
 expect(screen.getByRole("heading",{name:"Site analysis"})).toBeInTheDocument();
 await screen.findByRole("region",{name:"Decision summary"});
 expect(screen.getByRole("heading",{name:"What helps and what costs points?"})).toBeInTheDocument();
 expect(screen.getByRole("heading",{name:"Why this region rather than another?"})).toBeInTheDocument();
 expect(screen.getByRole("heading",{name:"How sensitive is this choice?"})).toBeInTheDocument();
 await waitFor(()=>expect(service.calls).toHaveLength(1));
 fireEvent.change(screen.getByRole("slider",{name:/Detrended regional relief weight share/}),{target:{value:"80"}});
 await waitFor(()=>expect(service.calls).toHaveLength(2));
 // one share moves to 80 and the rest rebalance to the remaining 20, whatever the basis holds
 const sent=service.calls[1].weights as Record<string,number>;
 expect(sent.roughness_regional_m).toBe(80);
 expect(Object.entries(sent).filter(([id])=>id!=="roughness_regional_m").reduce((total,[,v])=>total+v,0)).toBe(20);
 expect(screen.queryByText("A shared measurement workspace for discovered and catalog regions.")).toBeNull();
 expect(screen.getAllByRole("button",{name:"Research this candidate"})).toHaveLength(1);
});
it("shows missing found artifacts without substituting a curated region",async()=>{
 setDiscoveryService(connectedService());vi.mocked(discoveryEngine.export).mockRejectedValue(new Error("Survey missing"));mount();
 await screen.findByText("Survey missing");
 expect(screen.getByRole("status")).toHaveTextContent("Selected region unavailable");
 expect(screen.queryByRole("region",{name:"Decision summary"})).toBeNull();
});
