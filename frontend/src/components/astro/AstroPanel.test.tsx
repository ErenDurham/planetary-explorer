import {
  fireEvent,
  render,
  screen,
  cleanup,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AstroPanel } from "./AstroPanel";
import { api } from "@/services/api";
import { useAppStore } from "@/store/useAppStore";
import { useAstroStore } from "./astroState";
const response = {
  answer: "Inspect the regional evidence.",
  context_label: "Mars · Jezero",
  generated_by: "deterministic_fallback" as const,
  facts: [],
  evidence: [],
  citations: [],
  actions: [
    {
      id: "research",
      label: "Open Research",
      tab: "research" as const,
      body: null,
      location_id: null,
    },
  ],
  limitations: [],
};
describe("Astro", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((media: string) => ({
        matches: false,
        media,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    useAstroStore.getState().clear();
    useAppStore.setState({
      viewedBody: "mars",
      selectedMarsId: "jezero_crater",
      selectedEarthId: null,
      activeTab: "explore",
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  it("starts compact and shows a placeholder without inserting a question", () => {
    render(<AstroPanel />);
    expect(screen.queryByRole("textbox", { name: "Message Astro" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand Astro" }));
    const input = screen.getByRole("textbox", { name: "Message Astro" });
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute(
      "placeholder",
      "Why does this site rank this way?",
    );
    fireEvent.focus(input);
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("placeholder", "");
  });
  it("keeps conversation through collapse and only navigates on explicit action", async () => {
    vi.spyOn(api, "astroChat").mockResolvedValue(response);
    render(<AstroPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Astro" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message Astro" }), {
      target: { value: "What next?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Inspect the regional evidence.");
    expect(useAppStore.getState().activeTab).not.toBe("research");
    fireEvent.click(screen.getByRole("button", { name: "Collapse Astro" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand Astro" }));
    expect(screen.getByText("Inspect the regional evidence.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open Research" }));
    expect(useAppStore.getState().activeTab).toBe("research");
  });
  it("labels old context and clears a pending conversation without resurrecting it", async () => {
    let resolve!: (v: typeof response) => void;
    vi.spyOn(api, "astroChat").mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<AstroPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Astro" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message Astro" }), {
      target: { value: "Why?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await act(async () => {
      useAppStore.setState({ selectedMarsId: "gale_crater" });
      resolve(response);
    });
    await screen.findByText(/Earlier context/);
    fireEvent.click(screen.getByRole("button", { name: "Clear conversation" }));
    expect(
      screen.queryByText("Inspect the regional evidence."),
    ).not.toBeInTheDocument();
  });
  it("opens the resolved Compare Mars location on an explicit Research action", async () => {
    useAppStore.setState({
      activeTab: "compare",
      selectedMarsId: null,
      comparisonPair: { marsId: "jezero_crater", earthId: "atacama_yungay" },
    });
    vi.spyOn(api, "astroChat").mockResolvedValue({
      ...response,
      actions: [
        {
          id: "research",
          label: "Research displayed location",
          tab: "research",
          body: "mars",
          location_id: "jezero_crater",
        },
      ],
    });
    render(<AstroPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Astro" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message Astro" }), {
      target: { value: "What next?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Research displayed location",
      }),
    );
    expect(useAppStore.getState().selectedMarsId).toBe("jezero_crater");
    expect(useAppStore.getState().activeTab).toBe("research");
  });
  it("offers retry after network failure", async () => {
    vi.spyOn(api, "astroChat")
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValue(response);
    render(<AstroPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Astro" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message Astro" }), {
      target: { value: "Why?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByRole("button", { name: "Retry message" });
    fireEvent.click(screen.getByRole("button", { name: "Retry message" }));
    await screen.findByText("Inspect the regional evidence.");
    expect(api.astroChat).toHaveBeenCalledTimes(2);
  });
});
