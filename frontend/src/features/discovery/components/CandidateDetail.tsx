// Evidence for one proposed candidate: current scores from the rank
// response, immutable inputs from the detail endpoint. Every number is the
// server's; absent context is reported as absent. Rendered inside the
// evidence panel (flush) or, standalone, as a card.
import { ExternalLink, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { BulletList } from "@/components/ui/Section";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { formatValueWithUnit } from "@/lib/format";
import { useAppStore } from "@/store/useAppStore";
import { PROPOSED_LABEL, formatKm, missingFactors, noveltyRelation, reviewStatusLabel, similarityExplanation, similarityReasons } from "../lib/copy";
import { formatPoint } from "../lib/geo";
import { ResearchStatusBadge } from "./ResearchStatusBadge";
import { useCandidateResearchTarget } from "../store/useCandidateResearchTarget";
import { useDiscoveryStore } from "../store/useDiscoveryStore";
import { KeyValues } from "./SurveyFunnel";
import type { DiscoveryCandidate, DiscoveryCandidateDetail, DiscoveryCriterion, DiscoveryReference } from "../adapter";
import type { EarthSite } from "@/hooks/useEarthSites";

export function CandidateDetail({ candidate, detail, detailPending, detailError, onRetry, criteria, reference, established, onCompareKnown, onResearch, effectiveWeights, flush = false }: {
  candidate: DiscoveryCandidate; detail: DiscoveryCandidateDetail | undefined; detailPending: boolean; detailError: unknown; onRetry: () => void; criteria: DiscoveryCriterion[]; reference: DiscoveryReference; established: EarthSite[];
  /** Open the established-analog view for the nearest known site, when it is in the curated catalogue. */
  onCompareKnown?: (siteId: string) => void;
  /** Hand the candidate to Research Prospects; defaults to opening the research tab. */
  onResearch?: (candidateId: string) => void;
  /** The rank response's normalised weights, for the plain-language index sentence. */
  effectiveWeights?: Record<string, number>;
  /** Inside the evidence panel: no card border of its own. */
  flush?: boolean;
}) {
  const runId = useDiscoveryStore(s => s.runId);
  const research = () => { if (onResearch) onResearch(candidate.id); else if (runId) { useCandidateResearchTarget.getState().open(runId, candidate.id); useAppStore.getState().setActiveTab("research"); } };
  const why = similarityReasons(candidate.feature_distances, reference.name);
  const notCompared = missingFactors(candidate);
  const nov = noveltyRelation(candidate.novelty);
  const known = established.find(s => s.id === candidate.novelty.nearest_known_site_id);
  const dists = candidate.feature_distances ?? [];
  const ctx = candidate.context;
  const missing: string[] = [];
  if (!ctx || ctx.climate == null) missing.push("Climate context: not available for this footprint (optional source absent; not scored).");
  if (!ctx || ctx.land_cover == null) missing.push("Land-cover context: not available for this footprint (not scored; absence does not mean bare ground).");
  missing.push("Geology: not assessed. No mineralogy or landform evidence is recorded for this footprint; none is inferred.");
  if (candidate.research_status !== "literature_reviewed") missing.push("Candidate literature review: not completed. Small desktop checks do not establish a researched analog.");
  return (
    <article aria-label={`Candidate evidence: ${candidate.name}`} className={flush ? "p-4 text-sm" : "rounded-xl border border-line-strong bg-bg-elev p-4 text-sm"}>
      <p className="rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-xs font-semibold text-info"><FlaskConical className="mr-1 inline h-3.5 w-3.5" aria-hidden />{PROPOSED_LABEL}</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">Rank {candidate.display_rank ?? "—"}{candidate.raw_rank != null && candidate.raw_rank !== candidate.display_rank ? ` · raw rank ${candidate.raw_rank} before diversification` : ""}</p><h2 className="num mt-1 text-xl font-semibold tracking-tight text-fg">{formatPoint(candidate.lat, candidate.lon_east)}</h2><p className="text-xs text-fg-muted">{candidate.name} · 60 km footprint centre</p></div>
        <div className="text-right"><p className="num text-3xl text-copper-bright">{candidate.similarity_index != null ? candidate.similarity_index.toFixed(1) : "—"}<span className="ml-1 text-sm text-fg-muted">/ 100</span></p><p className="text-[10.5px] text-fg-faint">two-feature terrain index · D = {candidate.distance?.toFixed(3) ?? "—"}</p></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2"><ResearchStatusBadge status={candidate.research_status} /><button type="button" disabled={!runId} className="rounded-lg border border-info/60 bg-info/10 px-3 py-1.5 text-xs font-semibold text-info hover:bg-info/20 disabled:opacity-40" onClick={research}>Research this candidate</button></div>
      {effectiveWeights && <p className="mt-3 text-xs leading-relaxed text-fg-muted">{similarityExplanation(candidate, reference.name, effectiveWeights)}</p>}
      <dl className="mt-3 grid gap-2 text-xs">
        <div className="rounded-lg border border-line p-2.5"><dt className="text-[10.5px] uppercase tracking-wide text-ok">Why it resembles {reference.name}</dt><dd className="mt-1 text-fg">{why.similar ?? "No factor breakdown was returned."}</dd></div>
        <div className="rounded-lg border border-line p-2.5"><dt className="text-[10.5px] uppercase tracking-wide text-warn">Differences and what was not compared</dt><dd className="mt-1 text-fg">{why.differs ?? "Both compared factors are close."} Not compared: {notCompared.join(", ")}.</dd></div>
      </dl>

      <section className="mt-4" aria-labelledby="cd-terrain">
        <h3 id="cd-terrain" className="eyebrow">Regional terrain against {reference.name}</h3>
        <table className="mt-2 w-full text-left text-xs"><thead className="text-fg-muted"><tr><th className="py-1 pr-2 font-medium">Feature</th><th className="py-1 pr-2 font-medium">Earth</th><th className="py-1 pr-2 font-medium">{reference.name}</th><th className="py-1 pr-2 font-medium">Scale</th><th className="py-1 pr-2 font-medium">Weight</th><th className="py-1 pr-2 font-medium">Distance</th><th className="py-1 font-medium">Contribution</th></tr></thead>
          <tbody className="divide-y divide-line">{dists.map(d => { const c = criteria.find(x => x.feature_id === d.feature_id); const maxv = Math.max(Math.abs(d.earth_value), Math.abs(d.mars_value), 1e-9); return (
            <tr key={d.feature_id}><td className="py-1.5 pr-2 text-fg">{c?.label ?? d.feature_id}<span className="mt-1 block h-1.5 w-28 overflow-hidden rounded bg-line" aria-hidden><span className="block h-full bg-info" style={{ width: `${(Math.abs(d.earth_value) / maxv) * 100}%` }} /><span className="-mt-1.5 block h-full bg-copper opacity-70" style={{ width: `${(Math.abs(d.mars_value) / maxv) * 100}%` }} /></span></td><td className="num py-1.5 pr-2 text-fg">{formatValueWithUnit(d.earth_value, d.unit)}</td><td className="num py-1.5 pr-2 text-fg">{formatValueWithUnit(d.mars_value, d.unit)}</td><td className="num py-1.5 pr-2 text-fg-muted">{d.scale} {d.unit}</td><td className="num py-1.5 pr-2 text-fg-muted">{(d.normalized_weight * 100).toFixed(0)}%</td><td className="num py-1.5 pr-2 text-fg-muted">{d.distance.toFixed(3)}</td><td className="num py-1.5 text-fg-muted">{d.contribution.toFixed(3)}</td></tr>
          ); })}</tbody></table>
        {dists.length === 0 && <p className="mt-2 text-xs text-fg-muted">No factor breakdown was returned for this candidate.</p>}
        <p className="mt-2 text-[10.5px] text-fg-faint">Values are footprint medians on 4 km cells (regional). Blue bar Earth, copper bar Jezero. Scales are the service's fixed, unvalidated normalisation constants.</p>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Coverage and catalog relationship">
        <div className="rounded-lg border border-line p-3 text-xs"><p className="eyebrow">Terrain coverage</p><p className="num mt-1 text-lg text-fg">{(candidate.terrain_valid_fraction * 100).toFixed(1)}%</p><p className="text-fg-muted">valid analysis cells{detail?.profile ? ` · gradient support ${(detail.profile.gradient_valid_fraction * 100).toFixed(1)}%` : ""}</p></div>
        <div className="rounded-lg border border-line p-3 text-xs"><p className="eyebrow">Known-analog catalog</p><p className="mt-1"><Badge tone={nov.tone}>{nov.label}</Badge></p><p className="mt-1.5 text-fg-muted">{nov.sentence}</p><p className="mt-1 text-fg-muted">{reviewStatusLabel(candidate.novelty.review_status)}.</p>{known && onCompareKnown && <button type="button" onClick={() => onCompareKnown(known.id)} className="mt-1.5 text-info underline underline-offset-2">Open {known.name} among the established analogs</button>}{!known && <p className="mt-1 text-[10.5px] text-fg-faint">Nearest catalog site {candidate.novelty.nearest_known_site_id} ({formatKm(candidate.novelty.nearest_known_site_distance_km)}) is in the versioned catalog but not in this app's curated seven.</p>}</div>
      </section>

      <section className="mt-4" aria-labelledby="cd-context"><h3 id="cd-context" className="eyebrow">Context (not scored)</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 text-xs">
          <div className="rounded-lg border border-line p-2.5"><p className="text-fg-faint">Climate</p>{ctx?.climate ? <ClimateContext climate={ctx.climate as Record<string, unknown>} /> : <p className="mt-1 text-fg-muted">Not available.</p>}</div>
          <div className="rounded-lg border border-line p-2.5"><p className="text-fg-faint">Land cover</p>{ctx?.land_cover ? <KeyValues dict={ctx.land_cover as Record<string, unknown>} /> : <p className="mt-1 text-fg-muted">Not available.</p>}</div>
        </div>
        <p className="mt-2 text-xs text-fg-muted">Geology: <span className="text-fg">not assessed</span>.</p>
      </section>

      <section className="mt-4" aria-labelledby="cd-missing"><h3 id="cd-missing" className="eyebrow text-warn">Missing evidence</h3><div className="mt-2"><BulletList items={missing} tone="warn" /></div></section>

      <section className="mt-4" aria-labelledby="cd-validation"><h3 id="cd-validation" className="eyebrow">Proposed field validation</h3>
        {detailPending && <p className="mt-2 text-xs text-fg-muted" role="status">Loading candidate inputs…</p>}
        {detailError ? <div className="mt-2"><ErrorNote error={detailError} context="discovery/candidate" /><button type="button" onClick={onRetry} className="mt-2 text-xs text-info underline">Retry</button></div> : null}
        {detail && <div className="mt-2"><BulletList items={detail.proposed_field_validation} empty="The service lists no validation steps for this candidate." /></div>}
      </section>

      {detail && (
        <section className="mt-4 space-y-2 text-xs" aria-label="Immutable inputs">
          <details className="rounded-lg border border-line px-3 py-2"><summary className="cursor-pointer text-fg-muted">Measured profile ({Object.keys(detail.profile?.measurements ?? {}).length} measurements) and grid</summary>
            {detail.profile ? <><dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">{Object.entries(detail.profile.measurements).map(([k, m]) => <div key={k} className="contents"><dt className="text-fg-faint">{k.replace(/_/g, " ")}</dt><dd className="num text-fg">{formatValueWithUnit(m.value, m.unit)} <span className="text-fg-faint">({m.measurement_type})</span></dd></div>)}</dl><KeyValues dict={detail.profile.grid} /></> : <p className="mt-1 text-fg-muted">No profile stored for this candidate.</p>}
          </details>
          <details className="rounded-lg border border-line px-3 py-2"><summary className="cursor-pointer text-fg-muted">Screening reasons ({detail.screening_reasons.length})</summary><div className="mt-2"><BulletList items={detail.screening_reasons} empty="None recorded." /></div></details>
        </section>
      )}

      <section className="mt-4" aria-labelledby="cd-sources"><h3 id="cd-sources" className="eyebrow">Data sources</h3>
        <ul className="mt-2 space-y-1.5 text-xs">{(detail?.source_manifest?.length ? detail.source_manifest : candidate.sources).map(s => <li key={s.source_id} className="text-fg-muted"><span className="text-fg">{s.title}</span> — {s.institution} · {s.license} · observed {s.observation_period} · retrieved {s.retrieved_at}{s.url && <a href={s.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-copper-bright" aria-label={`Open ${s.title}`}><ExternalLink className="h-3 w-3" aria-hidden /></a>}</li>)}</ul>
      </section>

      <section className="mt-4" aria-labelledby="cd-limits"><h3 id="cd-limits" className="eyebrow">Limitations</h3><div className="mt-2"><BulletList items={candidate.limitations} tone="warn" empty="None stated." /></div></section>
    </article>
  );
}

/** NASA POWER context as the service shaped it: the values, then where they
 * came from and what they are not (a survey-centre figure, not a score input). */
function ClimateContext({ climate }: { climate: Record<string, unknown> }) {
  const values = (climate.values && typeof climate.values === "object" ? climate.values : null) as Record<string, unknown> | null;
  const rest = Object.fromEntries(Object.entries(climate).filter(([k]) => !["values", "header", "source"].includes(k)));
  const source = climate.source as Record<string, unknown> | undefined;
  return (
    <div>
      {values ? <KeyValues dict={values} /> : <p className="mt-1 text-fg-muted">No values reported.</p>}
      <KeyValues dict={rest} />
      {source && <p className="mt-1 text-[10.5px] text-fg-faint">{String(source.title ?? "source")} · {String(source.institution ?? "")}{source.url ? <> · <a href={String(source.url)} target="_blank" rel="noreferrer" className="text-copper-bright underline">source</a></> : null}</p>}
    </div>
  );
}
