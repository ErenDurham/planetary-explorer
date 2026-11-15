import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import fixture from "@/test/fixtures/mission_assessment.json";
import type { MissionAssessmentResponse } from "@/types";
import { MissionAssessmentList } from "./MissionAssessmentView";

const earth = fixture.earth as unknown as MissionAssessmentResponse;

describe("MissionAssessmentList", () => {
  it("keeps compact ranked rows when switching the mission body", () => {
    const onSelect = vi.fn();
    const props = { pending: false, error: null, selectedId: earth.results[0].site_id, onSelect };
    const { rerender } = render(<MissionAssessmentList {...props} data={earth} />);
    expect(screen.getByRole("heading", { name: "Ranked candidates" })).toBeInTheDocument();
    const first = within(screen.getByRole("list", { name: "Ranked sites" })).getAllByRole("button")[0];
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(first.querySelector('[aria-hidden] span')).toHaveStyle({ width: `${earth.results[0].score}%` });
    expect(first).toHaveAccessibleName(/Data available for 100% of the weighted factors/);
    fireEvent.click(first);
    expect(onSelect).toHaveBeenCalledWith(earth.results[0].site_id);
    const mars = { ...earth, body: "mars" as const, results: earth.results.map(r => ({ ...r, body: "mars" as const })) };
    rerender(<MissionAssessmentList {...props} data={mars} />);
    expect(within(screen.getByRole("list", { name: "Ranked sites" })).getAllByRole("button")[0].className).toBe(first.className);
    const buttons = screen.getAllByRole("button");
    fireEvent.keyDown(buttons[0], { key: "ArrowDown" });
    expect(buttons[1]).toHaveFocus();
  });
  it("keeps unavailable scores distinct from zero and offers requirements review", () => {
    const data = { ...earth, results: [{ ...earth.results[0], score: null, rank: null, status: "needs_requirements" as const }] };
    render(<MissionAssessmentList data={data} pending={false} error={null} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText("needs targets")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Review mission requirements" })).toBeInTheDocument();
  });
});
