// The Earth analog board sits behind a plain text tab that is easy to miss, so the
// Mars view names it. This pins the cue: if the tab is ever renamed or the line
// dropped, a whole surface goes back to being invisible and this fails.
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResearchView } from "./ResearchView";

vi.mock("@/components/intelligence/ExplanationPanel", () => ({ ExplanationPanel: () => <div /> }));
vi.mock("@/components/atlas/ResearchAtlasCover", () => ({ ResearchAtlasCover: () => <div /> }));

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ResearchView sites={[]} selectedId={null} onSelect={() => {}} mission={null} /></QueryClientProvider>);
}

describe("Research mode cue", () => {
  it("names the Earth mode by the exact label of the control that opens it", () => {
    mount();
    const cue = screen.getByTestId("earth-mode-cue");
    const group = screen.getByRole("group", { name: "Research subject" });
    const earth = within(group).getByRole("button", { name: /Earth/ });
    // the cue must quote the control's own label, or it points at nothing
    expect(cue.textContent).toContain(earth.textContent);
    expect(cue).toHaveTextContent(/established Earth analogs/);
  });
});
