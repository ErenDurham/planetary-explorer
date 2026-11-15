// The Explore page's Earth analog bar names the curated sites as the
// established analogs and offers the discovery view beside them.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExploreView } from "@/components/layout/ExploreView";
import { useAppStore } from "@/store/useAppStore";

afterEach(() => vi.restoreAllMocks());

describe("Explore established-analogs cue", () => {
  it("shows the Discover link only in Earth analog mode and switches tabs", () => {
    useAppStore.setState({ viewedBody: "earth", mapMode: "analog_match", activeTab: "explore", appliedObjective: "Identify new candidate Earth regions beyond established analog sites" });
    render(<QueryClientProvider client={new QueryClient()}><ExploreView globe={<p>globe</p>} analog={{ referenceId: "jezero_crater", referenceName: "Jezero Crater", referenceOptions: [], onReferenceChange: () => {}, rankedCount: 7, unavailable: {}, rankChanges: null, previousShares: null }} /></QueryClientProvider>);
    const cue = screen.getByTestId("discovery-cue");
    expect(cue).toHaveTextContent(/established analogs/);
    expect(cue).toHaveTextContent(/Your objective asks for new regions/);
    fireEvent.click(screen.getByRole("button", { name: /Discover Earth regions beyond them/ }));
    expect(useAppStore.getState().activeTab).toBe("discover");
  });
  it("is absent on the Mars landing view", () => {
    useAppStore.setState({ viewedBody: "mars", mapMode: "landing_suitability", activeTab: "explore" });
    render(<QueryClientProvider client={new QueryClient()}><ExploreView globe={<p>globe</p>} /></QueryClientProvider>);
    expect(screen.queryByTestId("discovery-cue")).toBeNull();
  });
});
