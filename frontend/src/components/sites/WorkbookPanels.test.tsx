import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EarthAnalogNotesPanel, ReportedConditionsPanel, RoleBadge } from "./WorkbookPanels";
import { PairConditionsTable, pairNote } from "@/components/compare/PairConditionsTable";
import { passesRole, roleCounts } from "@/lib/roles";
import type { ComparisonLocation, ReportedCondition, WorkbookSource } from "@/types";

const SRC: Record<string, WorkbookSource> = {
  sharma: { source_id: "sharma", kind: "doi", cite: "Sharma et al., 2025", title: "Karstic caves in Hebrus Valles", url: "https://doi.org/10.3847/2041-8213/ae0f1c", year: 2025 },
};
const CONDS: ReportedCondition[] = [
  { feature: "mineralogy", label: "Mineralogy", text: "Carbonate- and sulfate-rich rocks", status: "verified", source_ids: ["sharma"], evidence_source_id: "sharma", evidence_quote: "TES data reveal enrichment in carbonates and sulfates", provenance: "literature-reported (workbook author)" },
  { feature: "elevation", label: "Elevation", text: null, status: "not_found_in_sources", source_ids: [], provenance: "literature-reported (workbook author)" },
  { feature: "thermal", label: "Thermal", text: null, note: "The workbook's source for this value is not on the approved source list.", status: "excluded_source", source_ids: [], provenance: "literature-reported (workbook author)" },
];

describe("workbook site information", () => {
  it("shows reported conditions with sources, and null cells as not found, never blank", () => {
    render(<ReportedConditionsPanel conditions={CONDS} sources={SRC} />);
    const min = screen.getByTestId("condition-mineralogy");
    expect(within(min).getByText("Carbonate- and sulfate-rich rocks")).toBeVisible();
    expect(within(min).getByRole("link", { name: "Sharma et al., 2025" })).toHaveAttribute("href", SRC.sharma.url);
    expect(within(min).getByText("quoted")).toBeVisible();
    expect(within(screen.getByTestId("condition-elevation")).getByText("Not found in sources")).toBeVisible();
    expect(within(screen.getByTestId("condition-thermal")).getByText("Not shown: no approved source")).toBeVisible();
  });

  it("renders a role badge and further analogs with what does not match", () => {
    render(<><RoleBadge role="Resource site" /><EarthAnalogNotesPanel analogs={[{ label: "Noctis", analog: "Río Tinto", where: "Huelva, Spain", matches: "Acid sulfates", does_not_match: "A flowing, living river", lat: 37.7, lon_east: -6.6, coordinates_approximate: true }]} /></>);
    expect(screen.getByTestId("site-role")).toHaveTextContent("Resource site");
    expect(screen.getByText(/A flowing, living river/)).toBeVisible();
  });

  it("filters by role without touching counts", () => {
    expect(passesRole("all", null)).toBe(true);
    expect(passesRole("Base candidate", "Context only")).toBe(false);
    expect(roleCounts(["Base candidate", "Base candidate", null, "Context only"])).toMatchObject({ "Base candidate": 2, "Context only": 1, "Resource site": 0 });
  });

  it("puts the paired conditions side by side and says when a pair is not the workbook's", () => {
    const loc = (id: string, body: "mars" | "earth", paired: string, conds: ReportedCondition[]): ComparisonLocation => ({
      id, body, name: id, region: "", description: "", lat: 0, lon_east: 0, coverage: "", measurements: [], sources: {}, source_ids: [],
      paired_location_id: paired, why_they_match: "Gypsum-rich desert", reported_conditions: conds, condition_sources: SRC, coordinates_approximate: false, role: "Base candidate",
    });
    const mars = loc("hebrus_valles", "mars", "liwa_desert", CONDS);
    const liwa = loc("liwa_desert", "earth", "hebrus_valles", [{ feature: "mineralogy", label: "Mineralogy", text: "Gypsum desert roses", status: "cited_not_verified", source_ids: [], provenance: "x" }]);
    render(<PairConditionsTable columns={[{ body: "mars", label: "Mars", role: "selected", location: mars, locations: [mars] }, { body: "earth", label: "Earth", role: "reference", location: liwa, locations: [liwa] }] as never} />);
    expect(screen.getByText("Gypsum-rich desert")).toBeVisible();
    const row = screen.getByTestId("pair-condition-mineralogy");
    expect(within(row).getByText("Carbonate- and sulfate-rich rocks")).toBeVisible();
    expect(within(row).getByText("Gypsum desert roses")).toBeVisible();
    expect(within(screen.getByTestId("pair-condition-elevation")).getByText("Not reported for this location")).toBeVisible();
    expect(pairNote(mars, { ...liwa, id: "rio_tinto", paired_location_id: "meridiani_planum" })).toMatch(/different Earth location/);
    expect(pairNote(mars, liwa)).toBeNull();
  });
});
