// The evidence panel for one candidate: every planned section renders from a
// rank-response candidate plus the detail row, each value traceable to a
// field, absent context reported as absent, and nothing claimed that the
// service did not say.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CandidateDetail } from "./CandidateDetail";
import { useDiscoveryStore } from "../store/useDiscoveryStore";
import { candidates, criteria, detail, rankResponse, reference, run, source } from "../test/fixtures";

const mocks = vi.hoisted(() => ({ research: vi.fn(), saveResearch: vi.fn() }));
vi.mock("@/services/discoveryEngine", () => ({ discoveryEngine: mocks }));

const res = rankResponse({ run_id: run.run_id, reference_id: "jezero_crater", top_k: 5 });
const dossier = { run_id: run.run_id, candidate_id: candidates[1].id, candidate: detail(candidates[1].id), record: { status: "unresearched", notes: "", findings: [], updated_at: null }, research_questions: ["q1", "q2", "q3"], search_tasks: [{ label: "a", url: "https://x" }, { label: "b", url: "https://y" }], research_brief: "", background_evidence: [], retrieval_status: "background_available", limitations: [] };

function mount(over: Partial<Parameters<typeof CandidateDetail>[0]> = {}) {
  const props: Parameters<typeof CandidateDetail>[0] = { candidate: candidates[1], detail: detail(candidates[1].id), detailPending: false, detailError: null, onRetry: () => {}, criteria, reference, established: [], effectiveWeights: res.effective_weights, returnedCount: res.returned_count, survey: res.survey, ...over };
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CandidateDetail {...props} /></QueryClientProvider>);
}

