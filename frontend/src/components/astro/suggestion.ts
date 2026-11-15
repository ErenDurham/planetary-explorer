import type { Body, Tab } from "@/store/useAppStore";
export function astroSuggestion(context: {
  tab: Tab;
  body: Body;
  hasMars: boolean;
  hasEarth: boolean;
  hasConversation: boolean;
}): string {
  const { tab, body, hasMars, hasEarth, hasConversation } = context;
  if (tab === "mission") return "Which priorities fit my research objective?";
  if (tab === "compare")
    return hasMars && hasEarth
      ? "What are the key differences in this pair?"
      : "Help me choose an Earth–Mars pair to compare.";
  const selected = ["research", "analyze"].includes(tab)
    ? hasMars
    : body === "mars"
      ? hasMars
      : hasEarth;
  if (!selected)
    return body === "earth" && tab === "explore"
      ? "Help me find an Earth analog for my research."
      : "Help me find a Mars site for my research.";
  if (hasConversation) return "What should I investigate next?";
  if (tab === "research")
    return "Which evidence gaps should I investigate here?";
  if (body === "earth" && tab === "explore")
    return hasMars
      ? "How does this location compare with my Mars reference?"
      : "What could I study at this Earth location?";
  return "Why does this site rank this way?";
}
