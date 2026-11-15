import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExploreView, type ImagerySubject } from "./ExploreView";
import { useAppStore } from "@/store/useAppStore";
import { useRegionTarget } from "@/features/regions/store";

const mars: ImagerySubject = {id:"jezero_crater",name:"Jezero Crater",lat:18.4447,lon_east:77.4508};
const earth: ImagerySubject = {id:"haughton_crater",name:"Haughton impact structure",lat:75.38,lon_east:-89.68};
beforeEach(() => {useAppStore.setState(useAppStore.getInitialState(),true);useRegionTarget.getState().clear();});
function wrap(site?:ImagerySubject) {
 return <QueryClientProvider client={new QueryClient()}><ExploreView globe={<p>Globe</p>} site={site}/></QueryClientProvider>;
}
describe("selected region toolbar actions",()=>{
 it("opens analysis for the visible selected region from the view toolbar",()=>{
  render(wrap(mars));
  const toolbar=screen.getByRole("navigation",{name:"Explore views"});
  fireEvent.click(within(toolbar).getByRole("button",{name:"Analyze region"}));
  expect(useRegionTarget.getState().target).toEqual({kind:"catalog",id:mars.id});
  expect(useAppStore.getState().activeTab).toBe("analyze");
 });
 it("uses the new selection for comparison and disables both actions when selection clears",()=>{
  const {rerender}=render(wrap(mars));
  rerender(wrap(earth));
  fireEvent.click(screen.getByRole("button",{name:"Compare region"}));
  expect(useRegionTarget.getState().target).toEqual({kind:"catalog",id:earth.id});
  expect(useAppStore.getState().activeTab).toBe("compare");
  rerender(wrap());
  expect(screen.getByRole("button",{name:"Analyze region"})).toBeDisabled();
  expect(screen.getByRole("button",{name:"Compare region"})).toBeDisabled();
 });
});
