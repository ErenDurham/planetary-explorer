import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MissionScoringPanel } from "./MissionScoringPanel";
import { MissionFocus } from "./MissionFocus";
import { useAppStore } from "@/store/useAppStore";
import catalog from "@/test/fixtures/comparison_catalog.json";
import fixture from "@/test/fixtures/mission_assessment.json";
let requests:Array<Record<string,any>>=[];
beforeEach(()=>{
 useAppStore.setState(useAppStore.getInitialState(),true);useAppStore.getState().setMissionFocus("earth");requests=[];
 vi.spyOn(globalThis,"fetch").mockImplementation(async(input,init)=>{
  if(String(input).endsWith("/comparison/catalog"))return new Response(JSON.stringify(catalog));
  const req=JSON.parse(String(init?.body));requests.push(req);
  const data=req.mission_type==="research"?(req.requirements.material_targets?.length?fixture.research:fixture.research_empty):fixture.earth;
  return new Response(JSON.stringify({...data,client_request_id:req.client_request_id}));
 });
});
afterEach(()=>vi.restoreAllMocks());
function mount(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MissionFocus/><MissionScoringPanel/></QueryClientProvider>);}
describe("task mission scoring controls",()=>{
 it("sends task-specific shares and numeric targets without modifying analog or landing priorities",async()=>{
  const landing=structuredClone(useAppStore.getState().weights);mount();
  await screen.findByText(/current top match to your mission requirements/);
  expect(requests[0]).toMatchObject({body:"earth",mission_type:"rover_field_test",weights:{slope:50,relief:50}});
  fireEvent.change(screen.getByLabelText("Target regional slope mission priority"),{target:{value:"70"}});
  fireEvent.change(screen.getByLabelText("Target regional slope (°)"),{target:{value:"3"}});
  await waitFor(()=>expect(requests.at(-1)).toMatchObject({weights:{slope:70,relief:30},requirements:{slope_target_deg:3}}));
  expect(useAppStore.getState().weights).toEqual(landing);expect(useAppStore.getState().analogWeights).toBeNull();
 });
 it("requires research targets and sends the user's selected material vocabulary",async()=>{
  useAppStore.getState().setMissionType("research");mount();
  expect(await screen.findByText(/Select at least one research target/)).toBeInTheDocument();
  const box=await screen.findByRole("checkbox",{name:"Carbonates"});fireEvent.click(box);
  await waitFor(()=>expect(requests.at(-1)).toMatchObject({mission_type:"research",requirements:{material_targets:["carbonates"]}}));
  expect(useAppStore.getState().missionRequirements.earth.material_targets).toEqual(["carbonates"]);
  expect(useAppStore.getState().missionRequirements.mars.material_targets).toEqual([]);
 });
});
