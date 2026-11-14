import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import fixture from "@/test/fixtures/api_examples.json";
import { EnvironmentalProfilePanel } from "./EnvironmentalProfilePanel";
import type { EnvironmentalProfile } from "@/types";

const profile = fixture.site.profile as unknown as EnvironmentalProfile;

describe("EnvironmentalProfilePanel", () => {
  it("renders a missing metric as 'No data' with its notes, never as 0", () => {
    render(<EnvironmentalProfilePanel profile={profile} />);
    const row = screen.getByTestId("metric-surface_temperature_mean_c");
    expect(within(row).getByText("No data")).toBeInTheDocument();
    expect(within(row).getAllByText(/Not yet integrated/).length).toBeGreaterThanOrEqual(1);
    expect(within(row).queryByText(/^0(\s|$)/)).toBeNull();
    expect(within(row).getByText("no data")).toBeInTheDocument(); // quality badge
  });
  it("renders numeric values with units and quality badges", () => {
    render(<EnvironmentalProfilePanel profile={profile} />);
    const row = screen.getByTestId("metric-elevation_median_m");
    expect(within(row).getByText(/-2,129/)).toHaveTextContent("m");
    expect(within(row).getByText("good")).toBeInTheDocument();
    const slope = screen.getByTestId("metric-slope_regional_median_deg");
    expect(within(slope).getByText(/1\.077/)).toHaveTextContent("°");
    expect(within(slope).getByText("regional")).toBeInTheDocument();
  });
  it("renders list values as chips and groups by category", () => {
    render(<EnvironmentalProfilePanel profile={profile} />);
    const row = screen.getByTestId("metric-mineralogy_tags");
    expect(within(row).getByText("Carbonates")).toBeInTheDocument();
    expect(within(row).getByText("Olivine")).toBeInTheDocument();
    for (const h of ["Ground", "Atmosphere & Thermal", "Light", "Water / Ice", "Hazards", "Composition"]) {
      expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
    }
  });
  it("shows completeness as available / requested", () => {
    render(<EnvironmentalProfilePanel profile={profile} />);
    expect(screen.getByText(/13\/17/)).toBeInTheDocument();
  });
  it("resolves provenance from profile.sources", () => {
    render(<EnvironmentalProfilePanel profile={profile} />);
    const row = screen.getByTestId("metric-elevation_median_m");
    expect(within(row).getByText(/MOLA Mission Experiment Gridded Data Record/)).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: /open source/i })).toHaveAttribute("href", expect.stringContaining("pds-geosciences"));
  });
});
