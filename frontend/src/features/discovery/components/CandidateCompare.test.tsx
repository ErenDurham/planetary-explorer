import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CandidateCompare } from "./CandidateCompare";
import { candidates, rankResponse, run } from "../test/fixtures";
import { downloadJson } from "../lib/download";
vi.mock("../lib/download", () => ({ downloadJson: vi.fn() }));

describe("Discovery research shortlist", () => {
  it("compares server measurements and only shows scores from the current ranking", () => {
    const ranking = rankResponse({ run_id: run.run_id, top_k: 1, reference_id: "jezero_crater" });
    render(<CandidateCompare saved={candidates.slice(0,2)} ranking={ranking} runId={run.run_id} onRemove={() => {}} onResearch={() => {}} />);
    const table = screen.getByRole("table");
    expect(table).toHaveTextContent("Jezero Crater");
    expect(table).toHaveTextContent("1.3°");
    expect(table).toHaveTextContent("77.1");
    expect(table).not.toHaveTextContent("61.4");
    expect(table).toHaveTextContent("Outside current results");
  });
  it("hands the actual candidate to research and exports selections without stale scores", () => {
    const onResearch = vi.fn(), onRemove = vi.fn();
    render(<CandidateCompare saved={[candidates[1]]} runId={run.run_id} onRemove={onRemove} onResearch={onResearch} />);
    fireEvent.click(screen.getByRole("button", { name: "Research candidate" }));
    expect(onResearch).toHaveBeenCalledWith(candidates[1].id);
    fireEvent.click(screen.getByRole("button", { name: "Download shortlist" }));
    const exported = vi.mocked(downloadJson).mock.calls.at(-1)![1] as { candidates: Array<Record<string,unknown>> };
    expect(exported.candidates[0].id).toBe(candidates[1].id);
    expect(exported.candidates[0]).not.toHaveProperty("similarity_index");
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: /Remove/ }));
    expect(onRemove).toHaveBeenCalledWith(candidates[1]);
  });
});
it("includes new survey dimensions in a preserved shortlist", () => {
 const extra = { ...candidates[0].feature_distances![0], feature_id: "precipitation_mm_day", earth_value: .2, mars_value: 0, unit: "mm/day" };
 const saved = { ...candidates[0], feature_distances: [...candidates[0].feature_distances!,extra] };
 render(<CandidateCompare saved={[saved]} runId={run.run_id} onRemove={()=>{}} onResearch={()=>{}}/>);
 expect(screen.getByRole("table")).toHaveTextContent("0.2 mm/day");
});
