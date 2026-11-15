// Compact aligned table for the pair: regional slope and detrended relief as
// raw values with units and an absolute difference at the ~3.7 km harmonised
// baseline; landforms and materials as shared / unique tags; dataset coverage,
// methods and unavailable features. Metric labels stay sticky. Planetary
// context (gravity, atmosphere, radiation, datum) is a SEPARATE block.
import { Badge } from "@/components/ui/Badge";
import { measurement, splitTags, tagList, terrainDifference } from "@/lib/comparison";
import { formatNumber, formatUnit, humanize } from "@/lib/format";
import type { PairColumnData } from "@/components/compare/PairSelectors";
import type { FeatureDistance, RankedCandidate } from "@/types";

const BASELINE = "~3.7 km matched baseline";

function fd(candidate: RankedCandidate | undefined, feature: string): FeatureDistance | undefined {
  return candidate?.feature_distances.find(d => d.feature_id === feature);
}

function Raw({ col, feature }: { col: PairColumnData; feature: string }) {
  const m = col.location ? measurement(col.location, feature) : undefined;
  if (!m || typeof m.value !== "number") return <span className="text-fg-muted">Not available</span>;
  const src = m.source_id ? col.location?.sources[m.source_id] : undefined;
  return <><span className="num text-base text-fg">{formatNumber(m.value)} {formatUnit(m.unit)}</span><span className="block text-[11px] text-fg-muted">{m.measurement_type === "estimated" ? "Modelled" : humanize(m.measurement_type)}{src ? ` · ${src.title}` : ""}{m.spatial_resolution ? ` · ${m.spatial_resolution}` : ""}</span></>;
}

function Tags({ tags, tone, label }: { tags: string[]; tone: "ok" | "neutral"; label: string }) {
  if (!tags.length) return <span className="text-xs text-fg-faint">{label}: none</span>;
  return <span className="flex flex-wrap items-center gap-1 text-xs"><span className="text-fg-faint">{label}:</span>{tags.map(t => <Badge key={t} tone={tone}>{humanize(t)}</Badge>)}</span>;
}

