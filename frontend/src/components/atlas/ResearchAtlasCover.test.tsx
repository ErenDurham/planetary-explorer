import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { ResearchAtlasCover } from "./ResearchAtlasCover";
import imagery from "@/test/fixtures/imagery_jezero.json";
import type { Site } from "@/types";

const site = { id: "jezero_crater", name: "Jezero Crater", lat: 18.4447, lon_east: 77.4508, description: "Ancient lake basin." } as Site;
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["imagery", site.id], imagery);
  return { client, wrap: (child: React.ReactNode) => <QueryClientProvider client={client}>{child}</QueryClientProvider> };
}

describe("sourced research dossier", () => {
  it("loads the allow-listed image by entry id, retains credit, and handles a failed image explicitly", () => {
    const { wrap } = setup();
    render(wrap(<ResearchAtlasCover site={site} />));
    expect(screen.queryByRole("navigation",{name:"Research dossier sections"})).toBeNull();
    const entry = imagery.entries.find(e => e.view === "surface")!;
    const image = screen.getByRole("img");
    expect(image.getAttribute("src")).toContain(`/imagery/${entry.entry_id}/asset`);
    expect(screen.getByRole("link", { name: `${entry.credit} ↗` })).toHaveAttribute("href", entry.source_page_url);
    fireEvent.error(image);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Site imagery unavailable");
  });
  it("does not show the previous site's imagery or credit after a region change", () => {
    const { client, wrap } = setup();
    client.setQueryData(["imagery", "gale_crater"], { site_id: "gale_crater", body: "mars", entries: [], notes: [], missing_views: ["orbital", "surface"] });
    const { rerender } = render(wrap(<ResearchAtlasCover site={site} />));
    expect(screen.getByRole("img")).toBeInTheDocument();
    rerender(wrap(<ResearchAtlasCover site={{ ...site, id: "gale_crater", name: "Gale Crater" }} />));
    expect(screen.getByRole("heading", { name: "Gale Crater" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("link", { name: `${imagery.entries.find(e => e.view === "surface")!.credit} ↗` })).toBeNull();
  });
});
