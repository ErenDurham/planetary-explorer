import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { InfoTip } from "@/components/ui/InfoTip";
import { NOT_RANKED_COLOR, RANK_LEGEND_SENTENCE, rankGradient, type RankPalette } from "@/lib/rankColor";
import type { PlanetConfig } from "./PlanetConfig";
import type { MarkerMode } from "./MarkerData";
import { ROLE_HINT, SITE_ROLES, type RoleFilter } from "@/lib/roles";
import type { SiteRole } from "@/types";

/** Role filter shown in the legend: which roles are on this globe, and which one is shown. */
export interface RoleLegend {
  counts: Record<SiteRole, number>;
  selected: RoleFilter;
  onChange: (r: RoleFilter) => void;
}

function RoleChips({ roles }: { roles: RoleLegend }) {
  const present = SITE_ROLES.filter((r) => roles.counts[r] > 0);
  if (present.length === 0) return null;
  const chip = (value: RoleFilter, label: string, title?: string) => (
    <button key={value} type="button" aria-pressed={roles.selected === value} title={title} onClick={() => roles.onChange(value)}
      className={`rounded border px-1.5 py-0.5 text-[10px] ${roles.selected === value ? "border-copper text-copper-bright bg-copper/10" : "border-line text-fg-muted hover:text-fg"}`}>{label}</button>
  );
  return (
    <div className="mt-2 border-t border-line pt-2" role="group" aria-label="Show sites by role" data-testid="role-filter">
      <p className="mb-1 font-semibold uppercase tracking-wide text-fg-muted">Site role</p>
      <div className="flex flex-wrap gap-1">
        {chip("all", "All")}
        {present.map((r) => chip(r, `${r} · ${roles.counts[r]}`, ROLE_HINT[r]))}
      </div>
    </div>
  );
}

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
  /** Workbook site roles: a display filter for the markers and lists (never changes a rank). */
  roles?: RoleLegend;
}

export function GlobeLegend({ config, mode = "landing", palette = "roygbiv", onPaletteChange, heading, rankedCount, roles }: GlobeLegendProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const title = mode === "analog" ? "Analog match rank" : "Mission suitability rank";
  const credit = (
    <div className="mt-2 border-t border-line pt-2 text-[10px] leading-relaxed text-fg-faint [overflow-wrap:anywhere]">
      {config.displayName} texture: {config.textureCreditUrl ? <a href={config.textureCreditUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-fg">{config.textureCredit}</a> : config.textureCredit}
    </div>
  );
  if (mode === "browse") return <div className="pointer-events-auto w-[260px] max-w-full rounded border border-line bg-bg-elev/90 px-3 py-2 text-xs text-fg-muted" data-testid="mission-sites-legend"><p className="font-semibold text-fg">{config.displayName} mission sites</p><p className="mt-1">Markers show available locations, without suitability scores. Select a site to inspect its measurements.</p>{roles && <RoleChips roles={roles} />}{credit}</div>;
  {
    return (
      <div className="pointer-events-auto w-[260px] max-w-full rounded border border-line bg-bg-elev/90 px-3 py-2 text-[10.5px] leading-relaxed text-fg-muted backdrop-blur-sm" data-testid={mode === "analog" ? "analog-legend" : mode === "mission" ? "mission-legend" : "landing-legend"}>
        <div className="mb-1 flex items-center gap-1">
          <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls={detailsId} className="flex min-h-6 min-w-0 flex-1 items-center justify-between gap-3 rounded text-left font-semibold uppercase tracking-wide text-fg-muted hover:text-fg">
            <span>{title}</span><ChevronDown aria-hidden className={`h-4 w-4 shrink-0 ${expanded ? "rotate-180" : ""}`} />
          </button>
          {mode !== "analog" && <InfoTip label="About the mission suitability rank">Colour shows relative mission rank, not safety or confidence.</InfoTip>}
        </div>
        <div data-rank-scale className="h-2 w-full rounded-full" style={{ background: rankGradient(palette) }} role="img" aria-label={`${title}: ${palette === "single_hue" ? "light to dark" : "red to violet"}, strongest to weakest`} />
        <div id={detailsId} hidden={!expanded}>
        {heading && <div className="mt-2 text-fg">{heading}</div>}
        <div className="mt-1 grid grid-cols-2 gap-3 text-[10px] leading-snug">
          <span>1 · Strongest</span>
          <span className="text-right">{rankedCount && rankedCount > 1 ? `${rankedCount} · ` : ""}Weakest</span>
        </div>
        {mode === "analog" && <p className="mt-1 leading-snug">{RANK_LEGEND_SENTENCE}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-dashed" style={{ borderColor: NOT_RANKED_COLOR }} aria-hidden /> Not ranked
          </span>
        </div>
        {onPaletteChange && (
          <label className="mt-2 flex cursor-pointer items-start gap-2 text-fg-muted">
            <input type="checkbox" checked={palette === "single_hue"} onChange={(e) => onPaletteChange(e.target.checked ? "single_hue" : "roygbiv")} className="mt-0.5 h-3 w-3 shrink-0 accent-copper-bright" />
            <span>Color Blind Mode</span>
          </label>
        )}
        {credit}
        </div>
        {roles && <RoleChips roles={roles} />}
      </div>
    );
  }
}
