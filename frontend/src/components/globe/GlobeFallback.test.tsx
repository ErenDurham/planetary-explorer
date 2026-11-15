// Without WebGL the viewer still says everything the globe says: the flat
// texture, every marker at its coordinates and selectable, the legend, and
// the reason. The renderer is never mounted on that path.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
vi.mock("@react-three/fiber", () => ({ Canvas: () => <div data-testid="canvas-mounted" />, useFrame: vi.fn(), useThree: vi.fn() }));
vi.mock("@react-three/drei", () => ({ useProgress: () => ({ active: false, progress: 100 }), OrbitControls: () => null, Stars: () => null, Html: () => null, useTexture: () => ({}) }));
import { PlanetViewer } from "./PlanetViewer";
import { PLANET_CONFIGS } from "./PlanetConfig";
import { setWebGLSupport } from "./webgl";

const markers = [
  { id: "jezero", name: "Jezero Crater", lat: 18.4, lonEast: 77.5, region: "Mars", mode: "landing" as const, score: 80, similarity: null, unrankableReason: null, rank: 1, status: "ok" as const, appearance: { color: "#ff0000", style: "scored" as const } },
  { id: "gale", name: "Gale Crater", lat: -5.4, lonEast: 137.8, region: "Mars", mode: "landing" as const, score: 60, similarity: null, unrankableReason: null, rank: 2, status: "ok" as const, appearance: { color: "#00ff00", style: "scored" as const } },
];

afterEach(() => setWebGLSupport(null));

describe("globe without WebGL", () => {
  it("renders the flat map with selectable markers, the legend and the reason, and never mounts the renderer", () => {
    setWebGLSupport(false);
    const onSelect = vi.fn();
    render(<PlanetViewer config={PLANET_CONFIGS.mars} markers={markers} selectedId="jezero" onSelect={onSelect} autoRotate={false} onAutoRotateChange={() => {}} resetToken={0} onRequestReset={() => {}} />);
    const fallback = screen.getByTestId("globe-fallback");
    expect(fallback).toHaveTextContent(/WebGL is unavailable/);
    expect(fallback).toHaveTextContent(/Showing Mars as a flat map; every location is still marked/);
    expect(screen.queryByTestId("canvas-mounted")).toBeNull();
    expect(screen.getByRole("img", { name: /Mars: Regional orbital mosaic/ })).toHaveAttribute("src", expect.stringContaining("textures/mars_viking_4k.jpg"));
    expect(screen.getByRole("button", { name: "Jezero Crater, rank 1" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Gale Crater, rank 2" }));
    expect(onSelect).toHaveBeenCalledWith("gale");
    expect(screen.getByTestId("landing-legend")).toBeInTheDocument();
  });

  it("mounts the renderer when WebGL is available", () => {
    setWebGLSupport(true);
    render(<PlanetViewer config={PLANET_CONFIGS.earth} markers={markers} selectedId={null} onSelect={() => {}} autoRotate={false} onAutoRotateChange={() => {}} resetToken={0} onRequestReset={() => {}} />);
    expect(screen.getByTestId("canvas-mounted")).toBeInTheDocument();
    expect(screen.queryByTestId("globe-fallback")).toBeNull();
  });
});
