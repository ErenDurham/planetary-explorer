import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GlobeLegend } from "./GlobeLegend";
import { MARS_CONFIG } from "./PlanetConfig";

describe("GlobeLegend disclosure", () => {
  it("starts compact and expands controls and credits without losing palette changes", () => {
    const onPaletteChange = vi.fn();
    render(<GlobeLegend config={MARS_CONFIG} onPaletteChange={onPaletteChange} />);
    const toggle = screen.getByRole("button", { name: "Mission suitability rank" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByTestId("landing-legend").querySelector('[data-rank-scale]')).toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link")).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onPaletteChange).toHaveBeenCalledWith("single_hue");
    fireEvent.click(toggle);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("also keeps the analog rank legend compact by default", () => {
    render(<GlobeLegend config={MARS_CONFIG} mode="analog" heading="Mars matches to MDRS" />);
    expect(screen.getByRole("button", { name: "Analog match rank" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Mars matches to MDRS")).not.toBeVisible();
  });
});
