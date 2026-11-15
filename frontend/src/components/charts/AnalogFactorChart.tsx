// Per-feature contribution to the analog distance D. Non-comparable features
// are listed, not plotted. This is similarity, a different concept from
// landing suitability, and is never drawn on the same axis.
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, GRID, INFO, TOOLTIP_STYLE } from "./theme";
import type { FeatureDistance } from "@/types";

export function AnalogFactorChart({ distances }: { distances: FeatureDistance[] }) {
  const comparable = distances.filter((d) => d.comparable);
  const data = comparable.map((d) => ({ name: d.label.replace(/\s*\(.*\)\s*$/, ""), contribution: d.contribution ?? 0, distance: d.distance, weight: d.normalized_weight }));
  const total = data.reduce((a, d) => a + d.contribution, 0);
  return (
    <figure aria-label="Analog similarity: how much each feature adds to the distance">
      <div className="w-full" style={{ height: Math.max(110, data.length * 24 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 10, left: 4 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tick={AXIS} axisLine={{ stroke: AXIS.stroke }} tickLine={false} label={{ value: "weighted distance contribution (dimensionless)", position: "insideBottom", offset: -6, fill: AXIS.fill, fontSize: 9 }} />
            <YAxis type="category" dataKey="name" width={120} tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#ffffff08" }} formatter={(v, _n, item) => { const p = item.payload as (typeof data)[number]; return [`${Number(v).toFixed(3)} (d ${p.distance?.toFixed(3) ?? "—"} × w ${p.weight?.toFixed(2) ?? "—"})`, "contribution"]; }} />
            <Bar dataKey="contribution" radius={[0, 2, 2, 0]} isAnimationActive={false}>
              {data.map((_, i) => (
                <Cell key={i} fill={INFO} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="num text-[10.5px] text-fg-faint">D = {total.toFixed(3)} · similarity = 100 / (1 + D)</figcaption>
    </figure>
  );
}
