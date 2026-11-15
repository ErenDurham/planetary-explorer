// Evidence for one proposed candidate, laid out so a reader can decide whether
// it is worth a field visit without ever reading it as a confirmed analog:
// identity and status; the match to the reference (the index, the weights
// used, and a factor table the index can be recomputed from); how it was
// measured; its relation to the known-analog catalog; what was NOT compared;
// sources and provenance; then limitations and next steps.
//
// Scores and factor values come from the RANK response (the detail endpoint
// returns the immutable row with those fields null); measurement inputs, grid
// provenance and the field-validation steps come from the DETAIL endpoint; the
// research dossier is fetched lazily for the last section. Every number is the
// server's, and absent context is reported as absent rather than guessed.
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { BulletList, EmptyNote, Section } from "@/components/ui/Section";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { formatValueWithUnit } from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";
import { discoveryEngine } from "@/services/discoveryEngine";
import { PROPOSED_LABEL, SEPARATE_SCORES_NOTE, formatKm, missingFactors, noveltyRelation, reviewStatusLabel, similarityExplanation, similarityReasons } from "../lib/copy";
import { formatPoint } from "../lib/geo";
import { KeyValues } from "./SurveyFunnel";
import { ResearchStatusBadge } from "./ResearchStatusBadge";
import { useCandidateResearchTarget } from "../store/useCandidateResearchTarget";
import { useDiscoveryStore } from "../store/useDiscoveryStore";
import type { DiscoveryCandidate, DiscoveryCandidateDetail, DiscoveryCriterion, DiscoveryReference, DiscoverySource, DiscoverySurvey } from "../adapter";
import type { EarthSite } from "@/hooks/useEarthSites";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function CandidateDetail({ candidate, detail, detailPending, detailError, onRetry, criteria, reference, established, onCompareKnown, onResearch, effectiveWeights, returnedCount, survey }: {
  candidate: DiscoveryCandidate; detail: DiscoveryCandidateDetail | undefined; detailPending: boolean; detailError: unknown; onRetry: () => void; criteria: DiscoveryCriterion[]; reference: DiscoveryReference; established: EarthSite[];
  /** Open the established-analog view for the nearest known site, when it is in the curated catalogue. */
  onCompareKnown?: (siteId: string) => void;
  /** Hand the candidate to Research Prospects; defaults to opening the research tab. */
  onResearch?: (candidateId: string) => void;
  /** The rank response's normalised weights, for the plain-language index sentence. */
  effectiveWeights?: Record<string, number>;
  /** How many candidates the ranking presented, for "rank 1 of 4". */
  returnedCount?: number;
  /** The survey, for the grid and footprint specification and dataset versions. */
  survey?: DiscoverySurvey | null;
}) {
  const runId = useDiscoveryStore(s => s.runId);
  const research = () => { if (onResearch) onResearch(candidate.id); else if (runId) { useCandidateResearchTarget.getState().open(runId, candidate.id); useAppStore.getState().setActiveTab("research"); } };
  const nov = noveltyRelation(candidate.novelty);
  const known = established.find(s => s.id === candidate.novelty.nearest_known_site_id);
  const dists = [...(candidate.feature_distances ?? [])].sort((a, b) => b.contribution - a.contribution);
  const totalD = candidate.distance ?? dists.reduce((a, d) => a + d.contribution, 0);
  const why = similarityReasons(candidate.feature_distances, reference.name);
  const notCompared = missingFactors(candidate);
  const ctx = candidate.context;
  const climate = (ctx?.climate ?? null) as Record<string, unknown> | null;
  const missing: string[] = [];
  if (!climate) missing.push("Climate context: not available for this footprint (optional source absent; not scored).");
  if (!ctx || ctx.land_cover == null) missing.push("Land-cover context: not available for this footprint (not scored; absence does not mean bare ground).");
  missing.push("Geology: not assessed. No mineralogy or landform evidence is recorded for this footprint; none is inferred.");
  if (candidate.research_status !== "literature_reviewed") missing.push("Candidate literature review: not completed. Small desktop checks do not establish a researched analog.");
  const profile = detail?.profile ?? null;
  const grid = (profile?.grid ?? {}) as Record<string, unknown>;
  const shape = Array.isArray(grid.shape) && grid.shape.length === 2 ? (grid.shape as unknown[]).map(num) : null;
  const cellM = num(grid.cell_m) ?? num(survey?.grid_specification?.cell_m);
  const footprintM = num(grid.footprint_m) ?? num(survey?.footprint_specification?.width_m);
  const sources = detail?.source_manifest?.length ? detail.source_manifest : candidate.sources;
  const grouped = groupSources(sources);
  const datasetVersions = (survey?.dataset_versions ?? null) as Record<string, string> | null;
  // the dossier is read, never written, here: status and the size of the research kit, with the work itself under Research Prospects
  const dossier = useQuery({
    queryKey: ["discovery", "research", runId, candidate.id, ""],
    queryFn: ({ signal }) => discoveryEngine.research(runId as string, candidate.id, "", signal),
    enabled: !!runId, staleTime: 5 * 60_000, retry: false,
  });

  return (
    <article aria-label={`Candidate evidence: ${candidate.name}`} className="text-sm">
      {/* A. identity and status */}
      <div className="border-b border-line px-4 py-3">
        <p className="rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-xs font-semibold text-info"><FlaskConical className="mr-1 inline h-3.5 w-3.5" aria-hidden />{PROPOSED_LABEL}</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Rank {candidate.display_rank ?? "—"}{returnedCount ? ` of ${returnedCount}` : ""}{candidate.raw_rank != null && candidate.raw_rank !== candidate.display_rank ? ` · raw rank ${candidate.raw_rank} before spacing` : ""}</p>
            <h2 className="num mt-1 text-xl font-semibold tracking-tight text-fg">{formatPoint(candidate.lat, candidate.lon_east)}</h2>
            <p className="text-xs text-fg-muted">{candidate.name}{footprintM ? ` · ${Math.round(footprintM / 1000)} km footprint centre` : ""}</p>
          </div>
          <div className="text-right"><p className="num text-3xl text-copper-bright">{candidate.similarity_index != null ? candidate.similarity_index.toFixed(1) : "—"}<span className="ml-1 text-sm text-fg-muted">/ 100</span></p><p className="text-[10.5px] text-fg-faint">two-feature terrain index · not a probability</p></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <ResearchStatusBadge status={candidate.research_status} />
          <Badge tone="neutral" title={reviewStatusLabel(candidate.novelty.review_status)}>{candidate.novelty.review_status === "desktop_reviewed" ? "Desktop reviewed" : "Not desktop reviewed"}</Badge>
          <span className="num text-[10.5px] text-fg-faint">terrain data {candidate.terrain_valid_fraction >= 0.9995 ? "complete" : `${(candidate.terrain_valid_fraction * 100).toFixed(1)}% complete`}</span>
          <button type="button" disabled={!runId} className="ml-auto rounded-lg border border-info/60 bg-info/10 px-3 py-1.5 text-xs font-semibold text-info hover:bg-info/20 disabled:opacity-40" onClick={research}>Research this candidate</button>
        </div>
      </div>

      {/* B. the match: score, weights, the factor table the score can be recomputed from */}
      <Section title={`Match to ${reference.name}`} subtitle="The whole of the score, so it can be checked by hand">
        {effectiveWeights && <p className="text-xs leading-relaxed text-fg-muted">{similarityExplanation(candidate, reference.name, effectiveWeights)}</p>}
        <dl className="mt-3 grid gap-2 text-xs">
          <div className="rounded-lg border border-line p-2.5"><dt className="text-[10.5px] uppercase tracking-wide text-ok">Why it resembles {reference.name}</dt><dd className="mt-1 text-fg">{why.similar ?? "No factor breakdown was returned."}</dd></div>
          <div className="rounded-lg border border-line p-2.5"><dt className="text-[10.5px] uppercase tracking-wide text-warn">Differences and what was not compared</dt><dd className="mt-1 text-fg">{why.differs ?? "Both compared factors are close."} Not compared: {notCompared.join(", ")}.</dd></div>
        </dl>
        {dists.length > 0 ? (
          <table className="mt-3 w-full text-left text-xs" aria-label={`Factor contributions for ${candidate.name}`}>
            <thead className="text-fg-muted"><tr><th className="py-1 pr-2 font-medium">Feature</th><th className="py-1 pr-2 font-medium">Here</th><th className="py-1 pr-2 font-medium">{reference.name}</th><th className="py-1 pr-2 font-medium">Weight</th><th className="py-1 font-medium">Share of D</th></tr></thead>
            <tbody className="divide-y divide-line">
              {dists.map(d => {
                const c = criteria.find(x => x.feature_id === d.feature_id);
                const share = totalD > 0 ? d.contribution / totalD : 0;
                return (
                  <tr key={d.feature_id}>
                    <td className="py-1.5 pr-2 align-top text-fg">{c?.label ?? d.feature_id}<span className="block text-[10.5px] text-fg-faint">scale {d.scale} {d.unit} · distance {d.distance.toFixed(3)}</span></td>
                    <td className="num py-1.5 pr-2 align-top text-fg">{formatValueWithUnit(d.earth_value, d.unit)}</td>
                    <td className="num py-1.5 pr-2 align-top text-fg">{formatValueWithUnit(d.mars_value, d.unit)}</td>
                    <td className="num py-1.5 pr-2 align-top text-fg-muted">{(d.normalized_weight * 100).toFixed(0)}%</td>
                    <td className="py-1.5 align-top"><span className="num text-fg">{(share * 100).toFixed(0)}%</span><span className="mt-1 block h-1.5 w-full overflow-hidden rounded bg-line" aria-hidden><span className="block h-full bg-copper" style={{ width: `${share * 100}%` }} /></span><span className="num block text-[10.5px] text-fg-faint">{d.contribution.toFixed(3)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="mt-3 text-xs text-fg-muted">No factor breakdown was returned for this candidate.</p>}
        <p className="num mt-2 text-[10.5px] text-fg-faint">D = {totalD.toFixed(3)} is the weighted sum of the contributions; index = 100 / (1 + D) = {(100 / (1 + totalD)).toFixed(1)}. Values are footprint medians on {cellM ? `${Math.round(cellM / 1000)} km` : "regional"} cells; scales are the service's fixed, unvalidated normalisation constants.</p>
        <p className="mt-1 text-[10.5px] text-fg-faint">{SEPARATE_SCORES_NOTE}</p>
        <button type="button" onClick={() => document.getElementById("weight-controls")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="mt-2 text-[10.5px] text-info underline underline-offset-2">Changing the weights in the left column re-ranks the same footprints</button>
      </Section>

      {/* C. how it was measured: the inputs, from the immutable detail row */}
      <Section title="How it was measured" subtitle="What the two numbers above are made of">
        {detailPending && <p className="text-xs text-fg-muted" role="status">Loading candidate inputs…</p>}
        {detailError ? <div><ErrorNote error={detailError} context="discovery/candidate" /><button type="button" onClick={onRetry} className="mt-2 text-xs text-info underline">Retry</button></div> : null}
        {detail && !profile && <EmptyNote>No measured profile is stored for this candidate.</EmptyNote>}
        {profile && (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {Object.entries(profile.measurements).map(([k, m]) => <div key={k} className="contents"><dt className="text-fg-faint">{criteria.find(c => c.feature_id === k)?.label ?? k.replace(/_/g, " ")}</dt><dd className="num text-fg">{formatValueWithUnit(m.value, m.unit)} <span className="text-fg-faint">({m.measurement_type})</span></dd></div>)}
              <dt className="text-fg-faint">Grid</dt><dd className="num text-fg">{shape && shape[0] != null && shape[1] != null ? `${shape[0]} × ${shape[1]} cells` : "cells"}{cellM ? ` of ${Math.round(cellM / 1000)} km` : ""}{footprintM ? ` inside a ${Math.round(footprintM / 1000)} km footprint` : ""}</dd>
              <dt className="text-fg-faint">Coverage</dt><dd className="num text-fg">terrain {(profile.terrain_valid_fraction * 100).toFixed(1)}% · gradient {(profile.gradient_valid_fraction * 100).toFixed(1)}%{num(grid.support_mean) != null ? ` · support mean ${(num(grid.support_mean)! * 100).toFixed(0)}%, min ${((num(grid.support_min) ?? 0) * 100).toFixed(0)}%` : ""}</dd>
              {str(grid.aggregation) && <><dt className="text-fg-faint">Aggregation</dt><dd className="text-fg">{str(grid.aggregation)}</dd></>}
              {str(grid.projection_limit) && <><dt className="text-fg-faint">Projection</dt><dd className="text-fg">{str(grid.projection_limit)}</dd></>}
              {survey?.grid_specification?.no_nodata_fill === true && <><dt className="text-fg-faint">Missing data</dt><dd className="text-fg">No missing-data cells were filled.</dd></>}
            </dl>
            <details className="mt-2 rounded-lg border border-line px-2.5 py-1.5 text-xs"><summary className="cursor-pointer text-fg-muted">Full grid record</summary><KeyValues dict={grid} /></details>
          </>
        )}
        {detail && detail.screening_reasons.length > 0 && <details className="mt-2 rounded-lg border border-line px-2.5 py-1.5 text-xs"><summary className="cursor-pointer text-fg-muted">Screening notes ({detail.screening_reasons.length})</summary><div className="mt-2"><BulletList items={detail.screening_reasons} /></div></details>}
      </Section>

      {/* D. relation to the known-analog catalog */}
      <Section title="Relation to known analogs">
        <p><Badge tone={nov.tone}>{nov.label}</Badge></p>
        <p className="mt-2 text-xs leading-relaxed text-fg">{nov.sentence}</p>
        <p className="mt-1.5 text-[10.5px] text-fg-muted">Rule: {candidate.novelty.buffer_rule}</p>
        <p className="mt-1 text-[10.5px] text-fg-muted">{reviewStatusLabel(candidate.novelty.review_status)}.</p>
        {known && onCompareKnown && <button type="button" onClick={() => onCompareKnown(known.id)} className="mt-1.5 text-xs text-info underline underline-offset-2">Open {known.name} among the established analogs</button>}
        {!known && <p className="mt-1 text-[10.5px] text-fg-faint">Nearest catalog site {candidate.novelty.nearest_known_site_id.replace(/_/g, " ")} ({formatKm(candidate.novelty.nearest_known_site_distance_km)}) is in the versioned catalog but not among this app's featured Earth regions.</p>}
      </Section>

      {/* E. what was not compared: context shown as context, never as a score input */}
      <Section title="What was not compared" subtitle="Context only; none of this enters the index">
        <div className="grid gap-2 text-xs">
          <div className="rounded-lg border border-line p-2.5"><p className="text-fg-faint">Climate</p>{climate ? <ClimateContext climate={climate} /> : <p className="mt-1 text-fg-muted">Not available.</p>}</div>
          <div className="rounded-lg border border-line p-2.5"><p className="text-fg-faint">Land cover</p>{ctx?.land_cover ? <KeyValues dict={ctx.land_cover as Record<string, unknown>} /> : <p className="mt-1 text-fg-muted">Not available.</p>}</div>
          <div className="rounded-lg border border-line p-2.5"><p className="text-fg-faint">Geology and materials</p><p className="mt-1 text-fg-muted">Geology: <span className="text-fg">not assessed</span>.</p></div>
        </div>
        <h3 className="eyebrow mt-3 text-warn">Missing evidence</h3>
        <div className="mt-1.5"><BulletList items={missing} tone="warn" /></div>
      </Section>

      {/* F. sources and provenance */}
      <Section title="Sources and provenance">
        <ul className="space-y-2 text-xs">
          {grouped.map(g => (
            <li key={g.key} className="text-fg-muted">
              <span className="text-fg">{g.title}</span>{g.count > 1 ? ` · ${g.count} tiles` : ""} — {g.institution}
              <span className="block text-[10.5px]">observed {g.observation_period} · retrieved {g.retrieved_at.slice(0, 10)} · {g.license}{g.sha256 ? <> · <span className="num" title={g.sha256}>sha256 {g.sha256.slice(0, 12)}…</span></> : null}{g.url && <a href={g.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-copper-bright" aria-label={`Open ${g.title}`}><ExternalLink className="h-3 w-3" aria-hidden /></a>}</span>
            </li>
          ))}
        </ul>
        {datasetVersions && Object.keys(datasetVersions).length > 0 && <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[10.5px]">{Object.entries(datasetVersions).map(([k, v]) => <div key={k} className="contents"><dt className="text-fg-faint">{k} dataset</dt><dd className="num break-all text-fg-muted">{v}</dd></div>)}</dl>}
        <p className="mt-2 text-[10.5px] text-fg-faint">The full audit record for this survey is under Export in the left column.</p>
      </Section>

      {/* G. limitations and next steps */}
      <Section title="Limitations and next steps">
        <BulletList items={candidate.limitations} tone="warn" empty="None stated." />
        <h3 className="eyebrow mt-3">Proposed field validation</h3>
        <div className="mt-1.5">
          {detail ? <BulletList items={detail.proposed_field_validation} empty="The service lists no validation steps for this candidate." /> : detailPending ? <p className="text-xs text-fg-muted">Loading…</p> : <EmptyNote>Validation steps come with the candidate inputs.</EmptyNote>}
        </div>
        <h3 className="eyebrow mt-3">Research</h3>
        <div className="mt-1.5 text-xs text-fg-muted" data-testid="candidate-research-summary">
          {dossier.data ? (
            <p>Status <span className="text-fg">{dossier.data.record.status.replace(/_/g, " ")}</span>{dossier.data.record.updated_at ? ` · notes updated ${dossier.data.record.updated_at.slice(0, 10)}` : " · no notes saved yet"} · {dossier.data.research_questions.length} questions and {dossier.data.search_tasks.length} searches prepared · background library {dossier.data.retrieval_status === "background_available" ? "available" : "unavailable"}.</p>
          ) : dossier.isPending && dossier.fetchStatus !== "idle" ? <p role="status">Loading research status…</p> : <p>Research status could not be loaded; open Research Prospects to see it.</p>}
          <button type="button" disabled={!runId} className="mt-2 rounded-lg border border-info/60 bg-info/10 px-3 py-1.5 font-semibold text-info hover:bg-info/20 disabled:opacity-40" onClick={research}>Open in Research Prospects</button>
        </div>
      </Section>
    </article>
  );
}

/** Sources collapsed by title and institution, so four DEM tiles read as one line with a count. */
function groupSources(sources: DiscoverySource[]): Array<DiscoverySource & { key: string; count: number }> {
  const out = new Map<string, DiscoverySource & { key: string; count: number }>();
  for (const s of sources) {
    const key = `${s.title}|${s.institution}`;
    const g = out.get(key);
    if (g) g.count += 1; else out.set(key, { ...s, key, count: 1 });
  }
  return [...out.values()];
}

/** NASA POWER context as the service shaped it: the values, then what they are
 * (a survey-centre figure on a coarse grid, not a score input) and where they
 * came from. */
function ClimateContext({ climate }: { climate: Record<string, unknown> }) {
  const values = (climate.values && typeof climate.values === "object" ? climate.values : null) as Record<string, unknown> | null;
  const source = climate.source as Record<string, unknown> | undefined;
  const header = climate.header as Record<string, unknown> | undefined;
  return (
    <div>
      {values ? <KeyValues dict={values} /> : <p className="mt-1 text-fg-muted">No values reported.</p>}
      <p className="mt-1.5 text-[10.5px] text-fg-faint">{str(climate.scope) ?? "Context, not a score input"}{str(climate.resolution) ? ` · ${str(climate.resolution)}` : ""}{num(climate.lat) != null && num(climate.lon_east) != null ? ` · at ${formatPoint(num(climate.lat)!, num(climate.lon_east)!, 2)}` : ""}{header && str(header.range) ? ` · ${str(header.range)}` : ""}</p>
      {source && <p className="mt-1 text-[10.5px] text-fg-faint">{String(source.title ?? "source")} · {String(source.institution ?? "")}{source.url ? <> · <a href={String(source.url)} target="_blank" rel="noreferrer" className="text-copper-bright underline">source</a></> : null}</p>}
    </div>
  );
}
