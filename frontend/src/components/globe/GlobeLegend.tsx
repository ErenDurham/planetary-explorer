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
    <div className="mt-2 border-t border-line pt-2 text-[10px] leading-relaxed text-fg-faint [overflow-wrap:anywhere]">
      {config.displayName} texture: {config.textureCreditUrl ? <a href={config.textureCreditUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-fg">{config.textureCredit}</a> : config.textureCredit}
    </div>
  );
  if (mode === "browse") return <div className="pointer-events-auto w-[260px] max-w-full rounded border border-line bg-bg-elev/90 px-3 py-2 text-xs text-fg-muted" data-testid="mission-sites-legend"><p className="font-semibold text-fg">{config.displayName} mission sites</p><p className="mt-1">Markers show available locations, without suitability scores. Select a site to inspect its measurements.</p>{credit}</div>;
  {
    return (
      <div className="pointer-events-auto w-[260px] max-w-full rounded border border-line bg-bg-elev/90 px-3 py-2 text-[10.5px] leading-relaxed text-fg-muted backdrop-blur-sm" data-testid={mode === "analog" ? "analog-legend" : mode === "mission" ? "mission-legend" : "landing-legend"}>
        <div className="mb-1 font-semibold uppercase tracking-wide text-fg-faint">{mode === "analog" ? "Analog match rank" : "Mission suitability rank"}</div>
        {heading && <div className="mb-1 text-fg">{heading}</div>}
        <div className="h-2 w-full rounded-full" style={{ background: rankGradient(palette) }} aria-hidden />
        <div className="mt-1 grid grid-cols-2 gap-3 text-[10px] leading-snug">
          <span>1 · Strongest</span>
          <span className="text-right">{rankedCount && rankedCount > 1 ? `${rankedCount} · ` : ""}Weakest</span>
        </div>
        <p className="mt-1 leading-snug">{mode === "analog" ? RANK_LEGEND_SENTENCE : "Colour shows relative mission rank, not safety or confidence."}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-dashed" style={{ borderColor: NOT_RANKED_COLOR }} aria-hidden /> Not ranked
          </span>
        </div>
        {onPaletteChange && (
          <label className="mt-2 flex cursor-pointer items-start gap-2 text-fg-muted">
            <input type="checkbox" checked={palette === "single_hue"} onChange={(e) => onPaletteChange(e.target.checked ? "single_hue" : "roygbiv")} className="mt-0.5 h-3 w-3 shrink-0 accent-copper-bright" />
            <span>Single-hue palette <span className="text-fg-faint">· light to dark</span></span>
          </label>
        )}
        {credit}
      </div>
    );
  }
}
