import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import fixture from "@/test/fixtures/api_examples.json";
import { RankedList } from "./RankedList";
import type { EvaluateResponse, SuitabilityResult } from "@/types";

const evaluation = fixture.evaluate as unknown as EvaluateResponse;

describe("RankedList", () => {
  it("renders every result in rank order with number, score and status text", () => {
    render(<RankedList results={evaluation.results} selectedId={null} onSelect={() => {}} warnings={evaluation.warnings} />);
    const items = within(screen.getByRole("list", { name: "Ranked sites" })).getAllByRole("listitem");
    expect(items).toHaveLength(evaluation.results.length);
    expect(items[0]).toHaveTextContent("1");
    expect(items[0]).toHaveTextContent("Chryse Planitia");
    expect(items[0]).toHaveTextContent("98.7");
    expect(items[0]).toHaveTextContent("ok");
    expect(items[items.length - 1]).toHaveTextContent("Gale Crater");
  });
  it("shows the backend warnings", () => {
    render(<RankedList results={evaluation.results} selectedId={null} onSelect={() => {}} warnings={evaluation.warnings} />);
    expect(screen.getByText(/Temperature data is unavailable/)).toBeInTheDocument();
  });
  it("selects a site on click and marks the selected row", () => {
    const onSelect = vi.fn();
    render(<RankedList results={evaluation.results} selectedId="oxia_planum" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Jezero Crater/ }));
    expect(onSelect).toHaveBeenCalledWith("jezero_crater");
    expect(screen.getByRole("button", { name: /Oxia Planum/ })).toHaveAttribute("aria-pressed", "true");
  });
  it("moves keyboard focus without selecting or loading a site", () => {
    const onSelect = vi.fn();
    render(<RankedList results={evaluation.results} selectedId={null} onSelect={onSelect} />);
    const buttons = within(screen.getByRole("list", { name: "Ranked sites" })).getAllByRole("button");
    buttons[0].focus();
    fireEvent.keyDown(buttons[0], { key: "ArrowDown" });
    expect(buttons[1]).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(buttons[1], { key: "End" });
    expect(buttons.at(-1)).toHaveFocus();
    fireEvent.keyDown(buttons.at(-1)!, { key: "Home" });
    expect(buttons[0]).toHaveFocus();
  });
  it("renders ineligible and insufficient-data rows without a rank or score", () => {
    const results: SuitabilityResult[] = [
      { ...evaluation.results[0] },
      { ...evaluation.results[1], status: "insufficient_data", score: null, rank: null },
      { ...evaluation.results[2], status: "ineligible", score: null, rank: null },
    ];
    render(<RankedList results={results} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText("insufficient data")).toBeInTheDocument();
    expect(screen.getByText("ineligible")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});
