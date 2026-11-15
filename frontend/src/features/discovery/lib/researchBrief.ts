// The research brief a reader downloads to finish: one Markdown document built
// only from responses already on screen (the dossier, the rank candidate, the
// run and the notebook as saved or as drafted). It states its own status - a
// draft is labelled as one - and building it changes nothing: it never calls
// save and never advances the research status.
import type { CandidateResearchDossier, CandidateResearchUpdate } from "@/services/discoveryEngine";
import { RESEARCH_STATUS_MEANING } from "../components/ResearchStatusBadge";
import { missingFactors, noveltyRelation } from "./copy";
import { formatBounds, formatPoint } from "./geo";
import type { DiscoveryCandidate, DiscoveryRankResponse, DiscoveryRunSummary } from "../adapter";

export interface ResearchBriefInput {
  dossier: CandidateResearchDossier;
  /** The same candidate from the current rank response, for rank, index and factor values; absent when no ranking is loaded. */
  ranked: DiscoveryCandidate | null;
  ranking: Pick<DiscoveryRankResponse, "effective_weights" | "returned_count" | "engine_version" | "reference"> | null;
  run: DiscoveryRunSummary | null;
  /** The notebook as it will be written: the saved record, or the draft when there are unsaved edits. */
  notebook: Pick<CandidateResearchUpdate, "status" | "notes" | "findings">;
  /** True when the notebook above differs from what is saved. */
  draft: boolean;
  generatedAt?: Date;
}

const fmtValue = (v: number, unit: string) => unit === "deg" ? `${v.toFixed(2)}°` : `${Math.round(v)} ${unit}`;

export function researchBriefFilename(dossier: CandidateResearchDossier, draft: boolean): string {
  return `research-brief-${dossier.run_id}-${dossier.candidate_id}${draft ? "-DRAFT" : ""}.md`;
}

