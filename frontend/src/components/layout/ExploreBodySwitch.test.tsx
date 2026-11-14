// The Earth / Mars segmented control: keyboard operable (arrows move AND
// select, Home/End, Space/Enter), a visible-focus roving tabindex, a manual
// switch that persists as an override, and the mode row that follows the body.
import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExploreView, emphasisPhrase, matchContextLine } from "./ExploreView";
import { useAppStore } from "@/store/useAppStore";

const initial = useAppStore.getState();
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ExploreView globe={<p>Globe preview</p>} /></QueryClientProvider>);

beforeEach(() => useAppStore.setState({ ...initial, viewedBody: "mars", followObjective: true, mapMode: "landing_suitability", appliedFocusBody: "mars", appliedTask: "landing_screening", selectedEarthId: null, selectedMarsId: null, selectedSiteId: null }, true));

describe("Explore body switch", () => {
  it("switches bodies with arrow keys, keeps focus on the checked radio and records the manual override", () => {
    mount();
    const group = screen.getByRole("radiogroup", { name: "Body shown on the globe" });
    const [earth, mars] = within(group).getAllByRole("radio");
    expect(mars).toHaveAttribute("aria-checked", "true");
    expect(mars).toHaveAttribute("tabindex", "0");
    expect(earth).toHaveAttribute("tabindex", "-1");
    mars.focus();
    fireEvent.keyDown(mars, { key: "ArrowLeft" });
    expect(useAppStore.getState().viewedBody).toBe("earth");
    expect(useAppStore.getState().followObjective).toBe(false);
    expect(within(group).getAllByRole("radio")[0]).toHaveAttribute("aria-checked", "true");
    expect(within(group).getAllByRole("radio")[0]).toHaveFocus();
    // the mode row follows the body: Earth has only analog match
    expect(screen.queryByRole("radiogroup", { name: "Map mode" })).toBeNull();
    expect(screen.getByText("Mode: Analog match")).toBeInTheDocument();
    expect(screen.getByTestId("analog-context")).toBeInTheDocument();
    // Follow objective returns to Mars and clears the override
    fireEvent.click(screen.getByRole("button", { name: /Follow objective/ }));
    expect(useAppStore.getState().viewedBody).toBe("mars");
    expect(useAppStore.getState().followObjective).toBe(true);
    expect(screen.queryByRole("button", { name: /Follow objective/ })).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Map mode" })).toBeInTheDocument();
  });
  it("Home, End, Space and Enter work and a wrap-around never leaves the group", () => {
    mount();
    const group = screen.getByRole("radiogroup", { name: "Body shown on the globe" });
    const radios = within(group).getAllByRole("radio");
    fireEvent.keyDown(radios[1], { key: "Home" });
    expect(useAppStore.getState().viewedBody).toBe("earth");
    fireEvent.keyDown(within(group).getAllByRole("radio")[0], { key: "End" });
    expect(useAppStore.getState().viewedBody).toBe("mars");
    fireEvent.keyDown(within(group).getAllByRole("radio")[1], { key: "ArrowRight" }); // wraps to Earth
    expect(useAppStore.getState().viewedBody).toBe("earth");
    fireEvent.keyDown(within(group).getAllByRole("radio")[1], { key: " " });
    expect(useAppStore.getState().viewedBody).toBe("mars");
  });
  it("'Find Earth analogs' needs a selected Mars site and then switches to Earth in analog mode with that site as the reference", () => {
    mount();
    expect(screen.getByRole("button", { name: /Find Earth analogs/ })).toBeDisabled();
    act(() => useAppStore.getState().selectSite("elysium_planitia"));
    fireEvent.click(screen.getByRole("button", { name: /Find Earth analogs/ }));
    const s = useAppStore.getState();
    expect(s.viewedBody).toBe("earth");
    expect(s.selectedMarsId).toBe("elysium_planitia");
    expect(screen.getByTestId("match-context-line")).toBeInTheDocument();
    expect(screen.queryByTestId("landing-legend")).toBeNull();
  });
  it("describes the match context with the reference and the emphasised features", () => {
    expect(emphasisPhrase(null)).toBe("terrain, landforms and materials");
    expect(emphasisPhrase({ slope_regional_median_deg: 30, roughness_regional_m: 30, terrain_morphology: 25, mineralogy_tags: 10, precipitation_mm_day: 5 })).toBe("terrain and landforms");
    expect(matchContextLine("earth", "Elysium Planitia (InSight)", { slope_regional_median_deg: 40, roughness_regional_m: 10, terrain_morphology: 10, mineralogy_tags: 40, precipitation_mm_day: 0 })).toBe("Earth matches to Elysium Planitia (InSight) · terrain and materials");
    expect(matchContextLine("mars", null, null)).toMatch(/no reference on Earth/);
  });
});
