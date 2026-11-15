// Priority distribution pie beside the sliders, for either planet: one slice
// per factor, sized by its share of 100%, in the same colours as the slider
// dots. Numbers appear only in the popup shown while hovering (or focusing) a
// slice; the legend names the slices.
import { useState, type MouseEvent } from "react";
import { Section } from "@/components/ui/Section";
import { Floating } from "@/components/ui/Floating";
import { PriorityHoverCard } from "@/components/mission/PriorityHoverCard";
import type { PriorityFactor } from "@/components/mission/priorityFactors";

const SIZE = 200;
const C = SIZE / 2;
const R = 92;
const POINTER_GAP = 14;

const point = (deg: number, r: number) => {
  const rad = (deg * Math.PI) / 180;
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)] as const;
};

function slicePath(start: number, end: number): string {
  const [x1, y1] = point(start, R);
  const [x2, y2] = point(end, R);
  const large = end - start > 180 ? 1 : 0;
  return `M ${C} ${C} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
}

export function PriorityPie({ factors, shares: values }: { factors: PriorityFactor[]; shares: Record<string, number> }) {
  // pointer (or slice centre, for keyboard focus) in viewport coordinates
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);

  const shares = factors.map((f) => ({ id: f.id, factor: f, share: Math.round(values[f.id] ?? 0) }));
  const total = shares.reduce((sum, s) => sum + s.share, 0);

  let angle = -90; // first slice starts at 12 o'clock
  const slices = shares.filter((s) => s.share > 0).map((s) => {
    const sweep = total ? (s.share / total) * 360 : 0;
    const start = angle;
    angle += sweep;
    return { ...s, start, end: angle, mid: start + sweep / 2, sweep };
  });

  const onMove = (id: string) => (e: MouseEvent) => setHover({ id, x: e.clientX, y: e.clientY });
  const onFocus = (id: string, mid: number) => (e: React.FocusEvent<SVGElement>) => {
    const svg = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!svg) return;
    const [px, py] = point(mid, R * 0.6);
    setHover({ id, x: svg.left + (px / SIZE) * svg.width, y: svg.top + (py / SIZE) * svg.height });
  };
  const hovered = hover ? shares.find((s) => s.id === hover.id) : undefined;

  return (
    <Section large title="Priority distribution">
      {total === 0 ? (
        <p className="text-sm text-fg-faint">No priority has a share above 0%.</p>
      ) : (
        <div className="relative mx-auto w-full max-w-[260px]" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="block h-auto w-full" role="group" aria-label={`Priority distribution: ${shares.map((s) => `${s.factor.name} ${s.share}%`).join(", ")}`}>
            {slices.map((s) => {
              const common = {
                fill: s.factor.color,
                className: "stroke-bg-elev cursor-pointer outline-none transition-opacity duration-150",
                strokeWidth: 2,
                opacity: hover && hover.id !== s.id ? 0.45 : 1,
                tabIndex: 0,
                role: "img",
                "aria-label": `${s.factor.name}: ${s.share}%`,
                "data-testid": `pie-slice-${s.id}`,
                onMouseEnter: onMove(s.id),
                onMouseMove: onMove(s.id),
                onFocus: onFocus(s.id, s.mid),
                onBlur: () => setHover(null),
              };
              return s.sweep >= 359.99 ? <circle key={s.id} cx={C} cy={C} r={R} {...common} /> : <path key={s.id} d={slicePath(s.start, s.end)} {...common} />;
            })}
          </svg>
          {hover && hovered && (
            <Floating anchor={() => ({ left: hover.x, right: hover.x, top: hover.y, bottom: hover.y })} gap={POINTER_GAP} interactive={false}>
              <PriorityHoverCard factor={hovered.factor} percent={hovered.share} />
            </Floating>
          )}
        </div>
      )}
      <ul className="mt-4 grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" aria-label="Pie legend">
        {shares.map((s) => (
          <li key={s.id} className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.factor.color }} aria-hidden />
            <span className="min-w-0 truncate text-fg-muted">{s.factor.name}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
