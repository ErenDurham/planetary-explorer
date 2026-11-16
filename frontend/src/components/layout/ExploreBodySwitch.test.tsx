import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExploreView, emphasisPhrase } from "./ExploreView";
import { useAppStore } from "@/store/useAppStore";
const mount = () => render(<QueryClientProvider client={new QueryClient()}><ExploreView globe={<p>Globe preview</p>} initialMissionId="elysium_planitia"/></QueryClientProvider>);
beforeEach(() => useAppStore.setState(useAppStore.getInitialState(), true));
describe("guided Explore navigation", () => {
 it("opens the opposite planet with the mission site as reference, and returns without losing the pair", () => {
  useAppStore.setState({selectedMarsId:"elysium_planitia", selectedSiteId:"elysium_planitia", selectedEarthId:"haughton_crater"});
  mount();
  fireEvent.click(screen.getByRole("button",{name:"View Earth"}));
  expect(useAppStore.getState()).toMatchObject({viewedBody:"earth",exploreStage:"analogs",mapMode:"analog_match",selectedMarsId:"elysium_planitia"});
  expect(screen.queryByRole("button",{name:"View Earth"})).toBeNull();
  expect(screen.getByRole("button",{name:"View Mars"})).toHaveTextContent("Mission suitability");
  fireEvent.click(screen.getByRole("button",{name:"View Mars"}));
  expect(useAppStore.getState()).toMatchObject({viewedBody:"mars",exploreStage:"mission",mapMode:"landing_suitability",selectedEarthId:"haughton_crater"});
 });
 it("uses clickable planets without changing mission focus and refreshes the view", () => {
  mount();
  expect(screen.queryByRole("group",{name:"Explore mission or analogs"})).toBeNull();
  expect(screen.queryByRole("button",{name:"View Mars"})).toBeNull();
  expect(screen.getByRole("button",{name:"View Earth"})).toHaveTextContent("Analog match");
  const revision=useAppStore.getState().exploreRevision;
  fireEvent.click(screen.getByRole("button",{name:"View Earth"}));
  expect(useAppStore.getState()).toMatchObject({viewedBody:"earth",selectionBody:"mars",selectedMarsId:"elysium_planitia"});
  expect(useAppStore.getState().exploreRevision).toBeGreaterThan(revision);
  expect(screen.queryByRole("radiogroup",{name:"Body shown on the globe"})).toBeNull();
 });
 it("supports an Earth mission focus with Mars analogs without applying Mars landing scores to Earth", () => {
  useAppStore.setState({missionType:"rover_field_test",selectionBody:"earth",viewedBody:"earth",task:"analog_site_selection",mapMode:"analog_match",selectedEarthId:"haughton_crater",selectedMarsId:"elysium_planitia"});
  mount();fireEvent.click(screen.getByRole("button",{name:"View Mars"}));
  expect(useAppStore.getState()).toMatchObject({viewedBody:"mars",selectionBody:"earth",mapMode:"analog_match"});
  fireEvent.click(screen.getByRole("button",{name:"View Earth"}));
  expect(useAppStore.getState()).toMatchObject({viewedBody:"earth",mapMode:"mission_browse"});
 });
 it("shows a textured Moon that explains it is not implemented yet and changes nothing when clicked", () => {
  mount();
  const moon=screen.getByRole("button",{name:"View Moon"});
  expect(moon).toHaveAccessibleDescription(/To be implemented/);
  expect(screen.getByRole("tooltip")).toHaveTextContent("To be implemented");
  expect(moon.querySelector("[aria-hidden]")?.getAttribute("style")).toContain("textures/moon_lroc_color_1k.jpg");
  const before=useAppStore.getState();
  fireEvent.click(moon);
  expect(useAppStore.getState()).toBe(before);
 });
 it("keeps the applied priorities unchanged during navigation", () => {
  useAppStore.setState({weights:{terrain_safety:70,solar_illumination:30},appliedObjective:"Survey Mars"});
  mount();fireEvent.click(screen.getByRole("button",{name:"View Earth"}));
  expect(useAppStore.getState().weights).toEqual({terrain_safety:70,solar_illumination:30});
  expect(useAppStore.getState().appliedObjective).toBe("Survey Mars");
  expect(emphasisPhrase(null)).toBe("terrain, landforms and materials");
 });
});
