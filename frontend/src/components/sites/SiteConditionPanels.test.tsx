import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportedConditionsPanel, RoleBadge, SiteLabelsPanel } from "./SiteConditionPanels";
import { PairConditionsTable, pairNote } from "@/components/compare/PairConditionsTable";
import type { ComparisonLocation, EnvironmentalMeasurement, ReportedCondition, SiteSource } from "@/types";

const SRC: Record<string, SiteSource> = {
  sharma: { source_id: "sharma", kind: "doi", cite: "Sharma et al., 2025", title: "Karstic caves in Hebrus Valles", url: "https://doi.org/10.3847/2041-8213/ae0f1c", year: 2025 },
};
const CONDS: ReportedCondition[] = [
  { feature: "mineralogy", label: "Mineralogy", text: "TES data reveal enrichment in carbonates and sulfates near the skylights.", status: "quoted", source_ids: ["sharma"], provenance: "approved source" },
  { feature: "elevation", label: "Elevation", text: null, status: "not_found_in_sources", source_ids: [], provenance: "approved source" },
];

describe("site information from approved sources", () => {
  it("quotes each condition with its source, and says when sources do not state it", () => {
    render(<ReportedConditionsPanel conditions={CONDS} sources={SRC} />);
    const min = screen.getByTestId("condition-mineralogy");
    expect(within(min).getByText(/enrichment in carbonates and sulfates/)).toBeVisible();
    expect(within(min).getByRole("link", { name: "Sharma et al., 2025" })).toHaveAttribute("href", SRC.sharma.url);
    expect(within(screen.getByTestId("condition-elevation")).getByText("Could not be found in sources")).toBeVisible();
    expect(document.body.textContent).not.toMatch(/workbook/i);
  });

  it("shows terrain morphology and mineralogy labels with their source, or that none were found", () => {
    const m = (feature_id: string, value: string[] | null): EnvironmentalMeasurement => ({ feature_id, label: feature_id, category: "ground", value, unit: null, source_id: value ? "sharma" : null, measurement_type: "literature", quality_flag: value ? "qualitative" : "missing", is_missing: !value });
    render(<SiteLabelsPanel measurements={[m("terrain_morphology", null), m("mineralogy_tags", ["carbonates", "sulfates"])]} sources={{ sharma: { source_id: "sharma", title: "Karstic caves", institution: "ApJL", url: SRC.sharma.url } }} />);
    expect(within(screen.getByTestId("label-terrain_morphology")).getByText("Could not be found in sources")).toBeVisible();
    const min = screen.getByTestId("label-mineralogy_tags");
    expect(within(min).getByText("Carbonates")).toBeVisible();
    expect(within(min).getByRole("link")).toHaveAttribute("href", SRC.sharma.url);
  });

  it("renders the project's role badge", () => {
    render(<RoleBadge role="Resource site" />);
    expect(screen.getByTestId("site-role")).toHaveTextContent("Resource site");
  });

  it("puts the conditions side by side with the source's own analog statement", () => {
    const loc = (id: string, body: "mars" | "earth", paired: string, conds: ReportedCondition[], basis = false): ComparisonLocation => ({
      id, body, name: id, region: "", description: "", lat: 0, lon_east: 0, coverage: "", measurements: [], sources: {}, source_ids: [],
      paired_location_id: paired, reported_conditions: conds, condition_sources: SRC, role: "Base candidate",
      analog_basis: basis ? { quote: "Lake Salda, a terrestrial analog for the paleolake in Jezero Crater", source_id: "sharma" } : null,
    });
    const mars = loc("jezero_crater", "mars", "lake_salda", CONDS);
    const salda = loc("lake_salda", "earth", "jezero_crater", [], true);
    render(<PairConditionsTable columns={[{ body: "mars", label: "Mars", role: "selected", location: mars, locations: [mars] }, { body: "earth", label: "Earth", role: "reference", location: salda, locations: [salda] }] as never} />);
    expect(screen.getByTestId("analog-basis")).toHaveTextContent(/terrestrial analog for the paleolake in Jezero Crater/);
    const row = screen.getByTestId("pair-condition-mineralogy");
    expect(within(row).getByText(/enrichment in carbonates/)).toBeVisible();
    expect(within(row).getByText("Could not be found in sources")).toBeVisible();
    expect(pairNote(mars, { ...salda, id: "rio_tinto", paired_location_id: "meridiani_planum" })).toMatch(/different Earth location/);
  });
});
