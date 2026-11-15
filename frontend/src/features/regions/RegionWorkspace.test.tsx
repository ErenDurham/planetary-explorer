import { useDiscoveryStore } from "@/features/discovery/store/useDiscoveryStore";
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RegionWorkspace } from "./RegionWorkspace";
import { useRegionTarget } from "./store";
import { useAppStore } from "@/store/useAppStore";
import { detail, candidates } from "@/features/discovery/test/fixtures";
const mock=vi.hoisted(()=>({detail:vi.fn(),export:vi.fn(),comparisonCatalog:vi.fn()}));
vi.mock("@/services/discoveryEngine",()=>({discoveryEngine:mock}));
vi.mock("@/services/api",()=>({api:mock,isApiError:()=>false}));
afterEach(()=>{vi.clearAllMocks();useRegionTarget.setState({target:null});});
function mount(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><RegionWorkspace target={{kind:"discovered",runId:"run",id:candidates[0].id}} compare/></QueryClientProvider>);}
it("compares a discovered region with its processed reference and a catalog region through one table",async()=>{
 const candidate=detail(candidates[0].id);
 mock.detail.mockResolvedValue(candidate);
 mock.export.mockResolvedValue({reference_profile:candidate.profile,provenance:[],audit_rows:[{candidate,profile:candidate.profile,screening_reasons:[]}]});
 mock.comparisonCatalog.mockResolvedValue({locations:[{id:"known",name:"Known Earth",body:"earth",lat:0,lon_east:0,coverage:"catalog",measurements:[],sources:{}}]});
 mount();
 await screen.findByRole("region",{name:"Region measurements"});
 expect(screen.getByLabelText("Comparison region")).toHaveValue("reference:run");
 expect(mock.detail).toHaveBeenCalledWith("run",candidates[0].id,expect.anything());
 fireEvent.change(screen.getByLabelText("Comparison region"),{target:{value:"catalog:known"}});
 expect(screen.getByText(/Different footprints and processing methods/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Analyze selected region"}));
 expect(useAppStore.getState().activeTab).toBe("analyze");
 fireEvent.click(screen.getByRole("button",{name:"Back to Explore"}));
 expect(useDiscoveryStore.getState().runs.run.selectedCandidateId).toBe(candidates[0].id);
 expect(useAppStore.getState().exploreMode).toBe("find_analogs");
});
it("shows a failed candidate load honestly and does not substitute a curated site",async()=>{
 mock.detail.mockRejectedValue(new Error("Artifact unavailable"));mock.export.mockRejectedValue(new Error("Artifact unavailable"));mock.comparisonCatalog.mockResolvedValue({locations:[]});
 mount();
 await waitFor(()=>expect(screen.getByText(/Artifact unavailable/)).toBeInTheDocument());
 expect(screen.queryByRole("region",{name:"Region measurements"})).toBeNull();
});
