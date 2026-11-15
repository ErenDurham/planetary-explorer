// What the evidence panel shows before a candidate is chosen: the survey
// itself. The reference, the area searched, what was compared and the status
// of the results, then the formula, the screening funnel, the dataset sources
// and the known limitations. This is the Browse Regions "no site selected"
// move applied to discovery, so the panel is never blank.
import type { ReactNode } from "react";
import { Section, EmptyNote, BulletList } from "@/components/ui/Section";
import { OFFLINE_NOTE, SEPARATE_SCORES_NOTE } from "../lib/copy";
import { extentKm, formatBounds } from "../lib/geo";
import { ReferenceCard, type ReferenceImage } from "./ReferenceCard";
import { SurveyFunnel } from "./SurveyFunnel";
import type { DiscoveryCriterion, DiscoveryRankResponse, DiscoveryReference, DiscoveryRunSummary, DiscoverySource } from "../adapter";

export function DiscoverySurveyPanel({ reference, activeRun, criteria, limitations, ranking, sources, refImage, refImageStatus, children }: {
  reference: DiscoveryReference | undefined;
  activeRun: DiscoveryRunSummary | null;
  criteria: DiscoveryCriterion[];
  /** rank.limitations when ranked, else capabilities.limitations */
  limitations: string[];
  ranking: DiscoveryRankResponse | undefined;
  sources: DiscoverySource[];
  refImage: ReferenceImage | null;
  refImageStatus: string;
  /** An optional state (loading, error, unavailable) shown first. */
  children?: ReactNode;
}) {
  const referenceName = reference?.name ?? "Jezero Crater";
  const km = activeRun ? extentKm(activeRun.bounds) : null;
  const uniqueSources = [...new Map(sources.map(s => [s.source_id, s])).values()];
  return (
    <>
      <Section title="Survey">
        {children}
        <EmptyNote>Select a candidate on the globe or in the list to see the evidence behind it.</EmptyNote>
        <dl className="mt-3 space-y-2 text-xs" aria-label="What this comparison is">
          <Fact label="Reference region">{reference ? <>{reference.name} · Mars · <span className="num text-fg-muted">{reference.lat.toFixed(2)}°N, {reference.lon_east.toFixed(2)}°E</span></> : "Jezero Crater · Mars"}</Fact>
          <Fact label="Area searched on Earth">{activeRun ? <>{activeRun.label} · <span className="num text-fg-muted">{formatBounds(activeRun.bounds)}</span>{km ? <span className="text-fg-muted"> · about {Math.round(km.ew)} × {Math.round(km.ns)} km</span> : null}.</> : <span className="text-fg-muted">No survey installed.</span>}</Fact>
          <Fact label="What was compared">Regional median slope and detrended relief, as footprint medians on the analysis grid. Climate, land cover and geology were not part of the comparison.</Fact>
          <Fact label="Status of the results">Candidate analogs that need scientific validation. The established analogs are under Browse Regions.</Fact>
        </dl>
      </Section>
      {reference && <div className="border-b border-line px-4 py-3"><ReferenceCard reference={reference} image={refImage} status={refImageStatus} criteria={criteria} compact /></div>}
      <Section title="How the index is calculated">
        <p className="text-xs leading-relaxed text-fg">For each footprint the service takes the absolute difference between the Earth value and the {referenceName} value for each feature, divides by that feature's fixed scale, and averages the two under the weights in the left column (D). The index is <span className="num">100 / (1 + D)</span>. Candidates are ordered by full-precision D, then spaced so no two shown centres are closer than the survey's separation rule; the raw rank before spacing is kept.</p>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[10.5px] text-fg-muted">{criteria.map(c => <li key={c.feature_id}>{c.label}: scale {c.scale} {c.unit} (declared by the service as an unvalidated assumption)</li>)}</ul>
        <p className="mt-2 text-[10.5px] text-fg-muted">{SEPARATE_SCORES_NOTE}</p>
        <p className="mt-1 text-[10.5px] text-fg-muted">{OFFLINE_NOTE}</p>
      </Section>
      {ranking && <div className="border-b border-line px-4 py-3"><SurveyFunnel response={ranking} sources={sources} /></div>}
      <Section title="Dataset sources">
        <ul className="space-y-1 text-[10.5px]">{uniqueSources.map(s => <li key={s.source_id} className="text-fg-muted"><span className="text-fg">{s.title}</span> — {s.institution} · {s.license} · {s.observation_period}{s.url && <> · <a href={s.url} target="_blank" rel="noreferrer" className="text-copper-bright underline">source</a></>}</li>)}{uniqueSources.length === 0 && <li className="text-fg-faint">Sources appear with the ranking.</li>}</ul>
      </Section>
      <Section title="Known limitations">
        <BulletList items={limitations} tone="warn" empty="None stated by the service." />
      </Section>
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="rounded-lg border border-line bg-bg px-3 py-2"><dt className="text-[10.5px] uppercase tracking-wide text-fg-faint">{label}</dt><dd className="mt-0.5 text-xs leading-snug text-fg">{children}</dd></div>;
}
