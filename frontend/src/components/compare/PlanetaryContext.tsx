// Atmosphere, gravity, radiation, temperature and the elevation-datum note:
// planetary differences that no Earth site can match. Shown as CONTEXT beside
// the pair and never folded into the similarity index.
import { BODY_COLOR } from "@/components/imagery/assetUrl";
import { formatNumber } from "@/lib/format";
import type { BodyReference } from "@/types";

export function PlanetaryContext({ differences, bodies }: { differences: string[] | undefined; bodies: BodyReference[] }) {
  const pair = bodies.filter((b): b is BodyReference & { id: "earth" | "mars" } => b.id === "earth" || b.id === "mars");
  return (
    <section aria-label="Planetary context. This is not part of the similarity score." className="rounded border border-warn/40 bg-warn/5 p-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-warn">Planetary context · not part of the similarity score</h2>
      <p className="mt-0.5 text-xs text-fg-muted">These are differences between the two planets. They are shown for every pair, but they are not compared or scored.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {pair.map(b => (
          <dl key={b.id} className="rounded border border-line bg-bg-elev p-3 text-xs" style={{ borderTop: `3px solid ${BODY_COLOR[b.id]}` }}>
            <div className="mb-1 text-sm font-semibold" style={{ color: BODY_COLOR[b.id] }}>{b.name}</div>
            <dt className="text-fg-faint">Surface gravity</dt><dd className="num text-fg">{b.gravity_ms2.toFixed(2)} m/s²</dd>
            <dt className="mt-1 text-fg-faint">Atmosphere</dt><dd className="text-fg">{b.atmosphere}</dd>
            <dt className="mt-1 text-fg-faint">Incident solar irradiance (above any atmosphere)</dt><dd className="num text-fg">{formatNumber(b.solar_irradiance_wm2)} W/m²</dd>
            <dt className="mt-1 text-fg-faint">Mean solar day</dt><dd className="num text-fg">{formatNumber(b.solar_day_hours, { maxFractionDigits: 2 })} h</dd>
            <dd className="mt-1"><a className="text-fg-muted underline decoration-line-strong underline-offset-4" href={b.fact_source.url} target="_blank" rel="noreferrer">NASA fact sheet ↗<span className="sr-only">: {b.name}</span></a></dd>
          </dl>
        ))}
      </div>
      {differences && differences.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs leading-relaxed text-fg">
          {differences.map((d, i) => <li key={i} className="flex gap-2"><span aria-hidden className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-sm bg-warn" /><span>{d}</span></li>)}
        </ul>
      )}
    </section>
  );
}
