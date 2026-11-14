// Environmental profile: what the site IS, grouped by category, with
// provenance and a quality badge on every metric. This is deliberately a
// separate section from the suitability panel, which is what the site SCORES
// under one mission - the two are never mixed.
import { useMemo } from "react";
import { Section, EmptyNote } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { formatPercent } from "@/lib/format";
import type { EnvironmentalMeasurement, EnvironmentalProfile } from "@/types";
import { CATEGORY_LABELS, CATEGORY_ORDER, QualityBadge } from "./QualityBadge";
import { ProvenancePopover } from "./ProvenancePopover";
import { MeasurementValue } from "./MeasurementValue";

export function EnvironmentalProfilePanel({ profile }: { profile: EnvironmentalProfile }) {
  const groups = useMemo(() => groupByCategory(profile.measurements), [profile.measurements]);
  const c = profile.completeness;
  const hasDemo = profile.measurements.some((m) => m.quality_flag === "demo_fixture" || m.measurement_type === "demo_fixture");

  return (
    <Section
      title="Environmental profile"
      subtitle={
        <span>
          Available <span className="num text-fg">{c.features_available}/{c.features_requested}</span> fields ({formatPercent(c.fraction)})
        </span>
      }
    >
      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-sm bg-line" aria-hidden>
        <div className="h-full bg-info" style={{ width: `${Math.round(c.fraction * 100)}%` }} />
      </div>
      {hasDemo && (
        <div className="mb-2">
          <Badge tone="danger">contains demo data - not real measurements</Badge>
        </div>
      )}
      {groups.length === 0 ? (
        <EmptyNote>No measurements are available for this site.</EmptyNote>
      ) : (
        <div className="space-y-3">
          {groups.map(([category, items]) => (
            <div key={category}>
              <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-copper">{CATEGORY_LABELS[category] ?? category}</h3>
              <ul className="divide-y divide-line/70">
                {items.map((m) => (
                  <li key={m.feature_id} className="grid grid-cols-[1fr_auto] items-start gap-2 py-1.5" data-testid={`metric-${m.feature_id}`}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-fg-muted">{m.label}</span>
                        <QualityBadge flag={m.quality_flag} />
                        {m.measurement_type === "demo_fixture" && m.quality_flag !== "demo_fixture" && <Badge tone="danger">demo data</Badge>}
                      </div>
                      <div className="mt-0.5">
                        <MeasurementValue m={m} />
                      </div>
                    </div>
                    <ProvenancePopover measurement={m} source={m.source_id ? profile.sources[m.source_id] : undefined} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-fg-muted">Terrain measurements cover regional features (~3.7 km cells), not lander-scale hazards.</p>
      <details className="mt-2 text-xs text-fg-muted">
        <summary className="cursor-pointer">Processing details</summary>
        <p className="mt-2">Profile {profile.profile_version} · {profile.pipeline}</p>
      </details>
    </Section>
  );
}

function groupByCategory(ms: EnvironmentalMeasurement[]): Array<[string, EnvironmentalMeasurement[]]> {
  const map = new Map<string, EnvironmentalMeasurement[]>();
  for (const m of ms) {
    const arr = map.get(m.category) ?? [];
    arr.push(m);
    map.set(m.category, arr);
  }
  const ordered: Array<[string, EnvironmentalMeasurement[]]> = [];
  for (const cat of CATEGORY_ORDER) if (map.has(cat)) ordered.push([cat, map.get(cat)!]);
  for (const [cat, arr] of map) if (!CATEGORY_ORDER.includes(cat)) ordered.push([cat, arr]);
  return ordered;
}
