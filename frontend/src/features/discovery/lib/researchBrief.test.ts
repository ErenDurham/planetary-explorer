import { describe, expect, it } from "vitest";
import { buildResearchBrief, researchBriefFilename } from "./researchBrief";
import { candidates, detail, rankResponse, run } from "../test/fixtures";
import type { CandidateResearchDossier } from "@/services/discoveryEngine";

const res = rankResponse({ run_id: run.run_id, reference_id: "jezero_crater", top_k: 5 });
const dossier: CandidateResearchDossier = {
  run_id: run.run_id, candidate_id: candidates[0].id, candidate: detail(candidates[0].id),
  record: { status: "in_progress", notes: "Checked prior work.", findings: [], run_id: run.run_id, candidate_id: candidates[0].id, updated_at: "2026-11-14T10:00:00Z" },
  research_questions: ["Has this region already been studied?", "Is access permitted?"],
  search_tasks: [{ label: "Prior analog work", query: "prior analog work", url: "https://ntrs.nasa.gov/search" }],
  research_brief: "", background_evidence: [{ chunk_id: "c1", document_id: "d1", title: "Jezero context", institution: "NASA", url: "https://science.nasa.gov/", publication_date: null, geographic_relevance: [], excerpt: "", score: 0.1 }],
  retrieval_status: "background_available", limitations: ["Background passages are not candidate evidence."],
};

describe("research brief", () => {
  it("writes the saved notebook, the candidate, the ranking context, the catalog relation, sources, questions and limitations, with no status change", () => {
    const md = buildResearchBrief({ dossier, ranked: candidates[0], ranking: res, run, notebook: dossier.record, draft: false, generatedAt: new Date("2026-11-15T12:00:00Z") });
    expect(md).toMatch(/^# Research brief: Footprint c_31_25_m2_75/);
    expect(md).toContain("Research status: **Research in progress** (saved 2026-11-14)");
    expect(md).toContain("Downloading this brief does not change the status.");
    expect(md).toContain("Location: 31.2500°N, 2.7500°W");
    expect(md).toContain("Rank in this session's ranking: 1 of 3");
    expect(md).toContain("Similarity index: 77.1 / 100");
    expect(md).toContain("Weights used for this ranking: slope_regional_median_deg 50%, roughness_regional_m 50%");
    expect(md).toContain("Eastern Morocco pilot (pilot_2026_11_14), 31.00°N–32.00°N, 3.00°W–2.00°W, 16 footprints sampled");
    expect(md).toContain("| slope_regional_median_deg | 1.30° | 1.08° | 1.5 deg | 50% | 0.149 | 0.074 |");
    expect(md).toContain("- slope_regional_median_deg: 1.30° (derived)");
    expect(md).toContain("not a claim of novelty");
    expect(md).toContain("climate, land cover, geology and materials. Geology status: not_assessed.");
    expect(md).toContain("## Notes\n\nChecked prior work.");
    expect(md).toContain("_No source findings recorded._");
    expect(md).toContain("- [ ] Has this region already been studied?");
    expect(md).toContain("Prior analog work: https://ntrs.nasa.gov/search");
    expect(md).toContain("Copernicus GLO-90 DEM — ESA / Airbus; 2011-2015 (TanDEM-X)");
    expect(md).toContain("Background passages retrieved (background only");
    expect(md).toContain("- Background passages are not candidate evidence.");
    expect(md).not.toMatch(/DRAFT/);
    expect(researchBriefFilename(dossier, false)).toBe("research-brief-pilot_2026_11_14-c_31_25_m2_75.md");
  });

  it("labels an unsaved notebook as a draft, groups contradictions separately, and works without a ranking", () => {
    const notebook = { status: "literature_reviewed" as const, notes: "Drafted conclusion: unsuitable.", findings: [
      { title: "Field survey 2019", url: "https://x", finding: "Dunes cover the footprint.", scope: "contradictory" as const },
      { title: "Regional geology map", url: "https://y", finding: "Basalt flows in the wider region.", scope: "regional_background" as const },
    ] };
    const md = buildResearchBrief({ dossier, ranked: null, ranking: null, run: null, notebook, draft: true });
    expect(md).toContain("**DRAFT — contains unsaved notebook edits.** Research status in this brief: Literature reviewed (as drafted, not yet saved).");
    expect(md).toContain("### Contradictions: evidence against the proposed analogy\n\n- **Field survey 2019** — Dunes cover the footprint. (https://x)");
    expect(md).toContain("### Regional background only");
    expect(md).not.toContain("### Direct evidence");
    expect(md).not.toContain("Rank in this session's ranking");
    expect(md).toContain(`Survey run: ${run.run_id}`);
    expect(researchBriefFilename(dossier, true)).toBe("research-brief-pilot_2026_11_14-c_31_25_m2_75-DRAFT.md");
  });
});
