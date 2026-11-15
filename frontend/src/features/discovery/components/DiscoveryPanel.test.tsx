import { afterEach, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { DiscoveryPanel } from "./DiscoveryPanel";
const original = HTMLElement.prototype.scrollIntoView;
afterEach(() => { HTMLElement.prototype.scrollIntoView = original;vi.unstubAllGlobals(); });
it("keeps the initial automatic preview from pulling a phone user past the candidate list", () => {
  const scroll = vi.fn(); HTMLElement.prototype.scrollIntoView = scroll;
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width"), addEventListener:vi.fn(), removeEventListener:vi.fn() }));
  const {rerender} = render(<DiscoveryPanel selected={false} revision={0} overview="Survey">Details</DiscoveryPanel>);
  rerender(<DiscoveryPanel selected revision={1} overview="Survey">Details</DiscoveryPanel>);
  expect(scroll).not.toHaveBeenCalled();
  rerender(<DiscoveryPanel selected revision={2} overview="Survey">Another candidate</DiscoveryPanel>);
  expect(scroll).toHaveBeenCalledTimes(1);
});
