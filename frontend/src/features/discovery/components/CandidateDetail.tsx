import { RegionActions } from "@/features/regions/RegionActions";
// Evidence for one proposed candidate, organised around the three questions a
// reader actually has - what matches the reference, what differs, and what we
// still need to investigate - with the way in to research placed where it is
// seen. Everything quantitative that justifies those answers (the factor
// table and formula, normalisation scales and weights, raw ranks and spacing,
// coverage, screening and survey exclusions, dataset versions and provenance)
// sits in "Methods and data" disclosure panels underneath.
//
// Scores and factor values come from the RANK response (the detail endpoint
// returns the immutable row with those fields null); measurement inputs, grid
// provenance and the field-validation steps come from the DETAIL endpoint; the
// research dossier is fetched lazily for the research line. Every number is
// the server's, and absent context is reported as absent rather than guessed.
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Microscope } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { BulletList, EmptyNote, Section } from "@/components/ui/Section";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { formatValueWithUnit } from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";
import { discoveryEngine } from "@/services/discoveryEngine";
import { SEPARATE_SCORES_NOTE, basisNote, dimensionVerdict, formatKm, incomparableNote, missingFactors, noveltyRelation, reviewStatusLabel, similarityExplanation, similarityReasons } from "../lib/copy";
import { formatPoint } from "../lib/geo";
import { KeyValues } from "./SurveyFunnel";
import { ResearchStatusBadge, RESEARCH_STATUS_MEANING } from "./ResearchStatusBadge";
import { useCandidateResearchTarget } from "../store/useCandidateResearchTarget";
import { useDiscoveryStore } from "../store/useDiscoveryStore";
import type { DiscoveryCandidate, DiscoveryCandidateDetail, DiscoveryCriterion, DiscoveryFeatureDistance, DiscoveryReference, DiscoverySource, DiscoverySurvey } from "../adapter";
import type { EarthSite } from "@/hooks/useEarthSites";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const FEATURE_WORD: Record<string, string> = {
  slope_regional_median_deg: "regional median slope", roughness_regional_m: "detrended regional relief",
  slope_regional_p90_deg: "steep-tail slope (p90)", elevation_range_m: "elevation range (p90 minus p10)",
  latitude_abs_deg: "distance from the equator", precipitation_mm_day: "mean precipitation",
};

