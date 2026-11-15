import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fixture from "@/test/fixtures/api_examples.json";
import { useAppStore } from "@/store/useAppStore";
import { PrioritySliders } from "./PrioritySliders";
import { marsFactors } from "./priorityFactors";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import type { DefaultMissionResponse, EvaluateResponse } from "@/types";
const defaults=fixture.default_mission as unknown as DefaultMissionResponse;
const start={terrain_safety:27,elevation_suitability:19,surface_roughness:23,thermal_conditions:0,solar_illumination:31};
function Connected(){const w=useAppStore(s=>s.weights);const ex=useAppStore(s=>s.excludedCriteria);const st=useAppStore.getState();return <PrioritySliders factors={marsFactors(defaults.criteria,ex)} shares={w} onChange={st.setWeight} onBegin={st.beginPriorityChange} onReset={st.resetWeights}/>;}
const mount=()=>render(<Connected/>);
beforeEach(()=>useAppStore.setState({...useAppStore.getInitialState(),defaultWeights:{...start},weights:{...start},recommendedWeights:{...start},appliedObjective:"Safe landing with solar energy"}));
afterEach(()=>vi.restoreAllMocks());
describe("Priority shares",()=>{
  it("keeps shares at 100 and Reset restores the suggestion, without any network request",()=>{
    const fetchSpy=vi.spyOn(globalThis,"fetch");
    mount();const slider=screen.getByLabelText("Gentler terrain share of priorities");
    fireEvent.pointerDown(slider);
    for(const v of [30,35,40])fireEvent.change(slider,{target:{value:String(v)}});
    expect(Object.values(useAppStore.getState().weights).reduce((a,b)=>a+b,0)).toBe(100);
    expect(useAppStore.getState().priorityChange?.previous).toEqual(start);
    fireEvent.click(screen.getByRole("button",{name:"Reset priorities to the applied objective's suggestion"}));
    expect(useAppStore.getState().weights).toEqual(start);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("shows only the scorable factors, with no allocation bar, subtitle, recommendation or rule-based labels",()=>{
    useAppStore.setState({excludedCriteria:["thermal_conditions"]});
    mount();
    expect(screen.getAllByRole("slider")).toHaveLength(4);
    expect(screen.queryByLabelText("Thermal conditions share of priorities")).toBeNull();
    expect(screen.queryByText(/Unavailable/)).toBeNull();
    expect(screen.queryByText(/Shares total 100%/)).toBeNull();
    expect(screen.queryByTestId("recommendation-card")).toBeNull();
    expect(screen.queryByRole("img",{name:/^Allocation/})).toBeNull();
    expect(screen.queryByText(/Ranking response/i)).toBeNull();
    expect(screen.queryByText(/rule.based/i)).toBeNull();
    expect(screen.getByRole("button",{name:"Reset priorities to the applied objective's suggestion"})).toHaveTextContent("Reset");
  });
  it("does not disable an available factor after its share is set to zero",async()=>{
    const ev=structuredClone(fixture.evaluate) as unknown as EvaluateResponse;
    ev.results[0].factor_scores=ev.results[0].factor_scores.map(f=>f.criterion_id==="terrain_safety"?{...f,is_missing:false,raw_weight:0,excluded_reason:"weight is 0"}:f);
    vi.spyOn(globalThis,"fetch").mockRejectedValue(new TypeError("offline"));
    render(<QueryClientProvider client={new QueryClient()}><LeftSidebar defaults={defaults} defaultsError={null} evaluation={ev} evaluationError={null}/></QueryClientProvider>);
    const box=screen.getByLabelText("Your mission objective");
    fireEvent.change(box,{target:{value:"We want to land on Mars to establish a Research Base."}});fireEvent.keyDown(box,{key:"Enter"});
    const slider=await screen.findByLabelText("Gentler terrain share of priorities");
    act(()=>useAppStore.setState({weights:{...start,terrain_safety:0,solar_illumination:58}}));
    expect(slider).toBeEnabled();
    fireEvent.change(slider,{target:{value:"20"}});expect(useAppStore.getState().weights.terrain_safety).toBe(20);
  });
});
