import type { ComparisonCatalog } from "@/types";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { render,screen } from "@testing-library/react";
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
it("shows missing found artifacts without substituting a curated region",async()=>{
 setDiscoveryService(connectedService());vi.mocked(discoveryEngine.export).mockRejectedValue(new Error("Survey missing"));mount();
 await screen.findByText("Survey missing");
 expect(screen.getByRole("status")).toHaveTextContent("Selected region unavailable");
 expect(screen.queryByRole("region",{name:"Decision summary"})).toBeNull();
});
