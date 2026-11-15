// Source digests and study cards in the explanation panel, driven through the
// real useExplanation hook with fetch mocked: the applied objective travels in
// the request, digests dedup by URL and keep each chunk's own citation handle,
// support levels render (including a plain "insufficient" statement), study
// cards carry their kind badge and cannot_infer, and an empty study list shows
// the evidence gap rather than filler.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import { ExplanationPanel } from "./ExplanationPanel";
import type { ResearchExplanation } from "@/types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const base: ResearchExplanation = {
  site_id: "jezero_crater",
  generated_by: "deterministic_fallback",
  model: null,
  sections: { favorable: ["Low regional slope."], unfavorable: [], risks: ["Regional data only."], influential_factors: [], research_applications: ["COMPAT STRING SHOULD NOT RENDER"], missing_evidence: [], future_investigation: [] },
  supporting_evidence: [
    { chunk_id: "nasa#001", document_id: "nasa", title: "Mars 2020 overview", institution: "NASA", url: "https://example.test/m2020/", excerpt: "Jezero was chosen as the landing site.", publication_date: "2017-12-05" },
    { chunk_id: "nasa#002", document_id: "nasa", title: "Mars 2020 overview", institution: "NASA", url: "https://example.test/m2020#section", excerpt: "The delta preserves a record of past water.", publication_date: "2017-12-05" },
    { chunk_id: "esa#009", document_id: "esa", title: "Oxia Planum favoured", institution: "ESA", url: "https://example.test/oxia", excerpt: "Oxia Planum was selected for ExoMars.", publication_date: null },
  ],
  citations: [
    { citation_id: "[C1]", chunk_id: "nasa#001", document_id: "nasa", title: "Mars 2020 overview", institution: "NASA", url: "https://example.test/m2020/" },
    { citation_id: "[C2]", chunk_id: "nasa#002", document_id: "nasa", title: "Mars 2020 overview", institution: "NASA", url: "https://example.test/m2020#section" },
    { citation_id: "[C3]", chunk_id: "esa#009", document_id: "esa", title: "Oxia Planum favoured", institution: "ESA", url: "https://example.test/oxia" },
  ],
  source_digests: [
    { document_id: "nasa", title: "Mars 2020 overview", institution: "NASA", url: "https://example.test/m2020/", publication_date: "2017-12-05", purpose_label: "Mission context", chunk_ids: ["nasa#001", "nasa#002"], citation_ids: ["[C1]", "[C2]"], what_it_tells_us: "NASA chose Jezero for Perseverance.", why_it_matters: "Names the landing-site decision directly.", limitation: "Mission text does not validate the quantitative score.", support_level: "supports", generated_by: "extractive" },
    { document_id: "esa", title: "Oxia Planum favoured", institution: "ESA", url: "https://example.test/oxia", publication_date: null, purpose_label: "Mission context", chunk_ids: ["esa#009"], citation_ids: ["[C3]"], what_it_tells_us: "ESA favoured a different site for ExoMars.", why_it_matters: "Retrieved for the region, not for this site.", limitation: null, support_level: "insufficient", generated_by: "llm" },
  ],
  research_studies: [
    { kind: "proposed_study", title: "Does the regional slope predict local hazards?", research_question: "Do 3.7 km statistics match metre-scale slopes?", method: "Sample HiRISE DTMs over the footprint.", why_here: "Complete regional terrain profile.", motivating_citation_ids: ["[C1]", "[C2]"], cannot_infer: "Regional statistics cannot resolve lander-scale hazards.", analog_candidate_id: null },
    { kind: "documented_campaign", title: "ARADS drilling campaign", research_question: "Can drilling reach subsurface samples?", method: "Rover-mounted drill tests.", why_here: "Shares aridity with the site.", motivating_citation_ids: [], cannot_infer: "Earth gravity and atmosphere differ.", analog_candidate_id: "atacama_yungay" },
  ],
  evidence_gap: null,
  limitations: ["Regional data only."],
  cached: false,
  generated_at: "2026-11-14T17:00:00Z",
};

let explainCalls: Array<Record<string, unknown>> = [];
let response: ResearchExplanation = base;

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ExplanationPanel siteId="jezero_crater" mission={null} />
    </QueryClientProvider>,
  );
}

