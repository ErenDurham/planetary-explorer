import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@react-three/fiber", () => ({
  Canvas: ({
    onPointerMissed,
  }: {
    onPointerMissed: (e: { type: string }) => void;
  }) => (
    <button
      type="button"
      data-testid="empty-globe"
      onClick={() => onPointerMissed({ type: "click" })}
      onContextMenu={() => onPointerMissed({ type: "contextmenu" })}
    >
      Empty globe space
    </button>
  ),
  useFrame: vi.fn(),
  useThree: vi.fn(),
}));
vi.mock("@react-three/drei", () => ({
  useProgress: () => ({ active: false, progress: 100 }),
  OrbitControls: () => null,
  Stars: () => null,
}));
import { PlanetViewer } from "./PlanetViewer";
import { PLANET_CONFIGS } from "./PlanetConfig";
const marker = {
  id: "jezero",
  name: "Jezero",
  lat: 18,
  lonEast: 77,
  region: "Mars",
  mode: "landing" as const,
  score: 80,
  similarity: null,
  unrankableReason: null,
  rank: 1,
  status: "ok" as const,
  appearance: { color: "#fff", style: "scored" as const },
};
const make = (onDeselect = vi.fn()) => ({
  config: PLANET_CONFIGS.mars,
  markers: [marker],
  selectedId: "jezero",
  onSelect: vi.fn(),
  onDeselect,
  autoRotate: false,
  onAutoRotateChange: vi.fn(),
  resetToken: 0,
  onRequestReset: vi.fn(),
});
afterEach(cleanup);
describe("Globe deselection", () => {
  it("clears on empty primary click, and uses the current body callback after a switch", () => {
    const mars = vi.fn(),
      earth = vi.fn();
    const view = render(<PlanetViewer {...make(mars)} />);
    fireEvent.contextMenu(screen.getByTestId("empty-globe"));
    expect(mars).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("empty-globe"));
    expect(mars).toHaveBeenCalledTimes(1);
    view.rerender(
      <PlanetViewer {...make(earth)} config={PLANET_CONFIGS.earth} />,
    );
    fireEvent.click(screen.getByTestId("empty-globe"));
    expect(earth).toHaveBeenCalledTimes(1);
  });
  it("releases legend clearance when the globe unmounts for imagery",()=>{
    const onOverlayMaxHeightChange=vi.fn();
    const view=render(<PlanetViewer {...make()} onOverlayMaxHeightChange={onOverlayMaxHeightChange}/>);
    view.unmount();
    expect(onOverlayMaxHeightChange).toHaveBeenLastCalledWith(undefined);
  });
  it("does not clear for controls; provides explicit and keyboard clear", () => {
    const props = make();
    render(<PlanetViewer {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset camera" }));
    expect(props.onDeselect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(props.onDeselect).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(
      screen.getByRole("region", { name: "Interactive Mars globe" }),
      { key: "Escape" },
    );
    expect(props.onDeselect).toHaveBeenCalledTimes(2);
  });
});
