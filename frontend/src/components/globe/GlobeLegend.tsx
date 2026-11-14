import { LEGEND_STOPS, INELIGIBLE_COLOR, INSUFFICIENT_COLOR } from "./colors";
import type { PlanetConfig } from "./PlanetConfig";

export function GlobeLegend({ config }: { config: PlanetConfig }) {
  const gradient = `linear-gradient(to right, ${LEGEND_STOPS.map((s) => `${s.color} ${s.score}%`).join(", ")})`;
  return (
    <div className="pointer-events-auto rounded border border-line bg-bg-elev/90 px-3 py-2 text-[10.5px] text-fg-muted backdrop-blur-sm">
      <div className="mb-1 font-semibold uppercase tracking-wide text-fg-faint">Relative suitability index</div>
      <div className="h-2 w-40 rounded-sm" style={{ background: gradient }} aria-hidden />
      <div className="num mt-0.5 flex w-40 justify-between">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1">
          <span className="hatched inline-block h-2.5 w-2.5 rounded-sm border border-line-strong" style={{ backgroundColor: INELIGIBLE_COLOR }} aria-hidden /> ineligible
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: INSUFFICIENT_COLOR }} aria-hidden /> insufficient data
        </span>
      </div>
      <div className="mt-1.5 border-t border-line pt-1 text-fg-faint">
        Texture: {config.textureCreditUrl ? <a href={config.textureCreditUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-fg">{config.textureCredit}</a> : config.textureCredit}
      </div>
    </div>
  );
}
