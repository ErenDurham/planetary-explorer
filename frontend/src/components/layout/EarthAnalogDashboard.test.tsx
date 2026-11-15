// The Earth analog board must say only what the service said. These tests pin the
// two ways that can go wrong: inventing content for an empty field, and showing a
// picture that is not the verified image of the site it is labelled with.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EarthAnalogDashboard } from "./EarthAnalogDashboard";
import matchJezero from "@/test/fixtures/analog_match_jezero.json";
import type { SiteImagery } from "@/types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const imagery = (site_id: string, body: "earth" | "mars"): SiteImagery => ({
  site_id, body, missing_views: [], notes: [],
  entries: [{ entry_id: `${site_id}_orbital`, site_id, view: "orbital", image_type: "orbital_mosaic", title: `${site_id} mosaic`,
    institution: "USGS", credit: `Credit for ${site_id}`, license: "Public domain", source_page_url: "https://example.org",
    asset_url: "https://example.org/a.jpg", width_px: 800, height_px: 600, acquisition_date: null, release_date: "2020-01-01",
    spatial_resolution_m_per_px: 30, bounds: null, coverage_evidence: "test", relationship: "exact_location",
    distance_from_site_km: 0, relevance: "test", verified_on: "2026-11-15" }],
} as unknown as SiteImagery);

function mount(props: { marsSiteId?: string | null } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><EarthAnalogDashboard {...props} /></QueryClientProvider>);
}

describe("EarthAnalogDashboard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.includes("/analogs/match")) return json(matchJezero);
      const m = /\/sites\/([^/]+)\/imagery/.exec(url);
      if (m) return json(imagery(m[1], m[1] === "jezero_crater" ? "mars" : "earth"));
      return json({ error: { code: "not_found", message: url } }, 404);
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("ranks the established analogs from the service and names each one's documented use", async () => {
    mount({ marsSiteId: "jezero_crater" });
    const list = await screen.findByRole("list", { name: "Established Earth analogs" });
    expect(within(list).getAllByRole("button")).toHaveLength(matchJezero.matches.length);
    const first = matchJezero.matches[0];
    const top = within(list).getByRole("button", { name: new RegExp(first.earth_candidate.name) });
    expect(top).toHaveAttribute("aria-pressed", "true");
    expect(top).toHaveTextContent(first.similarity.toFixed(1));  // shown to one decimal, as everywhere else
    // the counts are the service's list lengths, not a claim about the site
    expect(top).toHaveTextContent(`${first.shared_characteristics.length} shared`);
    expect(top).toHaveTextContent(`${first.documented_analog_use.length} documented campaigns`);
    // the comparison repeats the service's own sentences verbatim
    const comparison = await screen.findByRole("region", { name: new RegExp(`Analog comparison: ${first.earth_candidate.name}`) });
    for (const sentence of first.shared_characteristics) expect(comparison).toHaveTextContent(sentence.slice(0, 40));
    for (const use of first.documented_analog_use) expect(comparison).toHaveTextContent(use);
    // every fundamental difference is disclosed, not just the ones that scored
    for (const d of matchJezero.planetary_differences) expect(comparison).toHaveTextContent(d.slice(0, 40));
  });

  it("shows only verified imagery, with its recorded credit and licence", async () => {
    mount({ marsSiteId: "jezero_crater" });
    const comparison = await screen.findByRole("region", { name: /Analog comparison/ });
    const images = await within(comparison).findAllByRole("img");
    expect(images.length).toBeGreaterThanOrEqual(2);
    for (const img of images) {
      // served by the backend asset endpoint; never a third-party stock photograph
      expect(img.getAttribute("src")).toMatch(/\/api\/v1\/imagery\/[^/]+\/asset/);
      expect(img.getAttribute("src")).not.toMatch(/unsplash|images\.pexels|stock/i);
    }
    expect(comparison).toHaveTextContent(/Credit for /);
    expect(comparison).toHaveTextContent(/Public domain/);
  });

  it("reports an absent field as a gap in the catalogue rather than filling it in", async () => {
    const stripped = { ...matchJezero, matches: [{ ...matchJezero.matches[0], documented_analog_use: [], shared_characteristics: [] }] };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.includes("/analogs/match")) return json(stripped);
      const m = /\/sites\/([^/]+)\/imagery/.exec(url);
      return m ? json(imagery(m[1], "earth")) : json({ error: { code: "not_found", message: url } }, 404);
    }));
    mount({ marsSiteId: "jezero_crater" });
    const comparison = await screen.findByRole("region", { name: /Analog comparison/ });
    expect(comparison).toHaveTextContent(/No analog campaign is recorded for this location in our sources/);
    expect(comparison).toHaveTextContent(/a gap in the catalogue, not evidence that none exists/);
    expect(comparison).toHaveTextContent(/no feature close enough to report as shared/);
  });

  it("lets a reader open any analog and follows the service's order when the reference changes", async () => {
    const { rerender } = mount({ marsSiteId: "jezero_crater" });
    const list = await screen.findByRole("list", { name: "Established Earth analogs" });
    const second = matchJezero.matches[1];
    fireEvent.click(within(list).getByRole("button", { name: new RegExp(second.earth_candidate.name) }));
    await waitFor(() => expect(screen.getByRole("region", { name: new RegExp(`Analog comparison: ${second.earth_candidate.name}`) })).toBeInTheDocument());
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(<QueryClientProvider client={qc}><EarthAnalogDashboard marsSiteId="elysium_planitia" /></QueryClientProvider>);
    // a new reference re-ranks: the selection returns to the service's top result
    await waitFor(() => expect(screen.getByRole("region", { name: new RegExp(`Analog comparison: ${matchJezero.matches[0].earth_candidate.name}`) })).toBeInTheDocument());
  });
});
