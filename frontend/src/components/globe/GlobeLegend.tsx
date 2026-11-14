import { LEGEND_STOPS, INELIGIBLE_COLOR, INSUFFICIENT_COLOR } from "./colors";
import { NOT_RANKED_COLOR, RANK_LEGEND_SENTENCE, rankGradient, type RankPalette } from "@/lib/rankColor";
import type { PlanetConfig } from "./PlanetConfig";
import type { MarkerMode } from "./MarkerData";

export interface GlobeLegendProps {
  config: PlanetConfig;
  /** Landing legend (Mars suitability index) or analog match-rank legend. */
  mode?: MarkerMode;
  palette?: RankPalette;
  onPaletteChange?: (p: RankPalette) => void;
  /** Analog mode: "<Body> matches to <reference name>". */
  heading?: string;
  /** Analog mode: how many candidates carry a rank (the scale's extent). */
  rankedCount?: number | null;
}

export function GlobeLegend({ config, mode = "landing", palette = "roygbiv", onPaletteChange, heading, rankedCount }: GlobeLegendProps) {
  const credit = (
    <div className="mt-1.5 border-t border-line pt-1 text-fg-faint">
      {config.displayName} texture: {config.textureCreditUrl ? <a href={config.textureCreditUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-fg">{config.textureCredit}</a> : config.textureCredit}
    </div>
  );
  if (mode === "analog") {
    return (
      <div className="pointer-events-auto max-w-[260px] rounded border border-line bg-bg-elev/90 px-3 py-2 text-[10.5px] text-fg-muted backdrop-blur-sm" data-testid="analog-legend">
        <div className="mb-1 font-semibold uppercase tracking-wide text-fg-faint">Analog match rank</div>
        {heading && <div className="mb-1 text-fg">{heading}</div>}
        <div className="h-2 w-56 rounded-sm" style={{ background: rankGradient(palette) }} aria-hidden />
        <div className="num mt-0.5 flex w-56 items-center justify-between gap-2 whitespace-nowrap">
          <span>1 · strongest match</span>
          <span aria-hidden>→</span>
          <span>{rankedCount && rankedCount > 1 ? `${rankedCount} · ` : ""}weakest match</span>
        </div>
        <p className="mt-1 leading-snug">{RANK_LEGEND_SENTENCE}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-dashed" style={{ borderColor: NOT_RANKED_COLOR }} aria-hidden /> Not ranked (outside the scale)
          </span>
        </div>
        {onPaletteChange && (
          <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-fg-muted">
            <input type="checkbox" checked={palette === "single_hue"} onChange={(e) => onPaletteChange(e.target.checked ? "single_hue" : "roygbiv")} className="h-3 w-3 accent-copper-bright" />
            Single-hue palette (ranks as light → dark)
          </label>
        )}
        {credit}
      </div>
    );
  }
  const gradient = `linear-gradient(to right, ${LEGEND_STOPS.map((s) => `${s.color} ${s.score}%`).join(", ")})`;
  return (
    <div className="pointer-events-auto rounded border border-line bg-bg-elev/90 px-3 py-2 text-[10.5px] text-fg-muted backdrop-blur-sm" data-testid="landing-legend">
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
      {credit}
    </div>
  );
}
