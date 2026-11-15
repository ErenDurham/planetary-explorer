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
      missionType: "landing",
      selectionBody: "mars",
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
  it("keeps explanations through collapse without navigation clutter", async () => {
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
    expect(screen.queryByRole("button", { name: "Open Research" })).toBeNull();
    expect(screen.queryByText("Computed context")).toBeNull();
    expect(screen.getByText(/Using a site summary/)).toBeVisible();
    expect(screen.queryByText("Mars · Jezero", { exact: true })).toBeNull();
    expect(useAppStore.getState().activeTab).toBe("explore");
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
  it("uses the displayed Compare pair without changing navigation", async () => {
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
    await screen.findByText("Inspect the regional evidence.");
    expect(screen.queryByRole("button", { name: "Research displayed location" })).toBeNull();
    expect(api.astroChat).toHaveBeenCalledWith(expect.objectContaining({ selected_mars_id: "jezero_crater" }));
    expect(useAppStore.getState().activeTab).toBe("compare");
  });
  it("sends the active Earth task assessment without action buttons", async () => {
    useAppStore.setState({
      activeTab: "analyze",
      missionType: "research",
      selectionBody: "earth",
      viewedBody: "mars",
      mapMode: "mission_browse",
      selectedMarsId: null,
      selectedEarthId: "atacama_yungay",
    });
    vi.spyOn(api, "astroChat").mockResolvedValue({
      ...response,
      context_label: "Earth · Atacama",
      actions: [
        {
          id: "analyze",
          label: "Inspect task mission factors",
          tab: "analyze",
          body: "earth",
          location_id: "atacama_yungay",
        },
      ],
    });
    render(<AstroPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Astro" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message Astro" }), {
      target: { value: "Why this task fit?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Inspect the regional evidence.");
    expect(screen.queryByRole("button", { name: "Inspect task mission factors" })).toBeNull();
    expect(api.astroChat).toHaveBeenCalledWith(
      expect.objectContaining({
        assessment: expect.objectContaining({
          body: "earth",
          mission_type: "research",
        }),
        map_mode: "mission_browse",
      }),
    );
    expect(useAppStore.getState().selectedEarthId).toBe("atacama_yungay");
    expect(useAppStore.getState().activeTab).toBe("analyze");
  });
  it("does not label an instant greeting as an AI failure", async () => {
    vi.spyOn(api, "astroChat").mockResolvedValue({ ...response, generated_by: "local", actions: [] });
    render(<AstroPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Astro" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message Astro" }), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Inspect the regional evidence.");
    expect(screen.queryByText(/AI unavailable|Using a site summary/)).toBeNull();
    expect(screen.queryByText("Mars · Jezero", { exact: true })).toBeNull();
  });
  it("resizes from the top with keyboard access and resets on double click", () => {
    render(<AstroPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Astro" }));
    const handle = screen.getByRole("separator", { name: "Resize Astro height" });
    const surface = screen.getByRole("region", { name: "Astro research assistant" });
    fireEvent.keyDown(handle, { key: "Home" });
    expect(surface).toHaveStyle({ height: "180px" });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(surface).toHaveStyle({ height: "212px" });
    fireEvent.doubleClick(handle);
    expect(surface.style.height).toBe("");
  });
  it("resizes width from either side with keyboard access", () => {
    render(<AstroPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Astro" }));
    const surface = screen.getByRole("region", { name: "Astro research assistant" });
    const right = screen.getByRole("separator", { name: "Resize Astro from right" });
    fireEvent.keyDown(right, { key: "Home" });
    expect(surface).toHaveStyle({ width: "360px" });
    fireEvent.keyDown(right, { key: "ArrowRight" });
    expect(surface).toHaveStyle({ width: "392px" });
    fireEvent.doubleClick(right);
    expect(surface.style.width).toBe("");
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
