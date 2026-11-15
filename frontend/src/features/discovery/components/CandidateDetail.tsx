import { ResearchStatusBadge } from "./ResearchStatusBadge";
import { useCandidateResearchTarget } from "../store/useCandidateResearchTarget";
import { useDiscoveryStore } from "../store/useDiscoveryStore";
import { useAppStore } from "@/store/useAppStore";
// Evidence card for one proposed candidate: current scores from the rank
// response, immutable inputs from the detail endpoint. Every number is the
// server's; absent context is reported as absent.
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { BulletList } from "@/components/ui/Section";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { formatValueWithUnit } from "@/lib/format";
import { candidateTitle, coordinates, formatKm, noveltyRelation, reviewStatusLabel } from "../lib/copy";
import { KeyValues } from "./SurveyFunnel";
import type { DiscoveryCandidate, DiscoveryCandidateDetail, DiscoveryCriterion, DiscoveryReference } from "../adapter";
import type { EarthSite } from "@/hooks/useEarthSites";

export function CandidateDetail({ candidate, detail, detailPending, detailError, onRetry, criteria, reference, established, onCompareKnown }: {
  candidate: DiscoveryCandidate; detail: DiscoveryCandidateDetail | undefined; detailPending: boolean; detailError: unknown; onRetry: () => void; criteria: DiscoveryCriterion[]; reference: DiscoveryReference; established: EarthSite[];
  /** Open the established-analog view for the nearest known site, when it is in the curated catalogue. */
  onCompareKnown?: (siteId: string) => void;
}) {
  const runId = useDiscoveryStore(s => s.runId);
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
    <article aria-label={`Candidate evidence: ${candidate.name}`} className="rounded-xl border border-line-strong bg-bg-elev p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div className="min-w-0"><p className="text-xs font-medium text-copper-bright">3. Review evidence · Region {candidate.display_rank ?? "—"}</p><h2 className="mt-2 text-xl font-semibold tracking-tight text-fg sm:text-2xl">{candidateTitle(candidate)}</h2><p className="mt-1 text-xs text-fg-muted">{candidate.name.startsWith("Survey footprint ") ? "Earth survey footprint · regional terrain screening" : coordinates(candidate.lat, candidate.lon_east)}</p></div>
        <div className="flex flex-wrap items-center gap-5"><div><p className="num text-2xl font-semibold text-fg">{candidate.similarity_index?.toFixed(1) ?? "—"}<span className="ml-1 text-xs font-normal text-fg-muted">/ 100</span></p><p className="text-[11px] text-fg-muted">Terrain similarity</p></div><button type="button" disabled={!runId} className="inline-flex items-center gap-2 rounded-lg border border-copper bg-copper px-4 py-2.5 text-sm font-semibold text-white hover:bg-copper-bright hover:text-bg disabled:opacity-40" onClick={() => { if (runId) { useCandidateResearchTarget.getState().open(runId, candidate.id); useAppStore.getState().setActiveTab("research"); } }}>Research this candidate <ArrowUpRight className="h-4 w-4" aria-hidden /></button></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2"><ResearchStatusBadge status={candidate.research_status} /><p className="text-xs text-fg-muted">Proposed terrain analog candidate; field validation required.</p></div>

      <section className="mt-5" aria-labelledby="cd-terrain">
        <h3 id="cd-terrain" className="text-sm font-semibold text-fg">What the terrain comparison shows</h3>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">Compare these regional measurements with {reference.name}. The index combines their differences under your chosen emphasis.</p>
        <div className="scroll-thin mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Regional terrain comparison">
          <table className="w-full min-w-[430px] text-left text-sm"><thead className="border-b border-line text-xs text-fg-muted"><tr><th className="pb-3 pr-4 font-medium">Measured terrain</th><th className="pb-3 pr-4 font-medium">Earth region</th><th className="pb-3 pr-4 font-medium text-copper-bright">{reference.name}</th><th className="pb-3 font-medium">Emphasis</th></tr></thead><tbody className="divide-y divide-line">{dists.map(d => <tr key={d.feature_id}><th className="py-3 pr-4 font-normal text-fg">{criteria.find(c => c.feature_id === d.feature_id)?.label ?? d.feature_id}</th><td className="num py-3 pr-4 text-fg">{formatValueWithUnit(d.earth_value, d.unit)}</td><td className="num py-3 pr-4 text-copper-bright">{formatValueWithUnit(d.mars_value, d.unit)}</td><td className="num py-3 text-fg-muted">{(d.normalized_weight * 100).toFixed(0)}%</td></tr>)}</tbody></table>
        </div>
        {!dists.length && <p className="mt-2 text-xs text-fg-muted">No factor breakdown was returned for this candidate.</p>}
        <p className="mt-2 text-xs text-fg-faint">Footprint medians on 4 km cells. These measurements cannot resolve rocks, local slopes or rover trafficability.</p>
        <details className="mt-3 text-xs"><summary className="w-fit cursor-pointer text-fg-muted hover:text-fg">Score calculation and original ranking</summary><p className="mt-2 text-fg-muted">Raw rank {candidate.raw_rank ?? "—"} before geographic diversification · weighted distance {candidate.distance?.toFixed(3) ?? "—"}. Normalisation scales are fixed service assumptions, not validated operating limits.</p><ul className="mt-2 space-y-1 text-fg-muted">{dists.map(d => <li key={d.feature_id}>{criteria.find(c => c.feature_id === d.feature_id)?.label ?? d.feature_id}: scale {d.scale} {d.unit} · normalised distance {d.distance.toFixed(3)} · weighted contribution {d.contribution.toFixed(3)}</li>)}</ul></details>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]" aria-label="Coverage and catalog relationship">
        <div className="rounded-lg border border-line p-3 text-xs"><p className="eyebrow">Terrain coverage</p><p className="num mt-1 text-lg text-fg">{(candidate.terrain_valid_fraction * 100).toFixed(1)}%</p><p className="text-fg-muted">valid analysis cells{detail?.profile ? ` · gradient support ${(detail.profile.gradient_valid_fraction * 100).toFixed(1)}%` : ""}</p></div>
        <div className="rounded-lg border border-line p-3 text-xs"><p className="eyebrow">Known-analog catalog</p><p className="mt-1"><Badge tone={nov.tone}>{nov.label}</Badge></p><p className="mt-1.5 text-fg-muted">{nov.sentence}</p><p className="mt-1 text-fg-muted">{reviewStatusLabel(candidate.novelty.review_status)}.</p>{known && onCompareKnown && <button type="button" onClick={() => onCompareKnown(known.id)} className="mt-1.5 text-info underline underline-offset-2">Open {known.name} among the established analogs</button>}{!known && <p className="mt-1 text-[10.5px] text-fg-faint">Nearest catalog site {candidate.novelty.nearest_known_site_id} ({formatKm(candidate.novelty.nearest_known_site_distance_km)}) is in the versioned catalog but not in this app's curated seven.</p>}</div>
      </section>

      <details className="mt-5 rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm text-fg-muted">Climate and land-cover context (not scored)</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 text-xs">
          <div className="rounded-lg border border-line p-2.5"><p className="text-fg-faint">Climate</p>{ctx?.climate ? <ClimateContext climate={ctx.climate as Record<string, unknown>} /> : <p className="mt-1 text-fg-muted">Not available.</p>}</div>
          <div className="rounded-lg border border-line p-2.5"><p className="text-fg-faint">Land cover</p>{ctx?.land_cover ? <KeyValues dict={ctx.land_cover as Record<string, unknown>} /> : <p className="mt-1 text-fg-muted">Not available.</p>}</div>
        </div>
        <p className="mt-2 text-xs text-fg-muted">Geology: <span className="text-fg">not assessed</span>.</p>
      </details>

      <div className="mt-5 grid gap-5 md:grid-cols-2"><section aria-labelledby="cd-missing"><h3 id="cd-missing" className="eyebrow text-warn">Missing evidence</h3><div className="mt-2"><BulletList items={missing} tone="warn" /></div></section>

      <section aria-labelledby="cd-validation"><h3 id="cd-validation" className="eyebrow">Proposed field validation</h3>
        {detailPending && <p className="mt-2 text-xs text-fg-muted" role="status">Loading candidate inputs…</p>}
        {detailError ? <div className="mt-2"><ErrorNote error={detailError} context="discovery/candidate" /><button type="button" onClick={onRetry} className="mt-2 text-xs text-info underline">Retry</button></div> : null}
        {detail && <div className="mt-2"><BulletList items={detail.proposed_field_validation} empty="The service lists no validation steps for this candidate." /></div>}
      </section>

      </div>
      {detail && (
        <section className="mt-4 space-y-2 text-xs" aria-label="Immutable inputs">
          <details className="rounded-lg border border-line px-3 py-2"><summary className="cursor-pointer text-fg-muted">Measured profile ({Object.keys(detail.profile?.measurements ?? {}).length} measurements) and grid</summary>
            {detail.profile ? <><dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">{Object.entries(detail.profile.measurements).map(([k, m]) => <div key={k} className="contents"><dt className="text-fg-faint">{k.replace(/_/g, " ")}</dt><dd className="num text-fg">{formatValueWithUnit(m.value, m.unit)} <span className="text-fg-faint">({m.measurement_type})</span></dd></div>)}</dl><KeyValues dict={detail.profile.grid} /></> : <p className="mt-1 text-fg-muted">No profile stored for this candidate.</p>}
          </details>
          <details className="rounded-lg border border-line px-3 py-2"><summary className="cursor-pointer text-fg-muted">Screening reasons ({detail.screening_reasons.length})</summary><div className="mt-2"><BulletList items={detail.screening_reasons} empty="None recorded." /></div></details>
        </section>
      )}

      <details className="mt-5 rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm text-fg-muted">Data sources and provenance</summary>
        <ul className="mt-2 space-y-1.5 text-xs">{(detail?.source_manifest?.length ? detail.source_manifest : candidate.sources).map(s => <li key={s.source_id} className="text-fg-muted"><span className="text-fg">{s.title}</span> — {s.institution} · {s.license} · observed {s.observation_period} · retrieved {s.retrieved_at}{s.url && <a href={s.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-copper-bright" aria-label={`Open ${s.title}`}><ExternalLink className="h-3 w-3" aria-hidden /></a>}</li>)}</ul>
      </details>

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
