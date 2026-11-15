// Color Blind Mode in Explore: the ranked lists' score bars and the selected
// site's score use the single-hue scale instead of ROYGBIV.
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import api from "@/test/fixtures/api_examples.json";
import mission from "@/test/fixtures/mission_assessment.json";
import { RankedList } from "./RankedList";
import { MissionAssessmentList } from "./MissionAssessmentView";
import { SuitabilityPanel } from "./SuitabilityPanel";
import { ROYGBIV_STOPS, SINGLE_HUE_STOPS } from "@/lib/rankColor";
import type { EvaluateResponse, MissionAssessmentResponse } from "@/types";

const evaluation = api.evaluate as unknown as EvaluateResponse;
const earth = mission.earth as unknown as MissionAssessmentResponse;
const firstBar = () => within(screen.getByRole("list", { name: "Ranked sites" })).getAllByRole("button")[0].querySelector("[aria-hidden] span");
const hex = (c: string) => { const [r, g, b] = c.slice(1).match(/../g)!.map(h => parseInt(h, 16)); return `rgb(${r}, ${g}, ${b})`; };

describe("Explore rank colours follow Color Blind Mode", () => {
  it("Mars ranked list", () => {
    const { rerender } = render(<RankedList results={evaluation.results} selectedId={null} onSelect={() => {}} />);
    expect(firstBar()).toHaveStyle({ backgroundColor: hex(ROYGBIV_STOPS[0]) });
    rerender(<RankedList results={evaluation.results} selectedId={null} onSelect={() => {}} palette="single_hue" />);
    expect(firstBar()).toHaveStyle({ backgroundColor: hex(SINGLE_HUE_STOPS[0]) });
  });
  it("mission ranked list", () => {
    render(<MissionAssessmentList data={earth} pending={false} error={null} selectedId={null} onSelect={() => {}} palette="single_hue" />);
    expect(firstBar()).toHaveStyle({ backgroundColor: hex(SINGLE_HUE_STOPS[0]) });
  });
  it("selected site's score", () => {
    const top = evaluation.results.find(r => r.rank === 1 && r.status === "ok")!;
    render(<SuitabilityPanel result={top} totalRanked={5} palette="single_hue" />);
    expect(screen.getAllByText("/ 100")[0].parentElement).toHaveStyle({ color: hex(SINGLE_HUE_STOPS[0]) });
  });
});