describe("CandidateDetail", () => {
  beforeEach(() => { vi.clearAllMocks(); useDiscoveryStore.setState({ runId: run.run_id }); mocks.research.mockResolvedValue(dossier); });
  afterEach(() => vi.restoreAllMocks());

  it("renders every section of the evidence from the rank candidate, the detail row and the survey", async () => {
    mount();
    const card = screen.getByRole("article", { name: /Candidate evidence: Footprint c_31_75_m2_25/ });
    // A. identity and status
    expect(card).toHaveTextContent(/Rank 2 of 3/);
    expect(card).toHaveTextContent(/31\.750°N, 2\.250°W/);
    expect(card).toHaveTextContent("Proposed terrain analog candidate; field validation required.");
    expect(card).toHaveTextContent(/terrain data 99\.0% complete/);
    // B. the match: index, weights sentence, reasons, and a factor table whose shares add to the whole
    const match = within(card).getByRole("region", { name: "Match to Jezero Crater" });
    expect(match).toHaveTextContent(/61\.4/);
    expect(match).toHaveTextContent(/slope 50%, relief 50%/);
    expect(match).toHaveTextContent(/Regional slope is close: 1\.30° here against 1\.08° at Jezero Crater/);
    expect(match).toHaveTextContent(/The larger difference is relief: 150 m against 194 m/);
    const table = within(match).getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    // sorted by contribution: relief first (0.221 of 0.295 = 75%), slope second (25%)
    expect(rows[0]).toHaveTextContent(/Detrended regional relief.*150\.2 m.*194\.4 m.*50%.*75%/);
    expect(rows[1]).toHaveTextContent(/Regional median slope.*1\.3°.*1\.077°.*50%.*25%/);
    expect(match).toHaveTextContent(/D = 0\.629 is the weighted sum of the contributions; index = 100 \/ \(1 \+ D\) = 61\.4/);
    // C. how it was measured, from the detail profile and the survey specification
    const measured = within(card).getByRole("region", { name: "How it was measured" });
    expect(measured).toHaveTextContent(/Regional median slope1\.3° \(derived\)/);
    expect(measured).toHaveTextContent(/cells of 4 km inside a 60 km footprint/);
    expect(measured).toHaveTextContent(/terrain 99\.0% · gradient 97\.0%/);
    expect(measured.textContent).not.toMatch(/No missing-data cells/); // the fixture survey does not state no_nodata_fill, so the panel does not claim it
    expect(measured).toHaveTextContent(/Screening notes \(1\)/);
    // D. catalog relation, with the rule quoted
    const relation = within(card).getByRole("region", { name: "Relation to known analogs" });
    expect(relation).toHaveTextContent(/Not near a catalog location/);
    expect(relation).toHaveTextContent(/not a claim of novelty/);
    expect(relation).toHaveTextContent(/Rule: 100 km centre buffer/);
    expect(relation).toHaveTextContent(/atacama yungay \(8,120 km\) is in the versioned catalog but not among this app's featured Earth regions/);
    // E. what was not compared: absent context is absent
    const ctx = within(card).getByRole("region", { name: "What was not compared" });
    expect(ctx).toHaveTextContent(/ClimateNot available\./);
    expect(ctx).toHaveTextContent(/Land coverNot available\./);
    expect(ctx).toHaveTextContent(/Geology: not assessed/);
    expect(ctx).toHaveTextContent(/Climate context: not available/);
    // F. sources grouped, dataset versions from the survey
    const sources = within(card).getByRole("region", { name: "Sources and provenance" });
    expect(sources).toHaveTextContent(/Copernicus GLO-90 DEM — ESA \/ Airbus/);
    expect(sources).toHaveTextContent(/observed 2011-2015 \(TanDEM-X\) · retrieved 2026-11-14/);
    expect(sources).toHaveTextContent(/glo90 dataset2021_1/);
    // G. limitations, validation steps and the research status read from the dossier
    const next = within(card).getByRole("region", { name: "Limitations and next steps" });
    expect(next).toHaveTextContent(/4 km cells do not resolve rover hazards/);
    expect(next).toHaveTextContent(/Acquire higher-resolution DEM/);
    const summary = within(next).getByTestId("candidate-research-summary");
    await waitFor(() => expect(summary).toHaveTextContent(/Status unresearched · no notes saved yet · 3 questions and 2 searches prepared · background library available/));
    expect(mocks.research).toHaveBeenCalledWith(run.run_id, candidates[1].id, "", expect.anything());
    // nothing the service did not say
    expect(card.textContent).not.toMatch(/unknown to science|validated analog|safe to|accessible|confirmed analog/i);
  });

  it("collapses repeated source tiles into one line with a count, and shows climate context as context", () => {
    const climate = { values: { air_temperature_c: 21.4, precipitation_mm_day: 0.3 }, scope: "Single survey-centre context, not a candidate measurement or score input", resolution: "0.5 x 0.625 deg grid", lat: 31.5, lon_east: -2.5, source: { title: "NASA POWER climatology", institution: "NASA POWER" } };
    mount({ candidate: { ...candidates[1], context: { climate, land_cover: null, geology_status: "not_assessed" } }, detail: { ...detail(candidates[1].id), source_manifest: [source, source, source, { ...source, source_id: "mola", title: "MOLA MEGDR", institution: "NASA PDS" }] } });
    const card = screen.getByRole("article", { name: /Candidate evidence/ });
    expect(within(card).getByRole("region", { name: "Sources and provenance" })).toHaveTextContent(/Copernicus GLO-90 DEM · 3 tiles — ESA \/ Airbus/);
    const ctx = within(card).getByRole("region", { name: "What was not compared" });
    expect(ctx).toHaveTextContent(/air temperature c21\.4/);
    expect(ctx).toHaveTextContent(/Single survey-centre context, not a candidate measurement or score input · 0\.5 x 0\.625 deg grid · at 31\.50°N, 2\.50°W/);
    expect(ctx.textContent).not.toMatch(/Climate context: not available/);
  });

  it("reports what it has not got instead of inventing it", () => {
    mount({ candidate: { ...candidates[1], feature_distances: [], distance: null }, detail: undefined, detailPending: true, effectiveWeights: undefined, survey: null });
    const card = screen.getByRole("article", { name: /Candidate evidence/ });
    expect(card).toHaveTextContent(/No factor breakdown was returned for this candidate/);
    expect(card).toHaveTextContent(/Loading candidate inputs…/);
    expect(card.textContent).not.toMatch(/Terrain similarity:/);
    expect(card.textContent).not.toMatch(/dataset/);
    expect(within(card).queryByRole("table")).toBeNull();
  });
});
