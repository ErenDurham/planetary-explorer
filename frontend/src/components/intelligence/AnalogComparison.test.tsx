// Compare page: documented analog use is shown as recorded programmes, apart
// from proposed studies, which render as hypothesis cards; nothing is listed
// twice and an empty proposal list says so.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fixture from "@/test/fixtures/api_examples.json";
import { useAppStore } from "@/store/useAppStore";
import { AnalogComparison } from "./AnalogComparison";
import type { MatchResponse, Site, StudyCard } from "@/types";

const match = fixture.match as unknown as MatchResponse;
const site = fixture.site.site as unknown as Site;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("AnalogComparison research sections", () => {
  beforeEach(() => {
    useAppStore.setState({ analogWeights: null });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).endsWith("/analogs/match")) return json(match);
      return json({ error: { code: "not_found", message: "unmocked" } }, 404);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("separates documented analog use from proposed studies and never duplicates a campaign", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AnalogComparison site={site} />
      </QueryClientProvider>,
    );
    const first = match.matches[0];
    const documented = first.documented_analog_use ?? [];
    expect(documented.length).toBeGreaterThan(0);
    expect(first.proposed_studies ?? []).toHaveLength(0);

    const docSection = await screen.findByRole("region", { name: "Documented analog use" });
    const programmes = within(docSection).getAllByRole("listitem");
    expect(programmes).toHaveLength(documented.length);
    for (const u of documented) expect(within(docSection).getAllByText(u)).toHaveLength(1);
    expect(within(docSection).getAllByText("Documented programme")).toHaveLength(documented.length);
    // the deprecated research_applications alias is not rendered as a second list
    expect(screen.queryByRole("region", { name: "Research applications" })).toBeNull();

    const proposedSection = screen.getByRole("region", { name: "Proposed studies (hypotheses)" });
    expect(proposedSection).toHaveTextContent("The matched features do not suggest a study for this pair.");
    expect(proposedSection).toHaveTextContent(/Similarity is a rough index/);

    // a candidate that does carry proposals renders them as study cards
    const withStudies = match.matches.findIndex((m) => (m.proposed_studies ?? []).length > 0);
    expect(withStudies).toBeGreaterThan(0);
    const candidate = match.matches[withStudies];
    fireEvent.click(screen.getByRole("button", { name: new RegExp(candidate.earth_candidate.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }));
    const study = (candidate.proposed_studies as unknown as StudyCard[])[0];
    const card = (await screen.findAllByTestId("study-card"))[0];
    expect(card).toHaveTextContent("Proposed study · not performed");
    expect(card).toHaveTextContent(study.title);
    expect(card).toHaveTextContent("What this cannot establish");
    expect(card).toHaveTextContent(study.cannot_infer);
    expect(card).toHaveTextContent(`Earth analog: ${candidate.earth_candidate.name}`);
    expect(card).toHaveTextContent(/Analog similarity is a rough index/);
    expect(card).not.toHaveTextContent("Documented campaign");
  });
});
