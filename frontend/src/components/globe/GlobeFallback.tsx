// What a device without WebGL (or one whose context failed) gets instead of a
// blank canvas: the same equirectangular texture as a flat map with the
// markers placed by their coordinates, the same legend, and a sentence saying
// why. Everything the globe says is still said; only the sphere is missing.
import { Component, type ErrorInfo, type ReactNode } from "react";
import type { PlanetConfig } from "./PlanetConfig";
import type { MarkerDatum } from "./MarkerData";

export function GlobeFallback({ config, markers, selectedId, onSelect, reason, legend }: { config: PlanetConfig; markers: MarkerDatum[]; selectedId: string | null; onSelect: (id: string) => void; reason: string; legend?: ReactNode }) {
  return (
    <div className="relative h-full w-full min-h-[320px] overflow-hidden bg-canvas" data-testid="globe-fallback" role="region" aria-label={`${config.displayName} map (WebGL unavailable)`}>
      <div className="absolute inset-x-0 top-0 z-10 border-b border-line bg-bg-elev/90 px-3 py-2 text-xs text-fg-muted" role="status">{reason} Showing {config.displayName} as a flat map; every location is still marked at its coordinates.</div>
      <div className="relative mx-auto mt-12 aspect-[2/1] w-full max-w-5xl">
        <img src={config.textureUrl} alt={`${config.displayName}: ${config.textureNote}`} className="h-full w-full object-cover" />
        {markers.map(m => {
          const x = ((m.lonEast + 180) / 360) * 100, y = ((90 - m.lat) / 180) * 100;
          const selected = m.id === selectedId;
          return (
            <button key={m.id} type="button" onClick={() => onSelect(m.id)} aria-pressed={selected} title={m.name} aria-label={`${m.name}${m.rank != null ? `, rank ${m.rank}` : ""}`} className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${selected ? "h-5 w-5 border-white" : "h-3.5 w-3.5 border-black/60"}`} style={{ left: `${x}%`, top: `${y}%`, background: m.appearance.color }} />
          );
        })}
      </div>
      <p className="px-3 pt-2 text-[10.5px] text-fg-faint">{config.textureCredit}</p>
      {legend && <div className="pointer-events-none absolute bottom-3 left-3">{legend}</div>}
    </div>
  );
}

/** Catches a renderer that fails after mounting (context lost, shader
 * compile) and shows the fallback instead of unmounting the whole page. */
export class GlobeErrorBoundary extends Component<{ fallback: (error: Error) => ReactNode; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Globe renderer failed", error, info.componentStack); }
  render() { return this.state.error ? this.props.fallback(this.state.error) : this.props.children; }
}
