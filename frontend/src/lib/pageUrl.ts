// The page you are on lives in the URL hash (#explore, #explore/find_analogs,
// #research ...), so reloading or sharing the address reopens the same page.
import type { ExploreMode, Tab } from "@/store/useAppStore";

const TABS: Tab[] = ["home", "mission", "explore", "analyze", "compare", "research"];
export interface Page { activeTab: Tab; exploreMode: ExploreMode }

export function pageFromHash(hash: string): Partial<Page> {
  const [tab, mode] = hash.replace(/^#\/?/, "").split("/");
  if (!TABS.includes(tab as Tab)) return {};
  return tab === "explore" ? { activeTab: "explore", exploreMode: mode === "find_analogs" ? "find_analogs" : "browse" } : { activeTab: tab as Tab };
}

export function hashForPage({ activeTab, exploreMode }: Page): string {
  if (activeTab === "home") return "";
  return activeTab === "explore" && exploreMode === "find_analogs" ? "#explore/find_analogs" : `#${activeTab}`;
}
