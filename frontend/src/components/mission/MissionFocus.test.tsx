import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MissionFocus } from "./MissionFocus";
import { effectiveMapMode, useAppStore } from "@/store/useAppStore";
beforeEach(()=>useAppStore.setState(useAppStore.getInitialState(),true));
const reading={task:"landing_screening" as const,focusBody:"mars" as const,missionDestination:"mars" as const,reference:null,analogWeights:null,objectiveHash:"new-objective"};
describe("explicit mission focus",()=>{
 it("keeps the user's choice across objective suggestions, and switches back to Mars landing when Mars is picked",()=>{
  render(<MissionFocus/>);
  fireEvent.click(screen.getByRole("button",{name:"Earth"}));
  act(()=>useAppStore.getState().applyInterpretation(reading));
  expect(useAppStore.getState()).toMatchObject({selectionBody:"earth",viewedBody:"earth",missionDestination:"mars",missionFocusOverride:"earth",suggestedMissionFocus:"mars",mapMode:"mission_browse"});
  expect(useAppStore.getState().missionType).toBe("rover_field_test");
  fireEvent.click(screen.getByRole("button",{name:"Mars"}));
  expect(useAppStore.getState()).toMatchObject({selectionBody:"mars",missionType:"landing",viewedBody:"mars",mapMode:"landing_suitability"});
  fireEvent.click(screen.getByRole("button",{name:"Earth"}));
  expect(useAppStore.getState()).toMatchObject({selectionBody:"earth",missionType:"rover_field_test"});
  // no explanatory text under the planet buttons
  expect(screen.queryByText(/Explore opens/)).toBeNull();
  expect(screen.queryByText(/Your choice stays in effect/)).toBeNull();
  expect(screen.queryByText(/Suggested from your objective/)).toBeNull();
 });
 it("opens Earth mission sites then Mars analogs with the selected Earth reference, preserving both selections",()=>{
  const s=useAppStore.getState();
  s.selectLocation("earth","haughton_crater");s.selectLocation("mars","elysium_planitia");s.setMissionFocus("earth");
  s.navigateExplore("mission");
  expect(effectiveMapMode(useAppStore.getState())).toBe("mission_browse");
  s.navigateExplore("analogs");
  expect(useAppStore.getState()).toMatchObject({viewedBody:"mars",mapMode:"analog_match",selectedEarthId:"haughton_crater",selectedMarsId:"elysium_planitia"});
  expect(useAppStore.getState().missionDestination).toBe("mars");
 });
});
