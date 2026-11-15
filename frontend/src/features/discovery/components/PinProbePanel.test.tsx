// The dropped-pin panel shows only what the service said: an index when it
// scored, its reasons when it could not, and an honest unavailable state.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PinProbePanel, type ProbeState } from "./PinProbePanel";
import { DiscoveryUnavailable } from "../adapter";
import { criteria, probeResponse } from "../test/fixtures";

const idle: ProbeState = { data: undefined, error: null, isPending: false, isRefreshing: false, fetchStatus: "idle" };
const req = (lat: number, lon: number) => ({ run_id: "pilot_2026_11_14", reference_id: "jezero_crater" as const, lat, lon_east: lon, weights: { slope_regional_median_deg: 50, roughness_regional_m: 50 } });

describe("PinProbePanel", () => {
  it("explains how to place a pin, is labelled as not a candidate, and places one from typed coordinates", () => {
    const onPin = vi.fn();
    render(<PinProbePanel pin={null} onPin={onPin} probe={idle} criteria={criteria} referenceName="Jezero Crater" enabled />);
    expect(screen.getByRole("heading", { name: "Score a dropped pin" })).toBeInTheDocument();
    expect(screen.getByText("Not a candidate")).toBeInTheDocument();
    expect(screen.getByText(/No pin yet/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Pin latitude"), { target: { value: "31.4" } });
    fireEvent.change(screen.getByLabelText("Pin longitude"), { target: { value: "-2.6" } });
    fireEvent.click(screen.getByRole("button", { name: "Place pin" }));
    expect(onPin).toHaveBeenCalledWith({ lat: 31.4, lon: -2.6 });
    // out-of-range coordinates never reach the service
    fireEvent.change(screen.getByLabelText("Pin latitude"), { target: { value: "95" } });
    fireEvent.click(screen.getByRole("button", { name: "Place pin" }));
    expect(onPin).toHaveBeenCalledTimes(1);
  });

  it("shows the service's index, placement, features and limitations for a scored pin, and clears", () => {
    const onPin = vi.fn();
    const data = probeResponse(req(31.4, -2.6));
    render(<PinProbePanel pin={{ lat: 31.4, lon: -2.6 }} onPin={onPin} probe={{ ...idle, data }} criteria={criteria} referenceName="Jezero Crater" enabled />);
    expect(screen.getByTestId("pin-position")).toHaveTextContent("Pin at 31.400°N, 2.600°W");
    const scored = screen.getByTestId("pin-scored");
    expect(scored).toHaveTextContent(data.similarity_index!.toFixed(1));
    expect(screen.getByTestId("pin-placement")).toHaveTextContent("Under the current priorities 1 of the 3 surveyed candidates sit closer to Jezero Crater; 2 sit further.");
    expect(scored).toHaveTextContent(/Inside the surveyed area/);
    expect(scored).toHaveTextContent(/Nearest surveyed candidate 12.3 km away/);
    const dl = within(scored).getByTestId("pin-features");
    expect(dl).toHaveTextContent(/Regional median slope/);
    expect(dl).toHaveTextContent(/0\.62 deg here · 1\.08 deg at Jezero Crater/);
    expect(dl).toHaveTextContent(/95 m here · 194 m at Jezero Crater/);
    expect(scored).toHaveTextContent(/not part of the preregistered sample/);
    fireEvent.click(screen.getByRole("button", { name: "Clear pin" }));
    expect(onPin).toHaveBeenCalledWith(null);
  });

  it("shows the service's reasons, and no number, when the footprint could not be scored", () => {
    const data = probeResponse(req(70, 10));
    render(<PinProbePanel pin={{ lat: 70, lon: 10 }} onPin={() => {}} probe={{ ...idle, data }} criteria={criteria} referenceName="Jezero Crater" enabled />);
    const box = screen.getByTestId("pin-unscored");
    expect(box).toHaveTextContent("No terrain data for this footprint");
    expect(box).toHaveTextContent(/does not download tiles on request/);
    expect(box).toHaveTextContent(/Outside the surveyed area/);
    expect(screen.queryByTestId("pin-scored")).toBeNull();
    expect(screen.queryByText(/\/ 100/)).toBeNull();
  });

  it("states plainly when pin scoring is unavailable, and while it is measuring", () => {
    const { rerender } = render(<PinProbePanel pin={{ lat: 31.4, lon: -2.6 }} onPin={() => {}} probe={{ ...idle, error: new DiscoveryUnavailable("Pin scoring runs only against the local API") }} criteria={criteria} referenceName="Jezero Crater" enabled />);
    expect(screen.getByTestId("pin-unavailable")).toHaveTextContent(/Pin scoring runs only against the local API/);
    rerender(<PinProbePanel pin={{ lat: 31.4, lon: -2.6 }} onPin={() => {}} probe={{ ...idle, isPending: true, fetchStatus: "fetching" }} criteria={criteria} referenceName="Jezero Crater" enabled />);
    expect(screen.getByRole("status")).toHaveTextContent("Measuring the 60 km footprint at 31.400°N, 2.600°W…");
    rerender(<PinProbePanel pin={{ lat: 31.4, lon: -2.6 }} onPin={() => {}} probe={idle} criteria={criteria} referenceName="Jezero Crater" enabled={false} />);
    expect(screen.getByText(/scored once the survey has been ranked/)).toBeInTheDocument();
  });
});
