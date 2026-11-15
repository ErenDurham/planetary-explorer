// Detail panels for the Earth-Mars release.
//
// EarthLocationPanel: an Earth analog candidate has no /sites/{id} profile
// (that endpoint is Mars only), so its detail comes from the comparison
// catalogue: description, coordinates, coverage and the measurements with
// their provenance. It never shows a landing score, because Earth locations
// have none.
//
// AnalogMatchPanel: the selected candidate's row from POST /analogs/rank -
// rank, similarity, coverage, shared and different characteristics, the
// feature basis and anything dropped pool-wide. Numbers come from the backend
// response only.
import { MapPin } from "lucide-react";
import { InfoTip } from "@/components/ui/InfoTip";
import { Section, EmptyNote, BulletList } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { MeasurementValue } from "@/components/sites/MeasurementValue";
import { QualityBadge } from "@/components/sites/QualityBadge";
import { BODY_NAME, analogFeatureLabel } from "@/lib/analogFeatures";
import { formatLatLon, formatNumber, humanize } from "@/lib/format";
import { NOT_RANKED_COLOR, rankColor, type RankPalette } from "@/lib/rankColor";
import type { AnalogRankResponse, ComparisonLocation, RankedCandidate } from "@/types";

export function EarthLocationPanel({ location }: { location: ComparisonLocation }) {
  return (
    <>
      <Section title="Earth location" actions={<InfoTip variant="help" label="About Earth locations">Earth locations carry no landing suitability index; the Mars landing model is not applied to them.</InfoTip>}>
        <h2 className="text-base font-medium leading-tight text-fg">{location.name}</h2>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-fg-muted">
          <MapPin className="h-3 w-3" aria-hidden /> {location.region} · <span className="num">{formatLatLon(location.lat, location.lon_east)}</span>
        </p>
        {location.coverage && <p className="num mt-0.5 text-[10.5px] text-fg-faint">{location.coverage}</p>}
        <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{location.description}</p>
      </Section>
      <details className="m-4 rounded-lg border border-line">
        <summary className="cursor-pointer p-3 text-sm text-fg">All environmental measurements and sources</summary>
        <ul className="divide-y divide-line px-3 pb-3" aria-label="Earth measurements">
          {location.measurements.map((m) => {
            const source = m.source_id ? location.sources[m.source_id] : undefined;
            return (
              <li key={m.feature_id} className="py-2" data-testid={`earth-metric-${m.feature_id}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-fg-muted">{m.label}</span>
                  <QualityBadge flag={m.quality_flag} />
                </div>
                <div className="mt-0.5"><MeasurementValue m={m} /></div>
                <p className="mt-0.5 text-[10.5px] text-fg-faint">{m.measurement_type === "estimated" ? "Modelled" : humanize(m.measurement_type)}{source ? ` · ${source.title}` : ""}</p>
              </li>
            );
          })}
        </ul>
      </details>
    </>
  );
}

export function AnalogMatchPanel({ candidate, response, palette, referenceName }: { candidate: RankedCandidate | undefined; response: AnalogRankResponse | undefined; palette: RankPalette; referenceName: string | null }) {
  if (!referenceName) {
    return (
      <Section title="Analog match">
        <EmptyNote>Choose a reference on the other body to rank this location against it.</EmptyNote>
      </Section>
    );
  }
  if (!candidate || !response) {
    return (
      <Section title="Analog match">
        <EmptyNote>Ranking against {referenceName}…</EmptyNote>
      </Section>
    );
  }
  const unranked = candidate.rank == null;
  const colour = unranked ? NOT_RANKED_COLOR : rankColor(candidate.rank_color_position, palette);
  return (
    <Section title="Analog match" actions={response.tie_rule ? <InfoTip variant="help" label="How ties are ranked">{response.tie_rule}</InfoTip> : undefined} subtitle={<>Against <span className="text-fg">{referenceName}</span> ({BODY_NAME[response.reference.body]}). Similarity is a weighted feature distance, not scientific equivalence.</>}>
      <div className="flex items-center gap-3">
        <span className="num inline-flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold" style={unranked ? { borderColor: colour ?? undefined, borderStyle: "dashed", color: colour ?? undefined } : { backgroundColor: colour ?? undefined, borderColor: "#fff", color: "#fff", textShadow: "0 0 2px #000" }} aria-hidden>{candidate.rank ?? "–"}</span>
        <div className="text-xs text-fg">
          <div>{unranked ? "Not ranked" : `Match rank ${candidate.rank} of ${response.ranked_count}`}</div>
          <div className="num text-fg-muted">{candidate.similarity != null ? `${formatNumber(candidate.similarity, { maxFractionDigits: 1 })}% match` : "no similarity"} · coverage {Math.round(candidate.coverage_fraction * 100)}% of basis features</div>
        </div>
      </div>
      {candidate.unrankable_reason && <p className="mt-2 text-xs text-warn">{candidate.unrankable_reason}</p>}
      <div className="mt-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">Shared characteristics</h3>
        <div className="mt-1"><BulletList items={candidate.shared_characteristics} tone="ok" empty="None reported." /></div>
      </div>
      <div className="mt-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-fg-faint">Important differences</h3>
        <div className="mt-1"><BulletList items={candidate.important_differences} tone="warn" empty="None reported." /></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1" aria-label="Feature basis">
        {response.basis_features.map((f) => <Badge key={f} tone="neutral">{analogFeatureLabel(f)} {Math.round((response.effective_weights[f] ?? 0) * 100)}%</Badge>)}
      </div>
      {response.excluded_features.filter((e) => !/weight is 0/.test(e.reason)).length > 0 && (
        <p className="mt-2 text-[10.5px] text-fg-faint">Dropped pool-wide: {response.excluded_features.filter((e) => !/weight is 0/.test(e.reason)).map((e) => `${e.label} (${e.reason})`).join("; ")}</p>
      )}
    </Section>
  );
}
