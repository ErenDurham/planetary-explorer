import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAstroStore } from "./astroState";
import { api } from "@/services/api";
import type { AstroRequest, AstroResponse } from "@/types";
const request: AstroRequest = {
  question: "What next?",
  active_tab: "explore",
  viewed_body: "mars",
  map_mode: "landing_suitability",
  candidate_body: "mars",
  objective: "",
};
const response: AstroResponse = {
  answer: "Review evidence.",
  context_label: "Mars",
  generated_by: "deterministic_fallback",
  facts: [],
  evidence: [],
  citations: [],
  actions: [],
  limitations: [],
};
beforeEach(() => {
  vi.restoreAllMocks();
  useAstroStore.getState().clear();
});
describe("Astro session", () => {
  it("does not restore cleared messages when an old request finishes", async () => {
    let resolve!: (value: AstroResponse) => void;
    vi.spyOn(api, "astroChat").mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = useAstroStore.getState().send(request, "old");
    useAstroStore.getState().clear();
    resolve(response);
    await pending;
    expect(useAstroStore.getState().entries).toEqual([]);
    expect(useAstroStore.getState().pending).toBe(false);
  });
  it("does not let a cleared request overwrite a newer request", async () => {
    let oldResolve!: (value: AstroResponse) => void;
    let newResolve!: (value: AstroResponse) => void;
    vi.spyOn(api, "astroChat")
      .mockReturnValueOnce(
        new Promise((r) => {
          oldResolve = r;
        }),
      )
      .mockReturnValueOnce(
        new Promise((r) => {
          newResolve = r;
        }),
      );
    const old = useAstroStore.getState().send(request, "old");
    useAstroStore.getState().clear();
    const current = useAstroStore
      .getState()
      .send({ ...request, question: "New question" }, "new");
    oldResolve(response);
    await old;
    expect(useAstroStore.getState().pending).toBe(true);
    newResolve(response);
    await current;
    expect(useAstroStore.getState().entries).toHaveLength(1);
    expect(useAstroStore.getState().entries[0].question).toBe("New question");
  });
});
