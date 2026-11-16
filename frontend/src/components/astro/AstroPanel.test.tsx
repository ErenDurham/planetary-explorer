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
      activeTab: "explore", exploreMode: "browse",
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
    const info = screen.getByLabelText("About this answer").closest("details")!;
    expect(screen.getByText(/Answering from computed data/)).not.toBeVisible();
    fireEvent.mouseEnter(info);
    expect(screen.getByText(/Answering from computed data/)).toBeVisible();
    fireEvent.mouseLeave(info);
    expect(info.open).toBe(false);
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
    expect(screen.queryByText(/AI unavailable|Answering from computed data/)).toBeNull();
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

describe("Astro page context", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation(() => ({ matches:false, addEventListener:vi.fn(), removeEventListener:vi.fn() })));
    useAstroStore.getState().clear();
    useAppStore.setState({activeTab:"explore", viewedBody:"earth", selectionBody:"mars", mapMode:"analog_match", missionType:"research", selectedMarsId:"jezero_crater", selectedEarthId:null});
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  async function ask(text: string) {
    if (!screen.queryByRole("textbox", {name:"Message Astro"})) fireEvent.click(screen.getByRole("button", {name:"Expand Astro"}));
    fireEvent.change(screen.getByRole("textbox", {name:"Message Astro"}), {target:{value:text}});
    fireEvent.click(screen.getByRole("button", {name:"Send message"}));
    await act(async()=>{});
  }
  it("does not send the Mars research assessment while viewing Earth analogs", async () => {
    const send=vi.spyOn(api,"astroChat").mockResolvedValue(response);
    render(<AstroPanel/>);
    await ask("Compare candidates 1 and 2");
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({assessment:null, viewed_body:"earth",map_mode:"analog_match"}));
  });
  it("keeps Research on Mars when an Earth task is active", async () => {
    useAppStore.setState({activeTab:"research", selectionBody:"earth", missionType:"rover_field_test"});
    const send=vi.spyOn(api,"astroChat").mockResolvedValue(response);
    render(<AstroPanel/>);
    await ask("Tell me about Jezero");
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({assessment:null, active_tab:"research"}));
  });
  it("does not reuse history from a different selection or mission", async () => {
    const send=vi.spyOn(api,"astroChat").mockResolvedValue(response);
    render(<AstroPanel/>);
    await ask("Explain this ranking");
    await act(async()=>{useAppStore.setState({selectedMarsId:"oxia_planum", appliedObjective:"Study clays"});});
    await ask("What about the evidence?");
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({history:[]}));
  });
});

describe("Astro task-page body", () => {
  afterEach(()=>{cleanup(); vi.restoreAllMocks();});
  it("sends the mission body while Mission Design is open after Earth browsing", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockImplementation(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
    useAstroStore.getState().clear();
    useAppStore.setState({activeTab:"mission",selectionBody:"mars",viewedBody:"earth",missionType:"landing",mapMode:"analog_match"});
    const send=vi.spyOn(api,"astroChat").mockResolvedValue(response);
    render(<AstroPanel/>);
    fireEvent.click(screen.getByRole("button",{name:"Expand Astro"}));
    fireEvent.change(screen.getByRole("textbox",{name:"Message Astro"}),{target:{value:"Compare candidates 1 and 2"}});
    fireEvent.click(screen.getByRole("button",{name:"Send message"}));
    await act(async()=>{});
    expect(send).toHaveBeenCalledWith(expect.objectContaining({viewed_body:"mars",map_mode:"landing_suitability"}));
  });
});

it("sends survey context instead of catalog assessment in Find Analogs", async()=>{
  const {useDiscoveryStore}=await import("@/features/discovery/store/useDiscoveryStore");
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
  useAstroStore.getState().clear();
  useAppStore.setState({activeTab:"explore",exploreMode:"find_analogs",viewedBody:"earth",selectionBody:"earth",missionType:"rover_field_test",mapMode:"mission_browse"});
  useDiscoveryStore.setState({runId:"survey-test",weights:{slope:100},topK:6,runs:{"survey-test":{ranked:true,selectedCandidateId:"new-site",autoSelected:true,shortlist:[]}}});
  const send=vi.spyOn(api,"astroChat").mockResolvedValue(response);
  render(<AstroPanel/>);
  fireEvent.click(screen.getByRole("button",{name:"Expand Astro"}));
  fireEvent.change(screen.getByRole("textbox",{name:"Message Astro"}),{target:{value:"Compare candidates 1 and 2"}});
  fireEvent.click(screen.getByRole("button",{name:"Send message"}));
  await act(async()=>{});
  expect(send).toHaveBeenCalledWith(expect.objectContaining({assessment:null,discovery:{ranking:{run_id:"survey-test",reference_id:"jezero_crater",weights:{slope:100},top_k:6},selected_candidate_id:"new-site"}}));
  cleanup();vi.restoreAllMocks();
});
