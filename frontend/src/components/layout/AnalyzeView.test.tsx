import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fixture from "@/test/fixtures/api_examples.json";
import { AnalyzeView } from "./AnalyzeView";
import { useAppStore } from "@/store/useAppStore";
import type { EvaluateResponse, Site } from "@/types";
const evaluation=fixture.evaluate as unknown as EvaluateResponse;
const selected=evaluation.results[0];
const point=(delta:number)=>({delta_pp:delta,share:.27+delta/100,focus_status:"ok",focus_rank:1,focus_score:97.8,leader_site_name:selected.site_name});
const response={too_few_active:false,range_pp:5,step_pp:1,sweeps:[{criterion_id:"terrain_safety",label:"Regional slope",note:"Rank 1 within the tested range.",focus_rank_min:1,focus_rank_max:1,focus_rank_stable:true,leader_stable:true,points:[point(-5),point(0),point(5)],breakpoints:[]}]};
beforeEach(()=>useAppStore.setState({...useAppStore.getInitialState(),appliedObjective:"Safe landing",missionObjective:"Safe landing",weights:{terrain_safety:27},recommendedWeights:{terrain_safety:27}}));
afterEach(()=>vi.restoreAllMocks());
describe("selected site analysis",()=>{
  it("runs a read-only sensitivity sandbox with the same mission and candidate set",async()=>{
    let payload:Record<string,unknown>|null=null;
    vi.spyOn(globalThis,"fetch").mockImplementation(async(input,init)=>{
      if(String(input).endsWith("/scoring/sensitivity")){payload=JSON.parse(String(init?.body));return new Response(JSON.stringify(response));}
      return new Response(JSON.stringify(fixture.site));
    });
    const before=structuredClone(useAppStore.getState().weights);
    render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><AnalyzeView sites={[fixture.site.site as Site]} evaluation={evaluation} selectedId={selected.site_id} onSelect={vi.fn()}/></QueryClientProvider>);
    expect(payload).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Run sensitivity test"}));
    expect(await screen.findByText(/Rank 1 throughout/)).toBeInTheDocument();
    expect(payload).toMatchObject({mission:evaluation.mission,focus_site_id:selected.site_id,site_ids:evaluation.results.map(r=>r.site_id)});
    fireEvent.change(screen.getByLabelText(/percentage points ·/),{target:{value:"2"}});
    expect(useAppStore.getState().weights).toEqual(before);
    fireEvent.click(screen.getByRole("button",{name:"Return to applied allocation"}));
    expect(screen.getByLabelText(/percentage points ·/)).toHaveValue("1");
    expect(useAppStore.getState().weights).toEqual(before);
  });
});
