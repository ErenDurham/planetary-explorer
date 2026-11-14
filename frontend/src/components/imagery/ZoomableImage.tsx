// The image frame shared by the Compare panes and the expand dialog. The image
// is sized in JS (contain-fit at zoom 1, then scaled) so it is never stretched
// or cropped and so overlays and the scale bar know its exact rendered size.
// Pan = scroll the frame (mouse drag, arrow keys when focused); zoom = buttons
// or +/-/0 keys. Nothing animates, so reduced-motion needs no special case.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { GeoOverlay } from "@/components/imagery/GeoOverlay";
import { imageryAssetUrl } from "@/components/imagery/assetUrl";
import { isGeoreferenced } from "@/lib/comparison";
import type { Body } from "@/lib/analogFeatures";
import type { ImageryEntry } from "@/types";

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;
export const ZOOM_STEP = 0.5;

export interface GeoContext { body: Body; lat: number; lonEast: number; halfWidthDeg: number }

/** Largest w×h with the image's aspect that fits inside maxW×maxH. */
export function containSize(natW: number, natH: number, maxW: number, maxH: number): { w: number; h: number } {
  if (!(natW > 0) || !(natH > 0) || !(maxW > 0) || !(maxH > 0)) return { w: maxW, h: maxH };
  const r = Math.min(maxW / natW, maxH / natH);
  return { w: natW * r, h: natH * r };
}

export function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100));
}

export function ZoomableImage({ entry, geo, zoom, onZoom, frameClassName = "h-[340px]", onFitHeight, ariaLabel, frameId }: {
  entry: ImageryEntry;
  /** Georeferencing context; overlays render only when the entry has bounds. */
  geo: GeoContext | null;
  zoom: number;
  onZoom: (z: number) => void;
  frameClassName?: string;
  /** Rendered image height at zoom 1, for metres-per-pixel linking. */
  onFitHeight?: (h: number | null) => void;
  ariaLabel: string;
  frameId?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 640, h: 340 });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(entry.width_px && entry.height_px ? { w: entry.width_px, h: entry.height_px } : null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const read = () => setViewport({ w: el.clientWidth || 640, h: el.clientHeight || 340 });
    read();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const fit = natural ? containSize(natural.w, natural.h, viewport.w, viewport.h) : { w: viewport.w, h: viewport.h };
  const size = { w: fit.w * zoom, h: fit.h * zoom };
  useEffect(() => { onFitHeight?.(natural ? fit.h : null); }, [natural, fit.h, onFitHeight]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "+" || e.key === "=") { e.preventDefault(); onZoom(clampZoom(zoom + ZOOM_STEP)); }
    else if (e.key === "-" || e.key === "_") { e.preventDefault(); onZoom(clampZoom(zoom - ZOOM_STEP)); }
    else if (e.key === "0" || e.key.toLowerCase() === "f") { e.preventDefault(); onZoom(1); }
    // arrow keys scroll the focused frame natively (pan)
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = frameRef.current; if (!el || e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = frameRef.current; const d = drag.current; if (!el || !d) return;
    el.scrollLeft = d.left - (e.clientX - d.x); el.scrollTop = d.top - (e.clientY - d.y);
  };
  const endDrag = () => { drag.current = null; };

  const georef = isGeoreferenced(entry) && geo;
  return (
    <div>
      {failed ? (
        <div role="alert" className={`flex ${frameClassName} items-center justify-center rounded border border-line bg-black/60 p-4 text-sm text-fg`}>
          <span>Image could not be loaded.</span>
          <button type="button" className="ml-3 text-info underline" onClick={() => { setFailed(false); setLoaded(false); setAttempt(n => n + 1); }}>Retry image</button>
        </div>
      ) : (
        <div
          id={frameId}
          ref={frameRef}
          tabIndex={0}
          role="group"
          aria-label={`${ariaLabel}. Zoom ${Math.round(zoom * 100)}%. Plus and minus zoom, 0 fits, arrow keys pan.`}
          onKeyDown={onKey}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`scroll-thin relative ${frameClassName} w-full overflow-auto rounded border border-line bg-black ${zoom > 1 ? "cursor-grab" : ""}`}
        >
          <div className="flex min-h-full min-w-full items-center justify-center" style={{ width: size.w > viewport.w ? size.w : undefined, height: size.h > viewport.h ? size.h : undefined }}>
            <div className="relative shrink-0" style={{ width: size.w, height: size.h }} data-testid="image-box">
              {!loaded && <p role="status" className="absolute inset-x-0 top-2 text-center text-xs text-fg-muted">Loading image…</p>}
              <img
                key={`${entry.entry_id}:${attempt}`}
                src={imageryAssetUrl(entry.entry_id, attempt)}
                alt={`${entry.title}. ${entry.relevance}`}
                className="block h-full w-full select-none object-contain"
                draggable={false}
                onLoad={e => { setLoaded(true); const im = e.currentTarget; if (im.naturalWidth && im.naturalHeight) setNatural({ w: im.naturalWidth, h: im.naturalHeight }); }}
                onError={() => setFailed(true)}
              />
              {georef && <GeoOverlay bounds={entry.bounds} body={geo.body} lat={geo.lat} lonEast={geo.lonEast} halfWidthDeg={geo.halfWidthDeg} renderedHeightPx={size.h} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ZoomControls({ zoom, onZoom, idPrefix, extra }: { zoom: number; onZoom: (z: number) => void; idPrefix: string; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label="Zoom controls">
      <button type="button" aria-label="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => onZoom(clampZoom(zoom - ZOOM_STEP))} className="rounded border border-line px-2.5 py-1.5 disabled:opacity-40">−</button>
      <span className="num w-11 text-center" id={`${idPrefix}-zoom`} aria-live="polite">{Math.round(zoom * 100)}%</span>
      <button type="button" aria-label="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => onZoom(clampZoom(zoom + ZOOM_STEP))} className="rounded border border-line px-2.5 py-1.5 disabled:opacity-40">+</button>
      <button type="button" onClick={() => onZoom(1)} className="rounded border border-line px-2.5 py-1.5">Fit</button>
      {extra}
    </div>
  );
}
