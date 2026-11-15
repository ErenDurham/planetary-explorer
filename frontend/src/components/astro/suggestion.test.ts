import { describe, expect, it } from "vitest";
import { astroSuggestion } from "./suggestion";
describe("Contextual suggestions", () => {
  it("uses Mars context in Analyze after the Earth globe was viewed", () => {
    expect(
      astroSuggestion({
        tab: "analyze",
        body: "earth",
        hasMars: true,
        hasEarth: true,
        hasConversation: false,
      }),
    ).toBe("Why does this site rank this way?");
  });
  it("uses the Earth task context for Analyze rather than the remembered Mars globe", () => {
    expect(
      astroSuggestion({
        tab: "analyze",
        body: "mars",
        analysisBody: "earth",
        taskMission: true,
        hasMars: false,
        hasEarth: true,
        hasConversation: false,
      }),
    ).toBe("Which factors explain this site’s mission fit?");
  });
  it("does not refer to a selected site after deselection", () => {
    expect(
      astroSuggestion({
        tab: "explore",
        body: "mars",
        hasMars: false,
        hasEarth: false,
        hasConversation: false,
      }),
    ).toBe("Help me find a Mars site for my research.");
  });
  it("offers a site-specific question only with the relevant selection", () => {
    expect(
      astroSuggestion({
        tab: "explore",
        body: "mars",
        hasMars: true,
        hasEarth: false,
        hasConversation: false,
      }),
    ).toMatch(/this site/);
    expect(
      astroSuggestion({
        tab: "explore",
        body: "earth",
        hasMars: false,
        hasEarth: true,
        hasConversation: false,
      }),
    ).not.toMatch(/Mars reference/);
  });
});
