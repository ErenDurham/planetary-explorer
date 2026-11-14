import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CompareView } from "./CompareView";
import { useAppStore } from "@/store/useAppStore";
import catalog from "@/test/fixtures/comparison_catalog.json";

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState());
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(catalog)));
});
afterEach(() => vi.restoreAllMocks());
function view() {
  const onSelect = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const element = () => <QueryClientProvider client={client}><CompareView sites={[]} selectedId="elysium_planitia" onSelect={onSelect}/></QueryClientProvider>;
  const mounted = render(element());
  return { ...mounted, onSelect, element };
}
describe("cross-body comparison", () => {
  it("compares three worlds and preserves independent selections through pairwise views", async () => {
    const { onSelect, rerender, element } = view();
    const earth = await screen.findByLabelText("Earth location");
    expect(earth).toHaveValue("haughton_crater");
    expect(screen.getByLabelText("Mars location")).toHaveValue("elysium_planitia");
    fireEvent.change(screen.getByLabelText("Moon location"), { target: { value: "apollo_15" } });
    fireEvent.change(earth, { target: { value: "atacama_yungay" } });
    fireEvent.click(screen.getByRole("button", { name: "Mars ↔ Moon" }));
    expect(screen.queryByLabelText("Earth location")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Moon location")).toHaveValue("apollo_15");
    fireEvent.click(screen.getByRole("button", { name: "All three" }));
    expect(screen.getByLabelText("Earth location")).toHaveValue("atacama_yungay");
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Mars location"), { target: { value: "chryse_planitia" } });
    expect(onSelect).toHaveBeenCalledWith("chryse_planitia");
    rerender(<div/>); rerender(element());
    expect(screen.getByLabelText("Moon location")).toHaveValue("apollo_15");
    expect(useAppStore.getState().weights).toEqual({});
  });
  it("separates planetary references, missing lunar data and incompatible measurement definitions", async () => {
    view();
    await screen.findByLabelText("Moon location");
    const row = screen.getByRole("rowheader", { name: /Regional slope Median/ }).closest("tr")!;
    expect(within(row).getByText("Not available")).toBeInTheDocument();
    expect(within(row).queryByText("0 °")).not.toBeInTheDocument();
    expect(screen.getByText(/Earth values are 2 m air-temperature/)).toBeInTheDocument();
    expect(screen.getByText(/Different reference surfaces/)).toBeInTheDocument();
    expect(screen.getByText(/Body reference values/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Show" }), { target: { value: "body" } });
    expect(screen.queryByRole("rowheader", { name: /Regional slope/ })).not.toBeInTheDocument();
    expect(screen.getByText("1.62 m/s²")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All three" })).toHaveAttribute("aria-pressed", "true");
  });
  it("shows a recoverable API error without fabricating comparison values", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    view();
    expect(await screen.findByRole("button", { name: "Retry comparison" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
