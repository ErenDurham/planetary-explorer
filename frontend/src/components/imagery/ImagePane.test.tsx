// The expand dialog is a real modal: focus moves in, Escape closes, focus returns.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ImagePane } from "./ImagePane";
import type { PaneImagery } from "@/hooks/usePairImagery";
import type { ImageryEntry, SiteImagery } from "@/types";

const photo = { entry_id: "pano", site_id: "x", view: "surface", image_type: "surface_panorama", title: "A panorama", institution: "Inst", credit: "NASA/JPL", license: "PD", source_page_url: "https://example.org", asset_url: "https://example.org/p.jpg", width_px: 1280, height_px: 339, acquisition_date: "2021-02-21", release_date: "2021-02-24", bounds: null, coverage_evidence: "e", relationship: "exact_location", distance_from_site_km: 0, relevance: "The ground at the site.", verified_on: "2026-11-14" } as unknown as ImageryEntry;
const data: SiteImagery = { site_id: "x", body: "mars", entries: [photo], missing_views: [], notes: [] };
const imagery: PaneImagery = { body: "mars", id: "x", status: "ready", data, error: null, reason: null, refetch: () => {} };
afterEach(() => vi.restoreAllMocks());

describe("ImagePane expand dialog", () => {
  it("opens an accessible dialog, closes on Escape and returns focus to the opener", () => {
    render(<ImagePane roleLabel="Selected on Mars" location={{ body: "mars", id: "x", name: "Site X", lat: 1, lonEast: 2, halfWidthDeg: 0.5 }} imagery={imagery} view="surface" sharedView="surface" onOverrideView={() => {}} entryId={null} onEntryChange={() => {}} zoom={1} onZoomChange={() => {}} onFitHeight={() => {}} />);
    const opener = screen.getByRole("button", { name: "Expand Site X image" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName(/Site X: A panorama/);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close expanded image" }));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    // acquisition and publication dates are labelled separately, and the photo is a real photograph entry
    expect(screen.getByText("Acquired").nextSibling).toHaveTextContent("2021-02-21");
    expect(screen.getByText("Published").nextSibling).toHaveTextContent(/2021-02-24.*publication date, not capture date/);
    expect(screen.getByRole("img", { name: /A panorama\. The ground at the site\./ })).toBeInTheDocument();
  });
});

describe("ImagePane image arrows", () => {
  it("steps through several images with left/right arrows (no drop-down) and hides them for a single image", () => {
    const two: PaneImagery = { ...imagery, data: { ...data, entries: [photo, { ...photo, entry_id: "pano2", title: "Second panorama" } as ImageryEntry] } };
    const onEntryChange = vi.fn();
    const pane = (entryId: string | null, im: PaneImagery) => <ImagePane roleLabel="Selected on Mars" location={{ body: "mars", id: "x", name: "Site X", lat: 1, lonEast: 2, halfWidthDeg: 0.5 }} imagery={im} view="surface" sharedView="surface" onOverrideView={() => {}} entryId={entryId} onEntryChange={onEntryChange} zoom={1} onZoomChange={() => {}} onFitHeight={() => {}} />;
    const { rerender } = render(pane(null, two));
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByTestId("compare-image-title")).toHaveTextContent("A panorama1 of 2");
    fireEvent.click(screen.getByRole("button", { name: "Next field photos image for Site X" }));
    expect(onEntryChange).toHaveBeenLastCalledWith("pano2");
    fireEvent.click(screen.getByRole("button", { name: "Previous field photos image for Site X" }));
    expect(onEntryChange).toHaveBeenLastCalledWith("pano2");   // wraps from the first to the last
    rerender(pane("pano2", two));
    expect(screen.getByTestId("compare-image-title")).toHaveTextContent("Second panorama2 of 2");
    rerender(pane(null, imagery));
    expect(screen.queryByRole("button", { name: /Next field photos image/ })).toBeNull();
  });
});
