import { expect, it } from "vitest";
import { hashForPage, pageFromHash } from "./pageUrl";
it("round-trips every page through the URL hash", () => {
  for (const page of [{ activeTab: "research", exploreMode: "browse" }, { activeTab: "explore", exploreMode: "browse" }, { activeTab: "explore", exploreMode: "find_analogs" }] as const) {
    expect(pageFromHash(hashForPage(page))).toMatchObject(page.activeTab === "explore" ? page : { activeTab: page.activeTab });
  }
  expect(hashForPage({ activeTab: "home", exploreMode: "browse" })).toBe("");
});
it("ignores an empty or unknown hash, so the app opens on Home", () => {
  expect(pageFromHash("")).toEqual({});
  expect(pageFromHash("#nonsense")).toEqual({});
});
