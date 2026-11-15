// The Explore page's Earth analog bar names the curated sites as the
// established analogs and offers the discovery view beside them.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExploreView } from "@/components/layout/ExploreView";
import { useAppStore } from "@/store/useAppStore";

afterEach(() => vi.restoreAllMocks());

describe("Explore established-analogs cue", () => {
  it("shows the find-analogs cue only in Earth analog mode and opens Find Earth Analogs inside Explore", () => {
    useAppStore.setState({ viewedBody: "earth", mapMode: "analog_match", activeTab: "explore", exploreMode: "browse", appliedObjective: "Identify new candidate Earth regions beyond established analog sites" });
    render(<QueryClientProvider client={new QueryClient()}><ExploreView globe={<p>globe</p>} analog={{ referenceId: "jezero_crater", referenceName: "Jezero Crater", referenceOptions: [], onReferenceChange: () => {}, rankedCount: 7, unavailable: {}, rankChanges: null, previousShares: null }} /></QueryClientProvider>);
    const cue = screen.getByTestId("discovery-cue");
    expect(cue).toHaveTextContent(/established analogs/);
    expect(cue).toHaveTextContent(/Your objective asks for new regions/);
    fireEvent.click(screen.getByRole("button", { name: /Find candidate Earth analogs beyond them/ }));
    expect(useAppStore.getState().activeTab).toBe("explore");
    expect(useAppStore.getState().exploreMode).toBe("find_analogs");
  });
  it("offers the Browse Regions / Find Earth Analogs switch at the top of Explore", () => {
    useAppStore.setState({ viewedBody: "mars", mapMode: "landing_suitability", activeTab: "explore", exploreMode: "browse" });
    render(<QueryClientProvider client={new QueryClient()}><ExploreView globe={<p>globe</p>} /></QueryClientProvider>);
    const group = screen.getByRole("radiogroup", { name: "Explore mode" });
    expect(within(group).getByRole("radio", { name: "Browse Regions" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(group).getByRole("radio", { name: "Find Earth Analogs" }));
    expect(useAppStore.getState().exploreMode).toBe("find_analogs");
  });
  it("is absent on the Mars landing view", () => {
    useAppStore.setState({ viewedBody: "mars", mapMode: "landing_suitability", activeTab: "explore" });
    render(<QueryClientProvider client={new QueryClient()}><ExploreView globe={<p>globe</p>} /></QueryClientProvider>);
    expect(screen.queryByTestId("discovery-cue")).toBeNull();
  });
});
