// The map positions every marker by converting its coordinate into image
// percentages from the basemap bounds, and a click becomes the coordinate at
// that pixel, so the service receives exactly what the user pointed at.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import fixture from "@/test/fixtures/imagery_jezero.json";
import type { ImageryEntry } from "@/types";
import { TerrainMap } from "./TerrainMap";
import type { Basemap } from "../hooks/useTerrainContext";

const regional = (fixture.entries as unknown as ImageryEntry[]).find(e => e.entry_id === "jezero_crater_ctx_regional")! as Basemap["entry"];
const basemap: Basemap = { entry: regional, resolution: 81.4 };
const b = regional.bounds;
const start = { lat: 18.4447, lon_east: 77.4508 };
afterEach(() => vi.restoreAllMocks());

const base = { basemap, body: "mars" as const, start, waypoints: [], selectedWaypointId: null, targets: [], selectedTargetIds: [], route: null, revealToken: 0, tool: "add" as const };

describe("TerrainMap", () => {
  it("places the start and a waypoint at the percentages their coordinates imply", () => {
    const wp = { id: "w1", lat: b.north, lon_east: b.west, label: null }; // top-left corner
    render(<TerrainMap {...base} waypoints={[wp]} />);
    const s = screen.getByTestId("start-marker");
    const x = ((start.lon_east - b.west) / (b.east - b.west)) * 100, y = ((b.north - start.lat) / (b.north - b.south)) * 100;
    expect(s.style.left).toBe(`${x}%`);
    expect(s.style.top).toBe(`${y}%`);
    const w = screen.getByRole("button", { name: /Waypoint 1/ });
    expect(w.style.left).toBe("0%");
    expect(w.style.top).toBe("0%");
    expect(screen.getByTestId("map-scale-bar")).toBeInTheDocument();
  });

  it("turns a click into the coordinate under the pointer", () => {
    const onAdd = vi.fn();
    render(<TerrainMap {...base} onAddWaypoint={onAdd} />);
    const frame = screen.getByTestId("terrain-frame");
    // 800x520 frame (jsdom clientWidth is 0, the component falls back to 800x520); a 768x768 image fits to 520x520 centred at x=140
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 800, height: 520, right: 800, bottom: 520, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(frame, { button: 0, clientX: 140 + 260, clientY: 260 });
    fireEvent.pointerUp(frame, { button: 0, clientX: 140 + 260, clientY: 260 });
    expect(onAdd).toHaveBeenCalledTimes(1);
    const p = onAdd.mock.calls[0][0];
    expect(p.lon_east).toBeCloseTo((b.west + b.east) / 2, 4);
    expect(p.lat).toBeCloseTo((b.north + b.south) / 2, 4);
  });

  it("does not add a waypoint on a drag, and pans instead", () => {
    const onAdd = vi.fn();
    render(<TerrainMap {...base} onAddWaypoint={onAdd} />);
    const frame = screen.getByTestId("terrain-frame");
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 800, height: 520, right: 800, bottom: 520, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(frame, { button: 0, clientX: 400, clientY: 260 });
    fireEvent.pointerMove(frame, { clientX: 460, clientY: 300 });
    fireEvent.pointerUp(frame, { button: 0, clientX: 460, clientY: 300 });
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByTestId("map-image-box").style.left).toBe(`${140 + 60}px`);
  });

  it("renders the service's route segments coloured by its risk classes", () => {
    const extra = { elevations_m: [], edge_slopes_deg: [], energy_wh: 1, elevation_gain_m: 0, elevation_loss_m: 0, note: null };
    const route = [
      { segment_id: "s1", from: start, to: { lat: 18.5, lon_east: 77.6 }, polyline: [start, { lat: 18.5, lon_east: 77.6 }], distance_m: 1000, risk: "low" as const, max_slope_deg: 2, ...extra },
      { segment_id: "s2", from: { lat: 18.5, lon_east: 77.6 }, to: { lat: 18.6, lon_east: 77.7 }, polyline: [{ lat: 18.5, lon_east: 77.6 }, { lat: 18.6, lon_east: 77.7 }], distance_m: 900, risk: "high" as const, max_slope_deg: 12, ...extra },
      // two stops in one grid cell: the service returns a single point and the map must NOT invent a connector
      { segment_id: "s3", from: { lat: 18.6, lon_east: 77.7 }, to: { lat: 18.6, lon_east: 77.7 }, polyline: [{ lat: 18.6, lon_east: 77.7 }], distance_m: 0, risk: "moderate" as const, max_slope_deg: 0, ...extra },
    ];
    render(<TerrainMap {...base} route={route} snappedStops={[{ stop_id: "start", requested: start, snapped: { lat: 18.46875, lon_east: 77.46875 }, offset_m: 1746, visited: true }]} revealToken={1} />);
    expect(screen.getByTestId("route-segment-low")).toBeInTheDocument();
    expect(screen.getByTestId("route-segment-high")).toBeInTheDocument();
    expect(screen.queryByTestId("route-segment-moderate")).toBeNull();
    expect(screen.getByRole("img", { name: /start snapped to .*1\.7 km from the requested point/ })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Route risk legend" })).toHaveTextContent(/Low terrain risk.*High terrain risk/);
  });

  it("refuses to draw without a georeferenced basemap", () => {
    render(<TerrainMap {...base} basemap={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(/No georeferenced basemap/);
    expect(screen.queryByTestId("terrain-frame")).toBeNull();
  });

  it("removes the selected waypoint with the Delete key and hides targets outside the basemap", () => {
    const onRemove = vi.fn();
    const wp = { id: "w1", lat: 18.5, lon_east: 77.5, label: null };
    const targets = [{ target_id: "t1", name: "Delta front", lat: 18.5, lon_east: 77.4, kind: "outcrop", description: null, source: null, priority: 1 }, { target_id: "t2", name: "Far away", lat: 40, lon_east: 10, kind: "x", description: null, source: null, priority: null }];
    render(<TerrainMap {...base} waypoints={[wp]} selectedWaypointId="w1" targets={targets} onRemoveWaypoint={onRemove} />);
    fireEvent.keyDown(screen.getByTestId("terrain-frame"), { key: "Delete" });
    expect(onRemove).toHaveBeenCalledWith("w1");
    expect(screen.getByRole("button", { name: /Research target Delta front/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Far away/ })).toBeNull();
    expect(screen.getByText(/1 target outside this basemap/)).toBeInTheDocument();
  });
});
