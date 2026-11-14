import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, GRID, INFO, TOOLTIP_STYLE } from "./theme";
import type { SiteWithProfile } from "@/types";

export function CompletenessChart({ profiles }: { profiles: SiteWithProfile[] }) {
  const data = profiles.map((p) => ({
    name: p.site.name.replace(/\s*\(.*\)\s*$/, ""),
    available: p.profile.completeness.features_available,
    requested: p.profile.completeness.features_requested,
    pct: Math.round(p.profile.completeness.fraction * 100),
    missing: p.profile.completeness.missing_feature_ids ?? [],
  }));
  return (
    <figure aria-label="Data completeness per site">
      <div className="w-full" style={{ height: Math.max(120, data.length * 24 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 10, left: 4 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" domain={[0, 100]} tick={AXIS} axisLine={{ stroke: AXIS.stroke }} tickLine={false} unit="%" label={{ value: "features available (% of requested)", position: "insideBottom", offset: -6, fill: AXIS.fill, fontSize: 9 }} />
            <YAxis type="category" dataKey="name" width={130} tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#ffffff08" }} formatter={(v, _n, item) => { const p = item.payload as (typeof data)[number]; return [`${p.available}/${p.requested} (${v}%)${p.missing.length ? ` · missing: ${p.missing.join(", ")}` : ""}`, "completeness"]; }} />
            <Bar dataKey="pct" radius={[0, 2, 2, 0]} isAnimationActive={false}>
              {data.map((_, i) => (
                <Cell key={i} fill={INFO} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
