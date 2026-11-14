import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, COPPER, GRID, MUTED, TOOLTIP_STYLE } from "./theme";
import type { FactorScore } from "@/types";

export function FactorBreakdownChart({ factors }: { factors: FactorScore[] }) {
  const data = factors.map((f) => ({
    name: shortLabel(f.label),
    contribution: f.weighted_contribution ?? 0,
    excluded: !!f.excluded_reason || f.is_missing,
    suitability: f.suitability,
    weight: f.normalized_weight,
  }));
  const total = data.reduce((a, d) => a + d.contribution, 0);
  return (
    <figure aria-label="Factor breakdown: weighted contribution per criterion">
      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" domain={[0, 100]} tick={AXIS} axisLine={{ stroke: AXIS.stroke }} tickLine={false} label={{ value: "weighted contribution (index points)", position: "insideBottom", offset: -2, fill: AXIS.fill, fontSize: 9 }} />
            <YAxis type="category" dataKey="name" width={118} tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: "#ffffff08" }}
              formatter={(v, _n, item) => {
                const p = item.payload as (typeof data)[number];
                return [`${Number(v).toFixed(1)} pts (suitability ${p.suitability?.toFixed(2) ?? "—"}, weight ${p.weight?.toFixed(2) ?? "—"})`, "contribution"];
              }}
            />
            <Bar dataKey="contribution" radius={[0, 2, 2, 0]} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.excluded ? MUTED : COPPER} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="num text-[10.5px] text-fg-faint">Sum of contributions: {total.toFixed(1)} index points</figcaption>
    </figure>
  );
}

function shortLabel(label: string): string {
  return label.replace(/\s*\(.*\)\s*$/, "");
}
