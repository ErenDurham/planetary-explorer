// Centre column of Find Earth Analogs: the same chrome as Browse Regions
// (mode switch, a sentence saying where you are, a view toggle, the Edit
// mission link), then a facts bar about the survey, then the globe or the
// schematic survey map. It is a layout shell; DiscoveryView supplies every
// value so nothing here can invent one.
import { useState, type ReactNode } from "react";
import { Globe2, Map as MapIcon } from "lucide-react";
import { ExploreModeSwitch } from "./ExploreModeSwitch";
import type { DiscoveryMapView } from "../store/useDiscoveryStore";

export function DiscoveryStage({ badge, title, lede, stats, facts, view, onView, viewEnabled, mobile, caption, children }: {
  badge: ReactNode;
  title: string;
  lede: string;
  /** The headline counts strip, or null while there is nothing to count. */
  stats: ReactNode;
  /** Survey facts: which survey, where, the reference, the established-analog link. */
  facts: ReactNode;
  view: DiscoveryMapView;
  onView: (v: DiscoveryMapView) => void;
  viewEnabled: boolean;
  /** Narrow screens: a selector standing in for the hidden left list. */
  mobile?: ReactNode;
  /** What the current view draws; kept in the facts bar so the Astro overlay never covers it. */
  caption?: ReactNode;
  children: ReactNode;
}) {
  // phones: the list and the evidence come first; the map is one tap away
  const [mapOnPhone, setMapOnPhone] = useState(false);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav aria-label="Explore views" className="shrink-0 border-b border-line bg-bg-elev px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><ExploreModeSwitch />{badge}</div>
        <h2 className="mt-2 text-base font-semibold tracking-tight text-fg">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">{lede}</p>
        {stats}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Map view" className="flex gap-1 text-xs">
            {(["globe", "map"] as const).map(v => (
              <button key={v} type="button" aria-pressed={view === v} disabled={!viewEnabled} onClick={() => onView(v)} className={`inline-flex items-center gap-1 rounded border px-2.5 py-1.5 disabled:opacity-40 ${view === v ? "border-copper bg-copper/10 text-copper-bright" : "border-transparent text-fg-muted hover:text-fg"}`}>
                {v === "map" ? <MapIcon className="h-3.5 w-3.5" aria-hidden /> : <Globe2 className="h-3.5 w-3.5" aria-hidden />}{v === "map" ? "Survey map" : "Globe"}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setMapOnPhone(v => !v)} aria-expanded={mapOnPhone} aria-controls="discovery-stage-body" className="rounded border border-line-strong px-2.5 py-1.5 text-xs text-fg lg:hidden" data-testid="phone-map-toggle">{mapOnPhone ? "Hide map" : "Show map"}</button>
          {mobile}
        </div>
      </nav>
      {(facts || caption) && <div className="hidden shrink-0 border-b border-line px-3 py-2 text-xs lg:block" data-testid="survey-context">{facts}{caption && <p className="mt-1 text-[10.5px] leading-relaxed text-fg-faint">{caption}</p>}</div>}
      <div id="discovery-stage-body" className={`relative min-h-0 flex-1 ${mapOnPhone ? "h-[60vh]" : "hidden"} lg:block lg:h-auto`}>{children}</div>
    </div>
  );
}
