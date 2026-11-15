import { useRegionTarget } from "@/features/regions/store";
import { useAppStore } from "@/store/useAppStore";
// The evidence panel for one candidate: the three reader questions (what
// matches, what differs, what we still need to investigate) answered from a
// rank-response candidate plus the detail row, the research entry where it is
// seen, and every quantitative justification behind Methods and data - each
// value traceable to a field, absent context reported as absent, and nothing
// claimed that the service did not say.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("answers what matches, what differs and what is still to investigate from returned data, with research one click away", async () => {
    mount();
    const card = screen.getByRole("article", { name: /Candidate evidence: Footprint c_31_75_m2_25/ });
    // identity and status, index explained, the research entry prominent
    expect(card).toHaveTextContent(/Rank 2 of 3/);
    expect(card).toHaveTextContent(/31\.750°N, 2\.250°W/);
    expect(card).toHaveTextContent(/centre of a 60 × 60 km footprint/);
    expect(card).toHaveTextContent(/61\.4.*terrain index · not a probability/);
    expect(card).toHaveTextContent(/slope 50%, relief 50%/);
    expect(within(card).getByTestId("research-this-candidate")).toHaveTextContent("Research this candidate");
    expect(within(card).queryByRole("button",{name:"Open in Research"})).toBeNull();
    // what matches: the closest factor, in regional-footprint terms
    const matches = within(card).getByRole("region", { name: "What matches" });
    expect(matches).toHaveTextContent(/Regional medians over the 60 × 60 km footprint, on 4 km cells; not rover-scale terrain/);
    expect(matches).toHaveTextContent(/Regional slope is close: 1\.30° here against 1\.08° at Jezero Crater/);
    expect(matches).toHaveTextContent(/regional median slope1\.3° here · 1\.077° at Jezero Crater/);
    // what differs: the larger factor, then what was never compared
    const differs = within(card).getByRole("region", { name: "What differs" });
    expect(differs).toHaveTextContent(/The larger difference is relief: 150 m against 194 m at Jezero Crater/);
    expect(differs).toHaveTextContent(/Not compared: climate, land cover, geology and materials/);
    expect(differs).toHaveTextContent(/no transfer has been validated/);
    // what we still need: gaps, the catalog relation, the validation steps, the research status
    const next = within(card).getByRole("region", { name: "What we still need to investigate" });
    expect(next).toHaveTextContent(/Climate context: not available/);
    expect(next).toHaveTextContent(/Geology: not assessed/);
    expect(next).toHaveTextContent(/not a claim of novelty/);
    expect(next).toHaveTextContent(/atacama yungay \(8,120 km\) is in the versioned catalog but not among this app's featured Earth regions/);
    expect(next).toHaveTextContent(/Acquire higher-resolution DEM/);
    const summary = within(next).getByTestId("candidate-research-summary");
    await waitFor(() => expect(summary).toHaveTextContent(/Unresearched: No literature review has been recorded for this candidate.*No notes saved yet\. 3 questions and 2 searches are prepared; background library available/));
    expect(mocks.research).toHaveBeenCalledWith(run.run_id, candidates[1].id, "", expect.anything());
    expect(mocks.saveResearch).not.toHaveBeenCalled();
    // methods and data: the factor table with shares, the formula and ranks, measurements and coverage, exclusions, context, sources, versions, limitations
    const methods = within(card).getByRole("region", { name: "Methods and data" });
    const score = within(methods).getByTestId("methods-score");
    const rows = within(within(score).getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(/Detrended regional relief.*150\.2 m.*194\.4 m.*50%.*75%/);
    expect(rows[1]).toHaveTextContent(/Regional median slope.*1\.3°.*1\.077°.*50%.*25%/);
    expect(score).toHaveTextContent(/D = 0\.629; index = 100 \/ \(1 \+ D\) = 61\.4/);
    expect(score).toHaveTextContent(/Rank 2 shown · raw rank 2 before the spacing rule \(centres at least 40 km apart\)/);
    const measured = within(methods).getByTestId("methods-measured");
    expect(measured).toHaveTextContent(/Regional median slope1\.3° \(derived\)/);
    expect(measured).toHaveTextContent(/cells of 4 km inside a 60 km footprint/);
    expect(measured).toHaveTextContent(/terrain 99\.0% · gradient 97\.0%/);
    expect(measured).toHaveTextContent(/Screening notes \(1\)/);
    expect(measured).toHaveTextContent(/Survey: 16 footprints generated, 14 with valid terrain, 3 eligible; excluded insufficient terrain coverage 2, within catalog buffer 1, land cover preference 10/);
    expect(measured.textContent).not.toMatch(/No missing-data cells/); // the fixture survey does not state no_nodata_fill, so the panel does not claim it
    const context = within(methods).getByTestId("methods-context");
    expect(context).toHaveTextContent(/ClimateNot available\./);
    expect(context).toHaveTextContent(/Rule for the catalog relation: 100 km centre buffer/);
    const sources = within(methods).getByTestId("methods-sources");
    expect(sources).toHaveTextContent(/Copernicus GLO-90 DEM — ESA \/ Airbus/);
    expect(sources).toHaveTextContent(/observed 2011-2015 \(TanDEM-X\) · retrieved 2026-11-14/);
    expect(sources).toHaveTextContent(/glo90 dataset2021_1/);
    expect(within(methods).getByTestId("methods-limits")).toHaveTextContent(/4 km cells do not resolve rover hazards/);
    // nothing the service did not say
    expect(card.textContent).not.toMatch(/unknown to science|validated analog|safe to|accessible|confirmed analog/i);
  });

  it("collapses repeated source tiles into one line with a count, and shows climate context as context", () => {
    const climate = { values: { air_temperature_c: 21.4, precipitation_mm_day: 0.3 }, scope: "Single survey-centre context, not a candidate measurement or score input", resolution: "0.5 x 0.625 deg grid", lat: 31.5, lon_east: -2.5, source: { title: "NASA POWER climatology", institution: "NASA POWER" } };
    mount({ candidate: { ...candidates[1], context: { climate, land_cover: null, geology_status: "not_assessed" } }, detail: { ...detail(candidates[1].id), source_manifest: [source, source, source, { ...source, source_id: "mola", title: "MOLA MEGDR", institution: "NASA PDS" }] } });
    const card = screen.getByRole("article", { name: /Candidate evidence/ });
    expect(within(card).getByTestId("methods-sources")).toHaveTextContent(/Copernicus GLO-90 DEM · 3 tiles — ESA \/ Airbus/);
    const ctx = within(card).getByTestId("methods-context");
    expect(ctx).toHaveTextContent(/air temperature c21\.4/);
    expect(ctx).toHaveTextContent(/Single survey-centre context, not a candidate measurement or score input · 0\.5 x 0\.625 deg grid · at 31\.50°N, 2\.50°W/);
    expect(within(card).getByRole("region", { name: "What we still need to investigate" }).textContent).not.toMatch(/Climate context: not available/);
  });

  it("reports what it has not got instead of inventing it", () => {
    mount({ candidate: { ...candidates[1], feature_distances: [], distance: null }, detail: undefined, detailPending: true, effectiveWeights: undefined, survey: null });
    const card = screen.getByRole("article", { name: /Candidate evidence/ });
    expect(within(card).getByRole("region", { name: "What matches" })).toHaveTextContent(/No factor breakdown was returned for this candidate/);
    expect(within(card).getByTestId("methods-measured")).toHaveTextContent(/Loading candidate inputs…/);
    expect(card.textContent).not.toMatch(/Terrain similarity:/);
    expect(card.textContent).not.toMatch(/dataset/);
    expect(within(card).queryByRole("table")).toBeNull();
  });
});

 it("opens Analyze and Compare with the discovered run and candidate rather than a curated ID", () => {
   mount();
   fireEvent.click(screen.getByRole("button", {name:"Analyze region"}));
   expect(useRegionTarget.getState().target).toEqual({kind:"discovered",runId:run.run_id,id:candidates[1].id});
   expect(useAppStore.getState().activeTab).toBe("analyze");
   fireEvent.click(screen.getByRole("button", {name:"Compare region"}));
   expect(useAppStore.getState().activeTab).toBe("compare");
   useRegionTarget.getState().clear();
 });