export function CandidateDetail({ candidate, detail, detailPending, detailError, onRetry, criteria, reference, established, onCompareKnown, onResearch, effectiveWeights, returnedCount, survey }: {
  candidate: DiscoveryCandidate; detail: DiscoveryCandidateDetail | undefined; detailPending: boolean; detailError: unknown; onRetry: () => void; criteria: DiscoveryCriterion[]; reference: DiscoveryReference; established: EarthSite[];
  /** Open the established-analog view for the nearest known site, when it is in the curated catalogue. */
  onCompareKnown?: (siteId: string) => void;
  /** Hand the candidate to Research; defaults to opening the research tab. */
  onResearch?: (candidateId: string) => void;
  /** The rank response's normalised weights, for the plain-language index sentence. */
  effectiveWeights?: Record<string, number>;
  /** How many candidates the ranking presented, for "rank 1 of 4". */
  returnedCount?: number;
  /** The survey, for the grid and footprint specification, exclusions and dataset versions. */
  survey?: DiscoverySurvey | null;
}) {
  const runId = useDiscoveryStore(s => s.runId);
  const research = () => { if (onResearch) onResearch(candidate.id); else if (runId) { useCandidateResearchTarget.getState().open(runId, candidate.id); useAppStore.getState().setActiveTab("research"); } };
  const nov = noveltyRelation(candidate.novelty);
  const known = established.find(s => s.id === candidate.novelty.nearest_known_site_id);
  const dists = [...(candidate.feature_distances ?? [])].sort((a, b) => b.contribution - a.contribution);
  // shares are of the returned contributions; D is printed as the server sent it (the two agree on a consistent response)
  const contribSum = dists.reduce((a, d) => a + d.contribution, 0);
  const totalD = candidate.distance ?? contribSum;
  const why = similarityReasons(candidate.feature_distances, reference.name);
  const closest = dists.length ? dists[dists.length - 1] : null;
  const furthest = dists.length > 1 ? dists[0] : null;
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
  const footprintKm = footprintM ? Math.round(footprintM / 1000) : null;
  const cellKm = cellM ? Math.round(cellM / 1000) : null;
  const sources = detail?.source_manifest?.length ? detail.source_manifest : candidate.sources;
  const grouped = groupSources(sources);
  const datasetVersions = (survey?.dataset_versions ?? null) as Record<string, string> | null;
  const exclusions = Object.entries(survey?.exclusion_counts ?? {});
  // the dossier is read, never written, here: status and the size of the research kit, with the work itself under Research
  const dossier = useQuery({
    queryKey: ["discovery", "research", runId, candidate.id, ""],
    queryFn: ({ signal }) => discoveryEngine.research(runId as string, candidate.id, "", signal),
    enabled: !!runId, staleTime: 5 * 60_000, retry: false,
  });
  const fmt = (d: DiscoveryFeatureDistance, v: number) => formatValueWithUnit(v, d.unit);
  // The service's own per-dimension breakdown, and the dimensions it refused to score.
  const dimensions = candidate.dimension_scores ?? [];
  const verdict = dimensionVerdict(dimensions);
  const context = candidate.context?.measurements ?? [];
  const incomparable = incomparableNote(context, reference.name);

  return (
    <article aria-label={`Candidate evidence: ${candidate.name}`} className="text-sm">
      {/* identity, status and the way in to research */}
      <div className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Rank {candidate.display_rank ?? "—"}{returnedCount ? ` of ${returnedCount}` : ""}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-fg">{candidate.name}</h2>
            <p className="num text-xs text-fg-muted">{formatPoint(candidate.lat, candidate.lon_east)}{footprintKm ? ` · centre of a ${footprintKm} × ${footprintKm} km footprint` : ""}</p>
          </div>
          <div className="text-right" title={basisNote(criteria)}><p className="num text-3xl text-copper-bright">{candidate.similarity_index != null ? candidate.similarity_index.toFixed(1) : "—"}<span className="ml-1 text-sm text-fg-muted">/ 100</span></p><p className="text-[10.5px] text-fg-faint">similarity index · not a probability</p></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge tone={nov.tone}>{nov.label}</Badge>
          <ResearchStatusBadge status={candidate.research_status} />
          <Badge tone="neutral" title={reviewStatusLabel(candidate.novelty.review_status)}>{candidate.novelty.review_status === "desktop_reviewed" ? "Desktop reviewed" : "Not desktop reviewed"}</Badge>
        </div>
        {effectiveWeights && <p className="mt-3 text-xs leading-relaxed text-fg-muted">{similarityExplanation(candidate, reference.name, effectiveWeights, criteria)}</p>}
        <RegionActions target={runId ? {kind:"discovered",id:candidate.id,runId} : null}/>
        <button type="button" disabled={!runId} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-info bg-info/15 px-3 py-2.5 text-sm font-semibold text-info hover:bg-info/25 disabled:opacity-40" onClick={research} data-testid="research-this-candidate"><Microscope className="h-4 w-4" aria-hidden />Research this candidate</button>
      </div>

      {dimensions.length > 0 && (
        <Section title="How close, dimension by dimension" subtitle="Each dimension scored on its own, from the same weighting">
          <ul className="space-y-2" aria-label="Similarity by dimension">
            {dimensions.map(d => (
              <li key={d.group}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-fg">{d.label}</span>
                  <span className="num text-fg-muted"><span className="text-copper-bright">{d.similarity_index.toFixed(0)}</span> / 100 · {Math.round(d.weight_share * 100)}% of the weighting</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-sm bg-line" role="img" aria-label={`${d.label}: ${d.similarity_index.toFixed(0)} of 100`}>
                  <div className="h-full bg-copper" style={{ width: `${Math.max(0, Math.min(100, d.similarity_index))}%` }} />
                </div>
                <p className="mt-0.5 text-[10.5px] text-fg-faint">{d.feature_ids.map(id => FEATURE_WORD[id] ?? id.replace(/_/g, " ")).join(", ")}</p>
              </li>
            ))}
          </ul>
          {verdict && <p className="mt-3 text-xs leading-relaxed text-fg">{verdict}</p>}
        </Section>
      )}

      <Section title="What matches" subtitle={footprintKm && cellKm ? `Regional medians over the ${footprintKm} × ${footprintKm} km footprint, on ${cellKm} km cells; not rover-scale terrain` : "Regional footprint medians; not rover-scale terrain"}>
        {closest ? (
          <>
            <p className="text-xs leading-relaxed text-fg">{why.similar}</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-fg-faint">{FEATURE_WORD[closest.feature_id] ?? closest.feature_id}</dt><dd className="num text-fg">{fmt(closest, closest.earth_value)} here · {fmt(closest, closest.mars_value)} at {reference.name}</dd>
            </dl>
          </>
        ) : <EmptyNote>No factor breakdown was returned for this candidate.</EmptyNote>}
      </Section>

      <Section title="What differs" subtitle="Measured differences, and what was never compared">
        {furthest ? (
          <>
            <p className="text-xs leading-relaxed text-fg">{why.differs}</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-fg-faint">{FEATURE_WORD[furthest.feature_id] ?? furthest.feature_id}</dt><dd className="num text-fg">{fmt(furthest, furthest.earth_value)} here · {fmt(furthest, furthest.mars_value)} at {reference.name}</dd>
            </dl>
          </>
        ) : dists.length === 1 ? <p className="text-xs text-fg">Only one factor was compared, so there is no second difference to report.</p> : <p className="text-xs text-fg-muted">No factor breakdown was returned.</p>}
        <p className="mt-2 text-xs text-fg"><span className="text-warn">Not compared:</span> {notCompared.join(", ")}. {reference.name} is on Mars: atmosphere, gravity, radiation, weather and biology differ, and no transfer has been validated.</p>
        {context.length > 0 && (
          <>
            <h3 className="eyebrow mt-3">Measured, but deliberately not scored</h3>
            {incomparable && <p className="mt-1 text-xs leading-relaxed text-fg-muted">{incomparable}</p>}
            <dl className="mt-2 space-y-1.5">
              {context.map(m => (
                <div key={m.feature_id} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 text-xs">
                  <dt className="text-fg-faint" title={m.note}>{m.label}</dt>
                  <dd className="num text-fg">{formatValueWithUnit(m.earth_value, m.unit)} here · {m.mars_value != null ? `${formatValueWithUnit(m.mars_value, m.unit)} at ${reference.name}` : `not measured at ${reference.name}`}</dd>
                  <p className="col-span-2 text-[10.5px] leading-snug text-fg-faint">{m.note}</p>
                </div>
              ))}
            </dl>
          </>
        )}
      </Section>

      <Section title="What we still need to investigate" subtitle="Evidence gaps and the next steps, from the service's own record">
        <BulletList items={missing} tone="warn" />
        <h3 className="eyebrow mt-3">Known analogs nearby</h3>
        <p className="mt-1 text-xs leading-relaxed text-fg">{nov.sentence}</p>
        {known && onCompareKnown && <button type="button" onClick={() => onCompareKnown(known.id)} className="mt-1 text-xs text-info underline underline-offset-2">Compare with {known.name} among the established analogs</button>}
        {!known && <p className="mt-1 text-[10.5px] text-fg-faint">Nearest catalog site {candidate.novelty.nearest_known_site_id.replace(/_/g, " ")} ({formatKm(candidate.novelty.nearest_known_site_distance_km)}) is in the versioned catalog but not among this app's featured Earth regions.</p>}
        <h3 className="eyebrow mt-3">Proposed field validation</h3>
        <div className="mt-1.5">
          {detail ? <BulletList items={detail.proposed_field_validation} empty="The service lists no validation steps for this candidate." /> : detailPending ? <p className="text-xs text-fg-muted" role="status">Loading…</p> : detailError ? <div><ErrorNote error={detailError} context="discovery/candidate" /><button type="button" onClick={onRetry} className="mt-2 text-xs text-info underline">Retry</button></div> : <EmptyNote>Validation steps come with the candidate inputs.</EmptyNote>}
        </div>
        <h3 className="eyebrow mt-3">Research status</h3>
        <div className="mt-1.5 text-xs text-fg-muted" data-testid="candidate-research-summary">
          {dossier.data ? (
            <p><span className="text-fg">{RESEARCH_STATUS_MEANING[dossier.data.record.status].label}</span>: {RESEARCH_STATUS_MEANING[dossier.data.record.status].meaning}{dossier.data.record.updated_at ? ` Notes saved ${dossier.data.record.updated_at.slice(0, 10)}.` : " No notes saved yet."} {dossier.data.research_questions.length} questions and {dossier.data.search_tasks.length} searches are prepared; background library {dossier.data.retrieval_status === "background_available" ? "available" : "unavailable"}.</p>
          ) : dossier.isPending && dossier.fetchStatus !== "idle" ? <p role="status">Loading research status…</p> : <p>Research status could not be loaded; open Research to see it.</p>}
        </div>
      </Section>

      {/* everything quantitative behind the answers above */}
      <Section title="Methods and data" subtitle="How the index was built, from what, and with which sources">
        <details className="rounded-lg border border-line px-3 py-2 text-xs" data-testid="methods-score">
          <summary className="cursor-pointer font-medium text-fg">Score: factor table, weights, formula and ranks</summary>
          {dists.length > 0 ? (
            <table className="mt-2 w-full text-left" aria-label={`Factor contributions for ${candidate.name}`}>
              <thead className="text-fg-muted"><tr><th className="py-1 pr-2 font-medium">Feature</th><th className="py-1 pr-2 font-medium">Here</th><th className="py-1 pr-2 font-medium">{reference.name}</th><th className="py-1 pr-2 font-medium">Weight</th><th className="py-1 font-medium">Share</th></tr></thead>
              <tbody className="divide-y divide-line">
                {dists.map(d => {
                  const c = criteria.find(x => x.feature_id === d.feature_id);
                  const share = contribSum > 0 ? d.contribution / contribSum : 0;
                  return (
                    <tr key={d.feature_id}>
                      <td className="py-1.5 pr-2 align-top text-fg">{c?.label ?? d.feature_id}<span className="block text-[10.5px] text-fg-faint">scale {d.scale} {d.unit} · distance {d.distance.toFixed(3)}</span></td>
                      <td className="num py-1.5 pr-2 align-top text-fg">{fmt(d, d.earth_value)}</td>
                      <td className="num py-1.5 pr-2 align-top text-fg">{fmt(d, d.mars_value)}</td>
                      <td className="num py-1.5 pr-2 align-top text-fg-muted">{(d.normalized_weight * 100).toFixed(0)}%</td>
                      <td className="py-1.5 align-top"><span className="num text-fg">{(share * 100).toFixed(0)}%</span><span className="mt-1 block h-1.5 w-full overflow-hidden rounded bg-line" aria-hidden><span className="block h-full bg-copper" style={{ width: `${share * 100}%` }} /></span><span className="num block text-[10.5px] text-fg-faint">{d.contribution.toFixed(3)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <p className="mt-2 text-fg-muted">No factor breakdown was returned for this candidate.</p>}
          <p className="num mt-2 text-[10.5px] text-fg-faint">For each feature the service takes |here − {reference.name}| ÷ scale, weights it, and sums: D = {totalD.toFixed(3)}; index = 100 / (1 + D) = {(100 / (1 + totalD)).toFixed(1)}. Scales are the service's fixed, unvalidated normalisation constants.</p>
          <p className="mt-1 text-[10.5px] text-fg-faint">Rank {candidate.display_rank ?? "—"} shown{candidate.raw_rank != null ? ` · raw rank ${candidate.raw_rank} before the spacing rule${survey?.diversification && (num(survey.diversification.minimum_center_distance_km) ?? num(survey.diversification.min_separation_km)) != null ? ` (centres at least ${num(survey.diversification.minimum_center_distance_km) ?? num(survey.diversification.min_separation_km)} km apart)` : ""}` : ""}.</p>
          <p className="mt-1 text-[10.5px] text-fg-faint">{SEPARATE_SCORES_NOTE}</p>
          <button type="button" onClick={() => document.getElementById("weight-controls")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="mt-2 text-[10.5px] text-info underline underline-offset-2">Changing the weights in the left column re-ranks the same footprints</button>
        </details>

        <details className="mt-2 rounded-lg border border-line px-3 py-2 text-xs" data-testid="methods-measured">
          <summary className="cursor-pointer font-medium text-fg">Measurements, grid and coverage</summary>
          {detailPending && <p className="mt-2 text-fg-muted" role="status">Loading candidate inputs…</p>}
          {detailError ? <div className="mt-2"><ErrorNote error={detailError} context="discovery/candidate" /><button type="button" onClick={onRetry} className="mt-2 text-xs text-info underline">Retry</button></div> : null}
          {detail && !profile && <div className="mt-2"><EmptyNote>No measured profile is stored for this candidate.</EmptyNote></div>}
          {profile && (
            <>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {Object.entries(profile.measurements).map(([k, m]) => <div key={k} className="contents"><dt className="text-fg-faint">{criteria.find(c => c.feature_id === k)?.label ?? k.replace(/_/g, " ")}</dt><dd className="num text-fg">{formatValueWithUnit(m.value, m.unit)} <span className="text-fg-faint">({m.measurement_type})</span></dd></div>)}
                <dt className="text-fg-faint">Grid</dt><dd className="num text-fg">{shape && shape[0] != null && shape[1] != null ? `${shape[0]} × ${shape[1]} cells` : "cells"}{cellKm ? ` of ${cellKm} km` : ""}{footprintKm ? ` inside a ${footprintKm} km footprint` : ""}</dd>
                <dt className="text-fg-faint">Coverage</dt><dd className="num text-fg">terrain {(profile.terrain_valid_fraction * 100).toFixed(1)}% · gradient {(profile.gradient_valid_fraction * 100).toFixed(1)}%{num(grid.support_mean) != null ? ` · support mean ${(num(grid.support_mean)! * 100).toFixed(0)}%, min ${((num(grid.support_min) ?? 0) * 100).toFixed(0)}%` : ""}</dd>
                {str(grid.aggregation) && <><dt className="text-fg-faint">Aggregation</dt><dd className="text-fg">{str(grid.aggregation)}</dd></>}
                {str(grid.projection_limit) && <><dt className="text-fg-faint">Projection</dt><dd className="text-fg">{str(grid.projection_limit)}</dd></>}
                {survey?.grid_specification?.no_nodata_fill === true && <><dt className="text-fg-faint">Missing data</dt><dd className="text-fg">No missing-data cells were filled.</dd></>}
              </dl>
              <details className="mt-2 rounded-lg border border-line px-2.5 py-1.5"><summary className="cursor-pointer text-fg-muted">Full grid record</summary><KeyValues dict={grid} /></details>
            </>
          )}
          {detail && detail.screening_reasons.length > 0 && <details className="mt-2 rounded-lg border border-line px-2.5 py-1.5"><summary className="cursor-pointer text-fg-muted">Screening notes ({detail.screening_reasons.length})</summary><div className="mt-2"><BulletList items={detail.screening_reasons} /></div></details>}
          {survey && (
            <p className="mt-2 text-[10.5px] text-fg-faint">Survey: {survey.generated_count} footprints generated, {survey.terrain_valid_count} with valid terrain, {survey.eligible_count} eligible{exclusions.length ? `; excluded ${exclusions.map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ")}` : "; no exclusions recorded"}.</p>
          )}
        </details>

        <details className="mt-2 rounded-lg border border-line px-3 py-2 text-xs" data-testid="methods-context">
          <summary className="cursor-pointer font-medium text-fg">Context not in the score: climate, land cover, geology</summary>
          <div className="mt-2 grid gap-2">
            <div className="rounded-lg border border-line p-2.5"><p className="text-fg-faint">Climate</p>{climate ? <ClimateContext climate={climate} /> : <p className="mt-1 text-fg-muted">Not available.</p>}</div>
            <div className="rounded-lg border border-line p-2.5"><p className="text-fg-faint">Land cover</p>{ctx?.land_cover ? <KeyValues dict={ctx.land_cover as Record<string, unknown>} /> : <p className="mt-1 text-fg-muted">Not available.</p>}</div>
            <div className="rounded-lg border border-line p-2.5"><p className="text-fg-faint">Geology and materials</p><p className="mt-1 text-fg-muted">Geology: <span className="text-fg">not assessed</span>.</p></div>
          </div>
          <p className="mt-1.5 text-[10.5px] text-fg-faint">Rule for the catalog relation: {candidate.novelty.buffer_rule}. {reviewStatusLabel(candidate.novelty.review_status)}.</p>
        </details>

        <details className="mt-2 rounded-lg border border-line px-3 py-2 text-xs" data-testid="methods-sources">
          <summary className="cursor-pointer font-medium text-fg">Sources, versions and provenance</summary>
          <ul className="mt-2 space-y-2">
            {grouped.map(g => (
              <li key={g.key} className="text-fg-muted">
                <span className="text-fg">{g.title}</span>{g.count > 1 ? ` · ${g.count} tiles` : ""} — {g.institution}
                <span className="block text-[10.5px]">observed {g.observation_period} · retrieved {g.retrieved_at.slice(0, 10)} · {g.license}{g.sha256 ? <> · <span className="num" title={g.sha256}>sha256 {g.sha256.slice(0, 12)}…</span></> : null}{g.url && <a href={g.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-copper-bright" aria-label={`Open ${g.title}`}><ExternalLink className="h-3 w-3" aria-hidden /></a>}</span>
              </li>
            ))}
          </ul>
          {datasetVersions && Object.keys(datasetVersions).length > 0 && <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[10.5px]">{Object.entries(datasetVersions).map(([k, v]) => <div key={k} className="contents"><dt className="text-fg-faint">{k} dataset</dt><dd className="num break-all text-fg-muted">{v}</dd></div>)}</dl>}
          <p className="mt-2 text-[10.5px] text-fg-faint">The full audit record for this survey is under Export in the left column.</p>
        </details>

        <details className="mt-2 rounded-lg border border-line px-3 py-2 text-xs" data-testid="methods-limits">
          <summary className="cursor-pointer font-medium text-fg">Limitations stated by the service ({candidate.limitations.length})</summary>
          <div className="mt-2"><BulletList items={candidate.limitations} tone="warn" empty="None stated." /></div>
        </details>
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
