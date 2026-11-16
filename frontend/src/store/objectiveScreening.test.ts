import {defaultRequirements} from "@/lib/missionProfiles";
import {beforeEach,expect,it} from "vitest";
import fixture from "@/test/fixtures/mission_examples.json";
import {useAppStore} from "./useAppStore";
import {applicationFromInterpretation} from "@/hooks/useInterpretObjective";
import type {InterpretResponse,TaskInterpretation} from "@/types";
const initial=useAppStore.getState();
beforeEach(()=>useAppStore.setState(initial,true));
const screening:NonNullable<TaskInterpretation["screening"]>={body:"mars",mission_type:"research",requirements:{...defaultRequirements(),material_targets:["clays","sulfates","carbonates"],material_match:"any"},weights:{materials:100,landforms:0},limitations:["Water accessibility and distance to ice cannot be ranked."]};
function apply(plan:typeof screening|null){
 const response={...fixture.interpret,objective:"Screen Mars for hydrated minerals near ice",task_interpretation:{task:"landing_screening",focus_body:"mars",mission_destination:"mars",screening:plan}} as InterpretResponse;
 const app=applicationFromInterpretation(response,[],"rule_based");
 useAppStore.getState().applyObjective(response.objective,app.weights,app.notes,app.meta);
}
it("carries the research intent into Step 2 rather than scoring landing factors",()=>{
 useAppStore.setState({missionFocusOverride:"earth",selectedEarthId:"haughton_crater"});
 apply(screening);
 useAppStore.getState().navigateExplore("mission","hebrus_valles");
 expect(useAppStore.getState()).toMatchObject({missionType:"research",selectionBody:"mars",viewedBody:"mars",mapMode:"mission_browse",selectedMarsId:"hebrus_valles",selectedEarthId:"haughton_crater",missionProfileWeights:{research:{materials:100,landforms:0}},missionRequirements:{mars:{material_targets:["clays","sulfates","carbonates"],material_match:"any"}}});
});
it("a subsequent landing mission does not inherit research targets",()=>{
 apply(screening);
 apply({...screening,mission_type:"landing",requirements:defaultRequirements(),weights:{},limitations:[]});
 expect(useAppStore.getState().missionType).toBe("landing");
 expect(useAppStore.getState().missionRequirements.mars.material_targets).toEqual([]);
});
it("an unavailable interpreter cannot label a stale previous task as the new reading",()=>{
 apply(screening);
 const response={...fixture.interpret,objective:"An entirely different mission",task_interpretation:null} as InterpretResponse;
 const app=applicationFromInterpretation(response,[],"offline_rule_based");
 useAppStore.getState().applyObjective(response.objective,app.weights,app.notes,app.meta);
 expect(useAppStore.getState().appliedTask).toBeNull();
});
