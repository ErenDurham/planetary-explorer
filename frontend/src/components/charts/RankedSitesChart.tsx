import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, COPPER_BRIGHT, GRID, TOOLTIP_STYLE } from "./theme";
import { missionRankPosition, rankColor, NOT_RANKED_COLOR } from "@/lib/rankColor";
import { markerAppearance } from "@/components/globe/colors";
import type { SuitabilityResult } from "@/types";

export function RankedSitesChart({ results, selectedId, onSelect }: { results: SuitabilityResult[]; selectedId?: string | null; onSelect?: (id: string) => void }) {
  const data = results.map((r) => ({
    id: r.site_id,
    name: `${r.rank != null ? `${r.rank}. ` : ""}${r.site_name.replace(/\s*\(.*\)\s*$/, "")}`,
    score: r.score ?? 0,
    status: r.status,
    color: r.status === "ok" ? rankColor(missionRankPosition(r.rank,results.map(r=>r.rank))) ?? NOT_RANKED_COLOR : markerAppearance(r.status,r.score).color,
  }));
  return (
    <figure aria-label="Ranked sites by relative suitability index">
      <div className="w-full" style={{ height: Math.max(140, data.length * 26 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 10, left: 4 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" domain={[0, 100]} tick={AXIS} axisLine={{ stroke: AXIS.stroke }} tickLine={false} label={{ value: "relative suitability index (0–100)", position: "insideBottom", offset: -6, fill: AXIS.fill, fontSize: 9 }} />
            <YAxis type="category" dataKey="name" width={140} tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#ffffff08" }} formatter={(v, _n, item) => [`${Number(v).toFixed(1)} (${(item.payload as (typeof data)[number]).status})`, "index"]} />
            <Bar dataKey="score" radius={[0, 2, 2, 0]} isAnimationActive={false} onClick={(d) => onSelect?.((d as unknown as { id: string }).id)} cursor={onSelect ? "pointer" : undefined}>
              {data.map((d) => (
                <Cell key={d.id} fill={d.color} stroke={d.id === selectedId ? COPPER_BRIGHT : undefined} strokeWidth={d.id === selectedId ? 1.5 : 0} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