describe("ExplanationPanel digests and study cards", () => {
  beforeEach(() => {
    explainCalls = [];
    response = base;
    useAppStore.setState({ appliedObjective: "Find a safe landing site with reliable solar energy.", missionObjective: "Find a safe landing site with reliable solar energy." });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).endsWith("/research/explain")) {
        explainCalls.push(JSON.parse(String(init?.body)));
        return json(response);
      }
      return json({ error: { code: "not_found", message: "unmocked" } }, 404);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("uses a plain refresh icon for rule-based research", async () => {
    response = { ...base, generated_by: "deterministic_fallback" };
    renderPanel();
    await screen.findByText("NASA chose Jezero for Perseverance.");
    const refresh = screen.getByRole("button", { name: "Explain this site under the current priorities" });
    expect(refresh.querySelector(".lucide-sparkles")).toBeNull();
    expect(refresh.querySelector(".lucide-refresh-cw")).not.toBeNull();
  });

  it("identifies refresh as AI when research was model generated", async () => {
    response = { ...base, generated_by: "llm" };
    renderPanel();
    await screen.findByText(/Language model/);
    const refresh = screen.getByRole("button", { name: "Explain this site under the current priorities" });
    expect(refresh.querySelector(".lucide-sparkles")).not.toBeNull();
  });

  it("sends the applied objective, renders one card per URL with support levels and per-chunk citation handles", async () => {
    renderPanel();
    await screen.findByText("NASA chose Jezero for Perseverance.");
    expect(explainCalls[0]).toMatchObject({ site_id: "jezero_crater", objective: "Find a safe landing site with reliable solar energy." });

    const cards = screen.getAllByTestId("source-card");
    expect(cards).toHaveLength(2); // nasa#001 and nasa#002 share a URL
    const nasa = within(cards[0]);
    expect(nasa.getByText("Supports")).toBeInTheDocument();
    expect(nasa.getByText("Extractive (no model)")).toBeInTheDocument();
    expect(nasa.getByText("Mission context")).toBeInTheDocument();
    expect(cards[0]).toHaveTextContent("2017-12-05");
    expect(cards[0]).toHaveTextContent("[C1] [C2]");
    expect(cards[0]).toHaveTextContent("Limitation: Mission text does not validate the quantitative score.");
    expect(nasa.getByRole("link", { name: "Open Mars 2020 overview" })).toHaveAttribute("href", "https://example.test/m2020/");

    const esa = within(cards[1]);
    expect(esa.getByText("Insufficient evidence")).toBeInTheDocument();
    expect(cards[1]).toHaveTextContent(/do not have enough relevant evidence/);
    expect(esa.getByText("Model digest")).toBeInTheDocument();
    expect(esa.queryByText("Extractive (no model)")).toBeNull();

    // original passages keep their own chunk ids and handles
    fireEvent.click(nasa.getByText(/Read 2 original passages/));
    expect(cards[0]).toHaveTextContent("nasa#001");
    expect(cards[0]).toHaveTextContent("nasa#002");
    const passages = cards[0].querySelectorAll("blockquote");
    expect(passages).toHaveLength(2);
    expect(passages[0].parentElement).toHaveTextContent("[C1]");
    expect(passages[1].parentElement).toHaveTextContent("[C2]");
  });

  it("renders study cards with kind badges, cannot_infer and citation links; never the compatibility string list", async () => {
    renderPanel();
    await screen.findByText("Does the regional slope predict local hazards?");
    const cards = screen.getAllByTestId("study-card");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("Proposed study · not performed");
    expect(cards[0]).toHaveTextContent("What this cannot establish");
    expect(cards[0]).toHaveTextContent("Regional statistics cannot resolve lander-scale hazards.");
    expect(cards[0]).toHaveTextContent("How to investigate");
    expect(within(cards[0]).getByRole("link", { name: "[C1]" })).toHaveAttribute("href", "https://example.test/m2020/");
    expect(cards[1]).toHaveTextContent("Documented campaign");
    expect(cards[1]).toHaveTextContent("based on the site data, with no passage cited");
    expect(cards[1]).toHaveTextContent("Earth analog: atacama_yungay");
    expect(screen.queryByText("COMPAT STRING SHOULD NOT RENDER")).toBeNull();
  });

  it("shows the evidence gap when no study can be motivated, and a plain statement when the gap is null", async () => {
    response = { ...base, research_studies: [], evidence_gap: "The corpus holds no passage about this site's terrain at landing scale." };
    const view = renderPanel();
    expect(await screen.findByText("The corpus holds no passage about this site's terrain at landing scale.")).toBeInTheDocument();
    expect(screen.queryAllByTestId("study-card")).toHaveLength(0);
    view.unmount();

    response = { ...base, research_studies: [], evidence_gap: null };
    renderPanel();
    expect(await screen.findByText("The evidence found does not suggest a study for this site.")).toBeInTheDocument();
  });

  it("falls back to the extractive preview when an older response carries no digests", async () => {
    response = { ...base, source_digests: [] };
    renderPanel();
    await screen.findAllByTestId("source-card");
    const cards = screen.getAllByTestId("source-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("Extractive (no model)")).toBeInTheDocument();
    expect(cards[0]).toHaveTextContent("Jezero was chosen as the landing site.");
    expect(screen.queryByText("Model digest")).toBeNull();
  });

  it("keeps the previous digest with a note when the applied objective changes, and offers Refresh", async () => {
    renderPanel();
    await screen.findByText("NASA chose Jezero for Perseverance.");
    expect(explainCalls).toHaveLength(1);
    useAppStore.setState({ appliedObjective: "Prioritise landing safety; ignore solar" });
    expect(await screen.findByText(/This was made for a previous objective/)).toBeInTheDocument();
    expect(screen.getByText("NASA chose Jezero for Perseverance.")).toBeInTheDocument();
    expect(explainCalls).toHaveLength(1); // not refetched on its own
    fireEvent.click(screen.getByRole("button", { name: /Refresh the explanation/ }));
    await waitFor(() => expect(explainCalls).toHaveLength(2));
    expect(explainCalls[1]).toMatchObject({ objective: "Prioritise landing safety; ignore solar" });
    await waitFor(() => expect(screen.queryByText(/Digest generated for a previous objective/)).toBeNull());
  });

  it("shows the error and a Retry button when the explanation fetch fails", async () => {
    vi.restoreAllMocks();
    let fail = true;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (fail) return json({ error: { code: "data_unavailable", message: "retrieval index offline" } }, 503);
      return json(base);
    });
    renderPanel();
    // useExplanation retries once with TanStack's default ~1 s back-off before surfacing the error
    expect(await screen.findByRole("alert", {}, { timeout: 5000 })).toHaveTextContent(/retrieval index offline/);
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("NASA chose Jezero for Perseverance.")).toBeInTheDocument();
  });
});
