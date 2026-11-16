import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useMotionPreference } from "./preferences";
afterEach(() => vi.restoreAllMocks());
function Example() { const reduced = useMotionPreference(); return <output>{reduced ? "Still" : "Moving"}</output>; }
const media = (matches: boolean) => vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({ matches, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));

it("keeps motion on by default", () => {
  media(false);
  render(<Example />);
  expect(screen.getByText("Moving")).toBeInTheDocument();
});

it("stills motion when the device asks for reduced motion", () => {
  media(true);
  render(<Example />);
  expect(screen.getByText("Still")).toBeInTheDocument();
});