export function PairMetricsTable({ columns, candidate, rankExcluded }: { columns: [PairColumnData, PairColumnData]; candidate: RankedCandidate | undefined; rankExcluded: { label: string; reason: string }[] }) {
  const [a, b] = columns;
  const diff = (feature: string) => a.location && b.location ? terrainDifference(a.location, b.location, feature) : null;
  const tagRow = (feature: string, label: string, note: string) => {
    const d = fd(candidate, feature);
    const valueFor = (col: PairColumnData) => { const m = col.location ? measurement(col.location, feature) : undefined; return Array.isArray(m?.value) ? m!.value.map(String) : tagList((col.body === "mars" ? d?.mars_value : d?.earth_value) ?? null); };
    const split = splitTags(valueFor(a), valueFor(b));
    return (
      <tr key={feature}>
        <th scope="row" className="compare-metric"><span className="font-medium text-fg">{label}</span><p className="mt-1 text-xs font-normal leading-relaxed text-fg-muted">{note}</p></th>
        <td><Tags tags={split.shared} tone="ok" label="Shared" /><div className="mt-1"><Tags tags={split.onlyA} tone="neutral" label={`Only ${a.location?.name ?? a.body}`} /></div></td>
        <td><Tags tags={split.shared} tone="ok" label="Shared" /><div className="mt-1"><Tags tags={split.onlyB} tone="neutral" label={`Only ${b.location?.name ?? b.body}`} /></div></td>
        <td className="text-xs text-fg-muted">{split.shared.length} shared of {split.shared.length + split.onlyA.length + split.onlyB.length} tags{d?.distance != null && <span className="num block">Jaccard distance {d.distance.toFixed(2)}</span>}<span className="block text-fg-faint">Qualitative. Matching labels are shared descriptions, not identical terrain.</span></td>
      </tr>
    );
  };
  const numRow = (feature: string, label: string, note: string) => {
    const d = fd(candidate, feature); const gap = diff(feature); const unit = d?.unit ?? (a.location ? measurement(a.location, feature)?.unit : null);
    return (
      <tr key={feature}>
        <th scope="row" className="compare-metric"><span className="font-medium text-fg">{label}</span><p className="mt-1 text-xs font-normal leading-relaxed text-fg-muted">{note}</p></th>
        <td><Raw col={a} feature={feature} /></td>
        <td><Raw col={b} feature={feature} /></td>
        <td>{gap == null ? <span className="text-fg-muted">Difference unavailable</span> : <><span className="num text-base text-fg">{formatNumber(gap)} {formatUnit(unit)}</span> <span className="text-xs text-fg-muted">apart</span></>}<span className="block text-[11px] text-fg-muted">{BASELINE}{d?.scale != null && ` · comparison scale ${formatNumber(d.scale)} ${formatUnit(d.unit)}`}{d && !d.comparable && " · not comparable for this pair"}</span></td>
      </tr>
    );
  };
  const nonComparable = candidate?.feature_distances.filter(d => !d.comparable) ?? [];
  return (
    <div className="compare-table-wrap scroll-thin rounded border border-line" role="region" aria-label="Pair measurements" tabIndex={0}>
      <table className="compare-table compare-pair" style={{ minWidth: 820 }}>
        <caption className="sr-only">Terrain, materials and data coverage for the two selected sites. The difference is shown where both measurements use the same baseline.</caption>
        <colgroup><col className="compare-label-col" /><col /><col /><col /></colgroup>
        <thead><tr>
          <th scope="col" className="compare-metric"><div className="text-xs uppercase tracking-widest text-fg-muted">Metric</div></th>
          <th scope="col"><div className="text-[10.5px] uppercase tracking-[0.12em] text-fg-muted">{a.label}</div><div className="text-sm font-semibold text-fg">{a.location?.name ?? "—"}</div></th>
          <th scope="col"><div className="text-[10.5px] uppercase tracking-[0.12em] text-fg-muted">{b.label}</div><div className="text-sm font-semibold text-fg">{b.location?.name ?? "—"}</div></th>
          <th scope="col"><div className="text-xs uppercase tracking-widest text-fg-muted">Difference</div><p className="mt-1 text-xs font-normal text-fg-muted">Absolute, same units</p></th>
        </tr></thead>
        <tbody>
          {numRow("slope_regional_median_deg", "Regional slope (median)", "Median slope of the footprint, on matched Earth and Mars terrain grids. It is not a landing-hazard slope.")}
          {numRow("roughness_regional_m", "Detrended relief", "Unevenness after the broad tilt is removed, per ~3.7 km cell. It is not rock-scale roughness.")}
          {tagRow("terrain_morphology", "Landforms", "Landform labels from the literature.")}
          {tagRow("mineralogy_tags", "Materials", "Mineral labels from the literature. They are not spectral or quantitative measurements.")}
          <tr>
            <th scope="row" className="compare-metric"><span className="font-medium text-fg">Data coverage and methods</span><p className="mt-1 text-xs font-normal leading-relaxed text-fg-muted">Footprint, grids and what was left out of the score.</p></th>
            {[a, b].map(c => <td key={c.body} className="text-xs text-fg-muted">{c.location ? <><span className="text-fg">{c.location.coverage}</span><ul className="mt-1 space-y-0.5">{[...new Set(c.location.measurements.filter(m => !m.is_missing).map(m => m.source_id && c.location!.sources[m.source_id]?.title).filter(Boolean))].slice(0, 4).map(t => <li key={String(t)}>{t}</li>)}</ul>{c.location.measurements.some(m => m.is_missing) && <p className="mt-1 text-warn">Missing here: {c.location.measurements.filter(m => m.is_missing).map(m => m.label).join(", ")}</p>}</> : "—"}</td>)}
            <td className="text-xs text-fg-muted">{nonComparable.length === 0 && rankExcluded.length === 0 ? "Every feature could be compared for this pair." : <ul className="space-y-0.5">{nonComparable.map(d => <li key={d.feature_id} className="text-warn">Not comparable: {d.label}{d.note ? ` (${d.note})` : ""}</li>)}{rankExcluded.map(f => <li key={f.label}>Left out for every site: {f.label} ({f.reason})</li>)}</ul>}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