export function buildResearchBrief(input: ResearchBriefInput): string {
  const { dossier, ranked, ranking, run, notebook, draft } = input;
  const c = dossier.candidate;
  const when = (input.generatedAt ?? new Date()).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const status = RESEARCH_STATUS_MEANING[notebook.status];
  const nov = noveltyRelation(c.novelty);
  const refName = ranking?.reference?.name ?? "Jezero Crater";
  const lines: string[] = [];
  const h = (t: string) => { lines.push("", `## ${t}`, ""); };

  lines.push(`# Research brief: ${c.name}`);
  lines.push("");
  lines.push(draft
    ? `**DRAFT — contains unsaved notebook edits.** Research status in this brief: ${status.label} (as drafted, not yet saved). Generated ${when}.`
    : `Research status: **${status.label}** (saved${dossier.record.updated_at ? ` ${dossier.record.updated_at.slice(0, 10)}` : ""}). Generated ${when}.`);
  lines.push("");
  lines.push(`${status.meaning} Downloading this brief does not change the status.`);
  lines.push("");
  lines.push("Proposed terrain analog candidate; field validation required. The similarity index is a heuristic over the features the survey declares, not a probability, geological equivalence or mission suitability.");

  h("Candidate");
  lines.push(`- Location: ${formatPoint(c.lat, c.lon_east, 4)} (centre of the comparison footprint)`);
  lines.push(`- Survey footprint id: ${c.id}`);
  if (ranked) lines.push(`- Rank in this session's ranking: ${ranked.display_rank ?? "not in shortlist"}${ranking?.returned_count ? ` of ${ranking.returned_count}` : ""}${ranked.raw_rank != null && ranked.raw_rank !== ranked.display_rank ? ` (raw rank ${ranked.raw_rank} before spacing)` : ""}`);
  if (ranked?.similarity_index != null) lines.push(`- Similarity index: ${ranked.similarity_index.toFixed(1)} / 100${ranked.distance != null ? ` (D = ${ranked.distance.toFixed(3)}, index = 100 / (1 + D))` : ""}`);
  lines.push(`- Terrain data valid fraction: ${(c.terrain_valid_fraction * 100).toFixed(1)}%`);
  lines.push(`- Research status: ${status.label}`);

  h("Reference and run");
  lines.push(`- Reference: ${refName}${ranking?.reference ? ` (Mars, ${formatPoint(ranking.reference.lat, ranking.reference.lon_east, 4)})` : ""}`);
  lines.push(`- Survey run: ${run ? `${run.label} (${run.run_id}), ${formatBounds(run.bounds)}, ${run.total_sampled} footprints sampled, created ${run.created_at.slice(0, 10)}` : dossier.run_id}`);
  if (ranking?.engine_version) lines.push(`- Engine: ${ranking.engine_version}`);
  if (ranking?.effective_weights) lines.push(`- Weights used for this ranking: ${Object.entries(ranking.effective_weights).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(", ")}`);
  lines.push(`- Scope: a bounded installed pilot; Earth was not searched globally.`);

  h("Measurements (regional footprint medians)");
  const measurements = Object.entries(c.profile?.measurements ?? {});
  if (measurements.length) for (const [k, m] of measurements) lines.push(`- ${k}: ${fmtValue(m.value, m.unit)} (${m.measurement_type})`);
  else lines.push("- No measured profile is stored for this candidate.");
  if (ranked?.feature_distances?.length) {
    lines.push("");
    lines.push(`| Feature | Here | ${refName} | Scale | Weight | Distance | Contribution |`);
    lines.push("|---|---|---|---|---|---|---|");
    for (const d of ranked.feature_distances) lines.push(`| ${d.feature_id} | ${fmtValue(d.earth_value, d.unit)} | ${fmtValue(d.mars_value, d.unit)} | ${d.scale} ${d.unit} | ${(d.normalized_weight * 100).toFixed(0)}% | ${d.distance.toFixed(3)} | ${d.contribution.toFixed(3)} |`);
  }
  const grid = c.profile?.grid as Record<string, unknown> | undefined;
  if (grid && (grid.cell_m || grid.footprint_m)) lines.push("", `Grid: ${grid.cell_m ? `${Number(grid.cell_m) / 1000} km cells` : ""}${grid.footprint_m ? `${grid.cell_m ? " in a " : ""}${Number(grid.footprint_m) / 1000} km footprint` : ""}.`);

  h("Relation to the known-analog catalog");
  lines.push(nov.sentence);
  lines.push(`Rule: ${c.novelty.buffer_rule}. Catalog version ${c.novelty.catalog_version}. Outside a catalog buffer does not mean unknown to science.`);

  h("Not compared");
  lines.push(`${missingFactors(c).join(", ")}. Geology status: ${c.context?.geology_status ?? "not_assessed"}.`);

  h("Notes");
  lines.push(notebook.notes.trim() ? notebook.notes.trim() : "_No notes written._");

  const findings = notebook.findings ?? [];
  const direct = findings.filter(f => f.scope === "candidate_specific");
  const contra = findings.filter(f => f.scope === "contradictory");
  const background = findings.filter(f => f.scope === "regional_background");
  h("Source findings");
  if (!findings.length) lines.push("_No source findings recorded._");
  const list = (title: string, items: typeof findings) => { if (!items.length) return; lines.push(`### ${title}`, ""); for (const f of items) lines.push(`- **${f.title}** — ${f.finding} (${f.url})`); lines.push(""); };
  list("Direct evidence for this candidate", direct);
  list("Contradictions: evidence against the proposed analogy", contra);
  list("Regional background only", background);

  h("Open questions");
  for (const q of dossier.research_questions) lines.push(`- [ ] ${q}`);
  if (dossier.search_tasks.length) { lines.push("", "Prepared searches:"); for (const s of dossier.search_tasks) lines.push(`- ${s.label}: ${s.url}`); }

  h("Sources used by the survey");
  const seen = new Set<string>();
  for (const s of c.sources) { const key = `${s.title}|${s.institution}`; if (seen.has(key)) continue; seen.add(key); lines.push(`- ${s.title} — ${s.institution}; ${s.observation_period}; ${s.license}; retrieved ${s.retrieved_at.slice(0, 10)}${s.url ? `; ${s.url}` : ""}`); }
  if (dossier.background_evidence.length) { lines.push("", "Background passages retrieved (background only; candidate relevance not established):"); for (const e of dossier.background_evidence) lines.push(`- ${e.title} — ${e.institution}${e.url ? `; ${e.url}` : ""}`); }

  h("Limitations");
  for (const l of [...c.limitations, ...dossier.limitations]) lines.push(`- ${l}`);
  lines.push("");
  lines.push("_Built from the service's responses and the analyst's notebook. The reproducible audit record is the JSON export._");
  return lines.join("\n") + "\n";
}
