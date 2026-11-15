// One of the two aligned Compare panes. Owns nothing persistent: the chosen
// entry and zoom per location+view live in CompareView so they survive a
// switch between orbital and field views. The <img> is keyed by entry id and
// the whole pane by location id, so a new location never shows the previous
// location's photo under its label. Field photos are real photographs only
// (view "surface"); orbital entries carry a footprint and scale bar only when
// the manifest gives bounds.
import { useId, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { ExpandDialog } from "@/components/imagery/ExpandDialog";
import { ZoomControls, ZoomableImage, type GeoContext } from "@/components/imagery/ZoomableImage";
import { BODY_COLOR } from "@/components/imagery/assetUrl";
import { coverageKind, isGeoreferenced, relationshipLabel } from "@/lib/comparison";
import { BODY_NAME, type Body } from "@/lib/analogFeatures";
import type { PaneImagery } from "@/hooks/usePairImagery";
import type { ImageryEntry } from "@/types";

export type PaneView = "orbital" | "surface";
export const VIEW_LABEL: Record<PaneView, string> = { orbital: "Orbital view", surface: "Field photos" };

export interface PaneLocation { body: Body; id: string; name: string; lat: number; lonEast: number; halfWidthDeg: number }

export function entriesFor(data: PaneImagery["data"], view: PaneView): ImageryEntry[] {
  return data?.entries.filter(e => e.view === view) ?? [];
}

export function ImagePane({ roleLabel, location, imagery, view, sharedView, onOverrideView, entryId, onEntryChange, zoom, onZoomChange, onFitHeight, linkNote }: {
  roleLabel: string;
  location: PaneLocation | null;
  imagery: PaneImagery;
  /** The view this pane shows (the shared control, or a per-pane override when that view has nothing). */
  view: PaneView;
  sharedView: PaneView;
  onOverrideView: (view: PaneView | null) => void;
  entryId: string | null;
  onEntryChange: (entryId: string) => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  onFitHeight: (h: number | null) => void;
  /** Shown under the zoom controls while scales are linked. */
  linkNote?: string | null;
}) {
  const uid = useId();
  const [expanded, setExpanded] = useState(false);
  const body = location?.body ?? imagery.body;
  const entries = entriesFor(imagery.data, view);
  const entry = entries.find(e => e.entry_id === entryId) ?? entries[0] ?? null;
  const index = entry ? entries.indexOf(entry) : -1;
  const go = (step: number) => { const next = entries[(index + step + entries.length) % entries.length]; if (next) onEntryChange(next.entry_id); };
  const otherView: PaneView = view === "orbital" ? "surface" : "orbital";
  const otherCount = entriesFor(imagery.data, otherView).length;
  const geo: GeoContext | null = location ? { body: location.body, lat: location.lat, lonEast: location.lonEast, halfWidthDeg: location.halfWidthDeg } : null;
  const title = location?.name ?? `No ${BODY_NAME[body]} location`;

  return (
    <section aria-label={`${roleLabel}: ${title}, ${VIEW_LABEL[view].toLowerCase()}`} data-testid={`pane-${body}`} className="flex min-w-0 flex-col rounded border border-line bg-bg-elev" style={{ borderTop: `3px solid ${BODY_COLOR[body]}` }}>
      <header className="sticky top-0 z-[2] flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line bg-bg-elev px-3 py-2">
        <div className="min-w-0">
          <div className="text-[10.5px] uppercase tracking-[0.12em]" style={{ color: BODY_COLOR[body] }}>{roleLabel}</div>
          <h3 className="truncate text-sm font-semibold text-fg">{title}</h3>
        </div>
        <span className="text-xs text-fg-muted">{VIEW_LABEL[view]}{view !== sharedView && <span className="ml-1 text-fg-faint">(this pane only)</span>}</span>
      </header>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {!location && <p className="text-sm text-fg-muted">Choose a {BODY_NAME[body]} location above.</p>}
        {location && imagery.status === "loading" && <div role="status" className="flex h-[340px] items-center justify-center rounded border border-line bg-black/40 text-sm text-fg-muted">Loading {BODY_NAME[body]} imagery…</div>}
        {location && imagery.status === "error" && (
          <div className="flex h-[340px] flex-col items-start justify-center gap-3 rounded border border-line bg-black/40 p-4">
            <ErrorNote error={imagery.error} context={`sites/${location.id}/imagery`} />
            <button type="button" onClick={imagery.refetch} className="rounded border border-line px-3 py-2 text-sm text-fg">Retry {BODY_NAME[body]} imagery</button>
          </div>
        )}
        {location && imagery.status === "unavailable" && (
          <div role="status" className="flex h-[340px] flex-col items-start justify-center gap-2 rounded border border-dashed border-line bg-black/40 p-4 text-sm">
            <p className="font-medium text-fg">{BODY_NAME[body]} imagery unavailable for {location.name}</p>
            <p className="text-fg-muted">{imagery.reason}</p>
            <button type="button" onClick={imagery.refetch} className="mt-1 rounded border border-line px-3 py-2 text-sm text-fg">Retry {BODY_NAME[body]} imagery</button>
          </div>
        )}
        {location && imagery.status === "ready" && !entry && (
          <div role="status" className="flex h-[340px] flex-col items-start justify-center gap-2 rounded border border-dashed border-line bg-black/40 p-4 text-sm">
            <p className="font-medium text-fg">No {view === "surface" ? "field photographs" : "orbital imagery"} for {location.name}</p>
            {imagery.data?.notes?.map(n => <p key={n} className="text-fg-muted">{n}</p>)}
            {!imagery.data?.notes?.length && <p className="text-fg-muted">No verified {view === "surface" ? "photograph from the ground" : "orbital product"} is recorded in the manifest for this location.</p>}
            {otherCount > 0 && <button type="button" onClick={() => onOverrideView(otherView)} className="mt-1 rounded border border-line px-3 py-2 text-sm text-fg">Show {VIEW_LABEL[otherView].toLowerCase()} for this location instead</button>}
          </div>
        )}
        {location && imagery.status === "ready" && entry && (
          <>
            <p className="text-xs text-fg" data-testid="compare-image-title">{coverageKind(entry) === "regional" ? "Regional · " : "Exact site · "}{entry.title}{entries.length > 1 && <span className="num ml-2 text-fg-muted">{index + 1} of {entries.length}</span>}</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ZoomControls zoom={zoom} onZoom={onZoomChange} idPrefix={uid} />
              <div className="flex items-center gap-2">
                {view !== sharedView && <button type="button" onClick={() => onOverrideView(null)} className="text-xs text-fg-muted underline underline-offset-4">Back to {VIEW_LABEL[sharedView].toLowerCase()}</button>}
                <button type="button" onClick={() => setExpanded(true)} className="inline-flex items-center gap-1 rounded border border-line px-2.5 py-1.5 text-xs text-fg" aria-label={`Expand ${location.name} image`}><Maximize2 className="h-3.5 w-3.5" aria-hidden /> Expand</button>
              </div>
            </div>
            {linkNote && <p className="text-[11px] text-fg-muted">{linkNote}</p>}
            <div className="relative">
              <ZoomableImage key={`${location.id}:${entry.entry_id}`} entry={entry} geo={geo} zoom={zoom} onZoom={onZoomChange} onFitHeight={onFitHeight} ariaLabel={`${VIEW_LABEL[view]} of ${location.name}`} />
              {entries.length > 1 && <>
                <button type="button" onClick={() => go(-1)} aria-label={`Previous ${VIEW_LABEL[view].toLowerCase()} image for ${location.name}`} className="absolute left-2 top-1/2 z-[3] -translate-y-1/2 rounded-full border border-line-strong bg-bg/85 p-2 text-fg shadow-lg backdrop-blur-sm hover:border-copper hover:text-copper-bright"><ChevronLeft className="h-5 w-5" aria-hidden /></button>
                <button type="button" onClick={() => go(1)} aria-label={`Next ${VIEW_LABEL[view].toLowerCase()} image for ${location.name}`} className="absolute right-2 top-1/2 z-[3] -translate-y-1/2 rounded-full border border-line-strong bg-bg/85 p-2 text-fg shadow-lg backdrop-blur-sm hover:border-copper hover:text-copper-bright"><ChevronRight className="h-5 w-5" aria-hidden /></button>
              </>}
            </div>
            <p className="text-xs text-fg-muted">
              <span className="text-fg">{location.name}</span> · {VIEW_LABEL[view]} · <span className={coverageKind(entry) === "regional" ? "text-warn" : "text-ok"}>{coverageKind(entry) === "regional" ? "Regional context" : "Exact-site imagery"}</span> · Credit: {entry.credit}
            </p>
            {view === "orbital" && !isGeoreferenced(entry) && <p className="text-[11px] text-fg-faint" data-testid="no-georef">No georeferencing for this image: no footprint, marker or scale bar can be drawn.</p>}
            {isGeoreferenced(entry) && <p className="text-[11px] text-fg-faint">Dot: selected coordinate. Dashed square: ±{location.halfWidthDeg}° analysis footprint, not a landing ellipse. Scale bar from the image bounds.</p>}
            <p className="text-xs leading-relaxed text-fg">{entry.relevance}</p>
            <details className="rounded border border-line p-2 text-xs text-fg-muted">
              <summary className="cursor-pointer">Image details: dates, coverage, resolution, source</summary>
              <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1">
                <dt className="text-fg-faint">Title</dt><dd className="text-fg">{entry.title}</dd>
                <dt className="text-fg-faint">Acquired</dt><dd>{entry.acquisition_date ? <span className="num text-fg">{entry.acquisition_date}</span> : <span>Not verified as a single date</span>}{entry.acquisition_note && <span className="block">{entry.acquisition_note}</span>}</dd>
                <dt className="text-fg-faint">Published</dt><dd>{entry.release_date ? <span className="num">{entry.release_date}</span> : "Not stated by the source"} <span className="text-fg-faint">(publication date, not acquisition)</span></dd>
                <dt className="text-fg-faint">Coverage</dt><dd>{relationshipLabel(entry)}<span className="block">{entry.coverage_evidence}</span></dd>
                <dt className="text-fg-faint">Resolution</dt><dd>{entry.spatial_resolution_m_per_px != null ? <span className="num text-fg">{entry.spatial_resolution_m_per_px} m/pixel</span> : "Not verified"}{entry.resolution_note && <span className="block">{entry.resolution_note}</span>}</dd>
                {entry.bounds && <><dt className="text-fg-faint">Bounds</dt><dd className="num">{entry.bounds.south.toFixed(3)}°–{entry.bounds.north.toFixed(3)}° lat, {entry.bounds.west.toFixed(3)}°–{entry.bounds.east.toFixed(3)}° lon E <span className="text-fg-faint">({entry.bounds.source})</span></dd></>}
                {entry.appearance_note && <><dt className="text-fg-faint">Appearance</dt><dd>{entry.appearance_note}</dd></>}
                <dt className="text-fg-faint">Instrument</dt><dd>{[entry.instrument, entry.mission].filter(Boolean).join(" · ") || "Not stated"}</dd>
                <dt className="text-fg-faint">Credit</dt><dd>{entry.credit} · {entry.institution}</dd>
                <dt className="text-fg-faint">Licence</dt><dd>{entry.license}</dd>
                <dt className="text-fg-faint">Source</dt><dd><a href={entry.source_page_url} target="_blank" rel="noreferrer" className="text-info underline underline-offset-4">Open source page ↗<span className="sr-only"> for {entry.title}</span></a> · verified {entry.verified_on}</dd>
              </dl>
            </details>
          </>
        )}
      </div>
      {expanded && entry && location && <ExpandDialog entry={entry} geo={geo} locationName={location.name} onClose={() => setExpanded(false)} />}
    </section>
  );
}
