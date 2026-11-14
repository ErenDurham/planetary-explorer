// One metric across all sites. A single quantity per chart - never two
// incompatible units on one axis. Sites with a missing value are listed under
// the chart as "No data" rather than plotted as zero.
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, GRID, INFO, TOOLTIP_STYLE } from "./theme";
import { formatUnit } from "@/lib/format";
import type { EnvironmentalMeasurement, SiteWithProfile } from "@/types";

export interface ComparableMetric {
  feature_id: string;
  label: string;
  unit: string | null | undefined;
}

export function numericMetrics(profiles: SiteWithProfile[]): ComparableMetric[] {
  const seen = new Map<string, ComparableMetric>();
  for (const p of profiles) {
    for (const m of p.profile.measurements) {
      if (typeof m.value === "number" || (m.is_missing && m.unit)) {
        if (!seen.has(m.feature_id)) seen.set(m.feature_id, { feature_id: m.feature_id, label: m.label, unit: m.unit });
      }
    }
  }
  return [...seen.values()];
}

export function EnvironmentalComparisonChart({ profiles, featureId, onFeatureChange, selectedId }: { profiles: SiteWithProfile[]; featureId: string; onFeatureChange: (id: string) => void; selectedId?: string | null }) {
  const metrics = useMemo(() => numericMetrics(profiles), [profiles]);
  const metric = metrics.find((m) => m.feature_id === featureId) ?? metrics[0];
  const rows = useMemo(() => {
    if (!metric) return [];
    return profiles.map((p) => {
      const m: EnvironmentalMeasurement | undefined = p.profile.measurements.find((x) => x.feature_id === metric.feature_id);
      const value = m && !m.is_missing && typeof m.value === "number" ? m.value : null;
      return { id: p.site.id, name: p.site.name.replace(/\s*\(.*\)\s*$/, ""), value, quality: m?.quality_flag ?? "missing", notes: m?.notes ?? null };
    });
  }, [profiles, metric]);
  const present = rows.filter((r) => r.value != null);
  const missing = rows.filter((r) => r.value == null);
  if (!metric) return <p className="text-xs text-fg-faint">No numeric metrics to compare.</p>;
  const unit = formatUnit(metric.unit);

  return (
    <figure aria-label={`${metric.label} across sites`}>
      <div className="mb-2 flex items-center gap-2">
        <label htmlFor="metric-select" className="text-[10.5px] uppercase tracking-wide text-fg-faint">
          Metric
        </label>
        <select id="metric-select" value={metric.feature_id} onChange={(e) => onFeatureChange(e.target.value)} className="min-w-0 flex-1 rounded border border-line-strong bg-bg-elev-2 px-2 py-1 text-xs text-fg">
          {metrics.map((m) => (
            <option key={m.feature_id} value={m.feature_id}>
              {m.label}
              {m.unit ? ` (${formatUnit(m.unit)})` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="w-full" style={{ height: Math.max(120, present.length * 24 + 44) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={present} layout="vertical" margin={{ top: 4, right: 20, bottom: 12, left: 4 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tick={AXIS} axisLine={{ stroke: AXIS.stroke }} tickLine={false} domain={["auto", "auto"]} label={{ value: `${metric.label}${unit ? ` (${unit})` : ""}`, position: "insideBottom", offset: -8, fill: AXIS.fill, fontSize: 9 }} />
            <YAxis type="category" dataKey="name" width={130} tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#ffffff08" }} formatter={(v, _n, item) => [`${Number(v).toLocaleString()} ${unit} · ${(item.payload as (typeof rows)[number]).quality}`, metric.label]} />
            <Bar dataKey="value" radius={[0, 2, 2, 0]} isAnimationActive={false}>
              {present.map((r) => (
                <Cell key={r.id} fill={INFO} stroke={r.id === selectedId ? "#f0a03c" : undefined} strokeWidth={r.id === selectedId ? 1.5 : 0} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {missing.length > 0 && (
        <figcaption className="mt-1 text-[10.5px] text-fg-faint">
          No data{unit ? ` (${unit})` : ""}: {missing.map((r) => r.name).join(", ")}
          {missing[0]?.notes && <span> — {missing[0].notes}</span>}
        </figcaption>
      )}
    </figure>
  );
}
