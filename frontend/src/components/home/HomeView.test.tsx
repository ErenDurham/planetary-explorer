import { beforeEach, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HomeView } from "./HomeView";
import { useAppStore } from "@/store/useAppStore";
import { useCandidateResearchTarget } from "@/features/discovery/store/useCandidateResearchTarget";

beforeEach(() => {
  useAppStore.setState({ activeTab: "home", missionDesigned: false, appliedObjective: "", selectedMarsId: "jezero_crater", selectedEarthId: "earth-choice", exploreMode: "browse", weights: { slope: 70, relief: 30 } });
  useCandidateResearchTarget.setState({ target: null, drafts: {} });
});
it("opens mission design without replacing the current objective, priorities or selections", () => {
  useAppStore.setState({ missionObjective: "My unfinished mission" });
  render(<HomeView />);
  fireEvent.click(screen.getByRole("button", { name: "Start with a mission" }));
  expect(useAppStore.getState()).toMatchObject({ activeTab: "mission", missionObjective: "My unfinished mission", selectedMarsId: "jezero_crater", selectedEarthId: "earth-choice", weights: { slope: 70, relief: 30 } });
});
it("offers Find Earth Analogs as the entry into Explore (the discovery pilot was removed)", () => {
  render(<HomeView />);
  fireEvent.click(screen.getByRole("button", { name: "Find Earth Analogs" }));
  expect(useAppStore.getState()).toMatchObject({ activeTab: "explore", exploreMode: "browse", selectedEarthId: "earth-choice" });
  expect(screen.queryByRole("button", { name: "Explore the Jezero pilot" })).toBeNull();
});
it("shows applied work and reopens the same research notebook without changing drafts", () => {
  useAppStore.setState({ missionDesigned: true, appliedObjective: "Study rover mobility in a Jezero analog." });
  const target = { runId: "survey", candidateId: "candidate" };
  useCandidateResearchTarget.setState({ target });
  render(<HomeView />);
  expect(screen.getByRole("button", { name: "Continue your mission" })).toBeInTheDocument();
  expect(screen.getByText("Study rover mobility in a Jezero analog.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reopen research notebook" }));
  expect(useAppStore.getState().activeTab).toBe("research");
  expect(useCandidateResearchTarget.getState().target).toEqual(target);
});

it("opens Earth analog matching from a previous Mars landing view without replacing mission settings",()=>{
 useAppStore.setState({selectionBody:"mars",viewedBody:"mars",mapMode:"landing_suitability",exploreStage:"mission"});
 render(<HomeView />);
 fireEvent.click(screen.getByRole("button",{name:"Find Earth Analogs"}));
 expect(useAppStore.getState()).toMatchObject({activeTab:"explore",viewedBody:"earth",mapMode:"analog_match",exploreStage:"analogs",selectionBody:"mars",selectedMarsId:"jezero_crater",selectedEarthId:"earth-choice",weights:{slope:70,relief:30}});
});
