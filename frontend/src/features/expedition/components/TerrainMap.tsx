// The expedition map. A georeferenced orbital mosaic (bounds from the imagery
// manifest's tile grid) is the basemap; every marker and path is positioned by
// converting its coordinate into image percentages, so what the user sees is
// aligned with what the service receives. The SVG overlay uses a 0..100
// percent viewBox with non-scaling strokes, and HTML markers keep their size
// at every zoom.
//
// Pan: drag, or arrow keys when the frame has focus. Zoom: wheel, +/- keys,
// or the buttons. In "add" mode a click (not a drag) places a waypoint; a
// waypoint can be dragged, selected and deleted (Delete key). Nothing here
// computes distance, slope or energy.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import { Crosshair, Hand, MapPin, Minus, Plus, RotateCcw } from "lucide-react";
import { imageryAssetUrl } from "@/components/imagery/assetUrl";
import { containSize } from "@/components/imagery/ZoomableImage";
import { scaleBar, relationshipLabel } from "@/lib/comparison";
import { FIT_VIEW, boundsValid, clampPan, clampZoom, formatCoordinate, frameToPct, inside, metresPerPixelFor, toGeo, toPct, zoomAt, type View } from "../lib/geo";
import { RISK_STYLE } from "../lib/risk";
import type { ExpeditionBody, GeoPoint, ResearchTarget, RouteSegment, SnappedStop, Waypoint } from "../adapter/types";
import type { Basemap } from "../hooks/useTerrainContext";
import type { MapTool } from "../store/useExpeditionStore";

const PAN_STEP = 48;
const DRAG_THRESHOLD = 4;

export interface TerrainMapProps {
  basemap: Basemap | null;
  body: ExpeditionBody;
  start: GeoPoint;
  waypoints: Waypoint[];
  selectedWaypointId: string | null;
  targets: ResearchTarget[];
  selectedTargetIds: string[];
  route: RouteSegment[] | null;
  /** Where the service snapped each requested stop (drawn as hollow rings; no connector is invented). */
  snappedStops?: SnappedStop[] | null;
  /** Change to replay the route reveal animation. */
  revealToken: number;
  tool: MapTool;
  onToolChange?: (tool: MapTool) => void;
  planning?: boolean;
  readOnly?: boolean;
  onAddWaypoint?: (p: GeoPoint) => void;
  onMoveWaypoint?: (id: string, p: GeoPoint) => void;
  onSelectWaypoint?: (id: string | null) => void;
  onRemoveWaypoint?: (id: string) => void;
  onToggleTarget?: (id: string) => void;
  className?: string;
  /** Highlights the segment a warning is about. */
  highlightedSegmentId?: string | null;
}

export function TerrainMap(p: TerrainMapProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ w: 800, h: 520 });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(p.basemap?.entry.width_px && p.basemap.entry.height_px ? { w: p.basemap.entry.width_px, h: p.basemap.entry.height_px } : null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // null = the fitted, centred view; otherwise the absolute origin of the image inside the frame
  const [userView, setUserView] = useState<View | null>(null);
  const gesture = useRef<{ x: number; y: number; view: View; moved: boolean; waypointId: string | null } | null>(null);
  const [status, setStatus] = useState<string>("");
  const entry = p.basemap?.entry ?? null;
  const bounds = entry && boundsValid(entry.bounds) ? entry.bounds : null;

  useEffect(() => { setLoaded(false); setFailed(false); setUserView(null); setNatural(entry?.width_px && entry.height_px ? { w: entry.width_px, h: entry.height_px } : null); }, [entry?.entry_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = frameRef.current; if (!el) return;
    const read = () => setFrame({ w: el.clientWidth || 800, h: el.clientHeight || 520 });
    read();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  // wheel zoom needs a non-passive listener to stop the page scrolling
  useEffect(() => {
    const el = frameRef.current; if (!el || !bounds) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setUserView(v => clampPan(zoomAt(v ?? fitView, Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top), frame, fit));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const fit = natural ? containSize(natural.w, natural.h, frame.w, frame.h) : { w: frame.w, h: frame.h };
  // the fitted view centres the image in the frame at zoom 1
  const fitView: View = { zoom: FIT_VIEW.zoom, x: (frame.w - fit.w) / 2, y: (frame.h - fit.h) / 2 };
  const view = userView ?? fitView;
  const setView = (next: View | ((v: View) => View)) => setUserView(v => (typeof next === "function" ? next(v ?? fitView) : next));
  const resetView = () => setUserView(null);
  const originX = view.x, originY = view.y;
  const imgW = fit.w * view.zoom, imgH = fit.h * view.zoom;

  const geoAt = (clientX: number, clientY: number): GeoPoint | null => {
    const el = frameRef.current; if (!el || !bounds) return null;
    const r = el.getBoundingClientRect();
    const pct = frameToPct(view, fit, clientX - r.left, clientY - r.top);
    if (pct.xPct < 0 || pct.xPct > 100 || pct.yPct < 0 || pct.yPct > 100) return null;
    return toGeo(bounds, pct);
  };

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    // `button` is undefined where PointerEvent is unavailable (treated as primary); a right or middle button never starts a gesture
    if ((e.button ?? 0) !== 0 || !bounds || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-waypoint]");
    const waypointId = target?.dataset.waypoint ?? null;
    gesture.current = { x: e.clientX, y: e.clientY, view, moved: false, waypointId: !p.readOnly && waypointId ? waypointId : null };
    frameRef.current?.setPointerCapture?.(e.pointerId);
    if (waypointId) p.onSelectWaypoint?.(waypointId);
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const g = gesture.current; if (!g || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) g.moved = true;
    if (!g.moved) return;
    if (g.waypointId) {
      const el = frameRef.current; if (!el || !bounds) return;
      const r = el.getBoundingClientRect();
      const pct = frameToPct(view, fit, e.clientX - r.left, e.clientY - r.top);
      p.onMoveWaypoint?.(g.waypointId, toGeo(bounds, pct)); // toGeo clamps to the image
    } else {
      setView(clampPan({ zoom: g.view.zoom, x: g.view.x + dx, y: g.view.y + dy }, frame, fit));
    }
  };
  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    const g = gesture.current; gesture.current = null;
    if (!g) return;
    if (g.moved) { if (g.waypointId) setStatus(`Waypoint moved to ${describeAt(g.waypointId)}`); return; }
    const el = e.target as HTMLElement;
    if (el.closest("[data-waypoint]") || el.closest("[data-target]") || el.closest("button")) return;
    if (p.readOnly) return;
    if (p.tool === "add") {
      const geo = geoAt(e.clientX, e.clientY);
      if (geo) { p.onAddWaypoint?.(geo); setStatus(`Waypoint ${p.waypoints.length + 1} added at ${formatCoordinate(geo)}`); }
    } else {
      p.onSelectWaypoint?.(null);
    }
  };
  const describeAt = (id: string) => { const w = p.waypoints.find(x => x.id === id); return w ? formatCoordinate(w) : ""; };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!bounds) return;
    const pan = (dx: number, dy: number) => setView(v => clampPan({ ...v, x: v.x + dx, y: v.y + dy }, frame, fit));
    const centreZoom = (f: number) => setView(v => clampPan(zoomAt(v, f, frame.w / 2, frame.h / 2), frame, fit));
    switch (e.key) {
      case "ArrowLeft": e.preventDefault(); pan(PAN_STEP, 0); break;
      case "ArrowRight": e.preventDefault(); pan(-PAN_STEP, 0); break;
      case "ArrowUp": e.preventDefault(); pan(0, PAN_STEP); break;
      case "ArrowDown": e.preventDefault(); pan(0, -PAN_STEP); break;
      case "+": case "=": e.preventDefault(); centreZoom(1.25); break;
      case "-": case "_": e.preventDefault(); centreZoom(0.8); break;
      case "0": e.preventDefault(); resetView(); break;
      case "Delete": case "Backspace":
        if (!p.readOnly && p.selectedWaypointId && !(e.target as HTMLElement).matches("input,textarea")) { e.preventDefault(); p.onRemoveWaypoint?.(p.selectedWaypointId); setStatus("Waypoint removed"); }
        break;
      case "Enter":
        if (!p.readOnly && p.tool === "add" && e.target === e.currentTarget) {
          e.preventDefault();
          const geo = geoAt(frameRef.current!.getBoundingClientRect().left + frame.w / 2, frameRef.current!.getBoundingClientRect().top + frame.h / 2);
          if (geo) { p.onAddWaypoint?.(geo); setStatus(`Waypoint ${p.waypoints.length + 1} added at the map centre, ${formatCoordinate(geo)}`); }
        }
        break;
    }
  };

  const mpp = bounds ? metresPerPixelFor(bounds, imgH, p.body) : null;
  const bar = scaleBar(mpp, 160);
  const hiddenTargets = bounds ? p.targets.filter(t => !inside(bounds, t)).length : 0;
  const outsideWaypoints = bounds ? p.waypoints.filter(w => !inside(bounds, w)).length : 0;

  const sequence = useMemo(() => (bounds ? [p.start, ...p.waypoints].map(pt => toPct(bounds, pt)) : []), [bounds, p.start, p.waypoints]);

  if (!entry || !bounds) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong bg-bg p-8 text-center ${p.className ?? "h-[460px]"}`} role="status">
        <MapPin className="h-6 w-6 text-fg-faint" aria-hidden />
        <p className="text-sm text-fg">No georeferenced basemap is available for this region.</p>
        <p className="max-w-md text-xs text-fg-muted">The planner only draws waypoints on images with a verified geographic extent. This way, every coordinate sent to the expedition service matches what you see. Decorative images are never used instead.</p>
      </div>
    );
  }

  const label = `Terrain map of ${entry.title}. ${p.readOnly ? "" : p.tool === "add" ? "Click to add a waypoint. Drag a waypoint to move it. Delete removes the selected one. " : "Drag to pan. "}The arrow keys pan. Plus and minus zoom. 0 fits the image. Zoom ${Math.round(view.zoom * 100)}%.`;

  return (
    <div className={`relative overflow-hidden rounded-xl border border-line-strong bg-black ${p.className ?? "h-[460px]"}`}>
      <div
        ref={frameRef}
        role="application"
        aria-label={label}
        tabIndex={0}
        data-testid="terrain-frame"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { gesture.current = null; }}
        onKeyDown={onKey}
        className={`absolute inset-0 select-none touch-none outline-none focus-visible:ring-2 focus-visible:ring-copper-bright ${p.readOnly ? "cursor-grab" : p.tool === "add" ? "cursor-crosshair" : "cursor-grab"}`}
      >
        <div className="absolute" style={{ left: originX, top: originY, width: imgW, height: imgH }} data-testid="map-image-box">
          {failed ? (
            <div role="alert" className="flex h-full w-full items-center justify-center bg-bg-elev p-6 text-sm text-fg">
              <span>The basemap image could not be loaded.</span>
              <button type="button" className="ml-3 text-info underline" onClick={() => { setFailed(false); setLoaded(false); setAttempt(n => n + 1); }}>Retry</button>
            </div>
          ) : (
            <img
              key={`${entry.entry_id}:${attempt}`}
              src={imageryAssetUrl(entry.entry_id, attempt)}
              alt={`${entry.title}. ${entry.relevance}`}
              draggable={false}
              className={`block h-full w-full object-fill transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
              onLoad={e => { setLoaded(true); const im = e.currentTarget; if (im.naturalWidth && im.naturalHeight) setNatural({ w: im.naturalWidth, h: im.naturalHeight }); }}
              onError={() => setFailed(true)}
            />
          )}
          {!loaded && !failed && <p role="status" className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs text-fg-muted">Loading basemap…</p>}

          {/* The overlay's user unit is one CSS pixel of the image box at the current zoom, so
              stroke widths and dash patterns are in px and pathLength-normalised dashes behave. */}
          <svg className="pointer-events-none absolute inset-0 overflow-visible" width="100%" height="100%" viewBox={`0 0 ${Math.max(1, imgW)} ${Math.max(1, imgH)}`} preserveAspectRatio="none" aria-hidden>
            {sequence.length > 1 && (
              <polyline points={sequence.map(s => `${(s.xPct / 100) * imgW},${(s.yPct / 100) * imgH}`).join(" ")} fill="none" stroke="rgba(230,233,238,0.55)" strokeWidth={1.25} strokeDasharray="3 5" data-testid="sequence-line" />
            )}
            {p.route && (
              <g key={p.revealToken} data-testid="route-group">
                {p.route.map((seg, i) => {
                  // a leg whose stops share one grid cell has no geometry: nothing is drawn for it (never a straight connector)
                  if (seg.polyline.length < 2) return null;
                  const pts = seg.polyline.map(pt => { const c = toPct(bounds, pt); return { x: (c.xPct / 100) * imgW, y: (c.yPct / 100) * imgH }; });
                  const d = pts.map((pt, k) => `${k === 0 ? "M" : "L"}${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(" ");
                  const style = RISK_STYLE[seg.risk] ?? RISK_STYLE.unknown;
                  const hot = p.highlightedSegmentId === seg.segment_id;
                  const reveal = style.dashed ? "route-fade" : "route-reveal";
                  return (
                    <g key={seg.segment_id}>
                      <path d={d} fill="none" stroke="rgba(0,0,0,0.65)" strokeWidth={hot ? 9 : 7} strokeLinecap="round" strokeLinejoin="round" pathLength={style.dashed ? undefined : 1} className={reveal} style={{ animationDelay: `${i * 0.12}s` }} />
                      <path d={d} fill="none" stroke={style.stroke} strokeWidth={hot ? 5 : 3.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={style.dashed ? "7 6" : undefined} pathLength={style.dashed ? undefined : 1} className={reveal} style={{ animationDelay: `${i * 0.12}s` }} data-testid={`route-segment-${seg.risk}`} />
                    </g>
                  );
                })}
              </g>
            )}
          </svg>

          {/* targets */}
          {p.targets.filter(t => inside(bounds, t)).map(t => {
            const pos = toPct(bounds, t); const on = p.selectedTargetIds.includes(t.target_id);
            return (
              <button
                key={t.target_id} type="button" data-target={t.target_id}
                onClick={() => !p.readOnly && p.onToggleTarget?.(t.target_id)}
                disabled={p.readOnly}
                aria-pressed={on}
                aria-label={`Research target ${t.name}${on ? ", selected" : ""}. ${formatCoordinate(t)}`}
                title={`${t.name}${t.description ? ` — ${t.description}` : ""}`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-[2px] border-2 transition-transform ${on ? "h-4 w-4 rotate-45 border-white bg-info shadow-[0_0_0_3px_rgba(110,160,217,.35)]" : "h-3.5 w-3.5 rotate-45 border-info bg-info/30 hover:scale-125"}`}
                style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%` }}
              />
            );
          })}

          {/* snapped stops (service grid-cell centres) */}
          {(p.snappedStops ?? []).filter(s => s.snapped && inside(bounds, s.snapped)).map(s => {
            const pos = toPct(bounds, s.snapped!);
            const offset = s.offset_m == null ? "" : s.offset_m >= 1000 ? `${(s.offset_m / 1000).toFixed(1)} km` : `${Math.round(s.offset_m)} m`;
            return (
              <span key={`snap-${s.stop_id}`} role="img" data-testid="snapped-stop" aria-label={`${s.stop_id} snapped to ${formatCoordinate(s.snapped!)}${offset ? `, ${offset} from the requested point` : ""}${s.visited ? "" : ", not visited"}`} title={`${s.stop_id} snapped ${offset || "to a grid cell centre"}`}
                className={`absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed ${s.visited ? "border-fg/80" : "border-warn"} bg-transparent shadow-[0_0_0_1px_rgba(0,0,0,.6)]`}
                style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%` }} />
            );
          })}

          {/* start */}
          {inside(bounds, p.start) && (() => { const pos = toPct(bounds, p.start); return (
            <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%` }} role="img" aria-label={`Expedition start, ${formatCoordinate(p.start)}`} data-testid="start-marker">
              <span className="pulse-ring absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fg/60" aria-hidden />
              <span className="block h-4 w-4 rounded-full border-2 border-white bg-fg shadow-[0_0_0_2px_rgba(0,0,0,.7)]" />
              <span className="absolute left-3 top-3 whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fg">Start</span>
            </div>
          ); })()}

          {/* waypoints */}
          {p.waypoints.map((w, i) => {
            if (!inside(bounds, w)) return null;
            const pos = toPct(bounds, w); const sel = w.id === p.selectedWaypointId;
            return (
              <button
                key={w.id} type="button" data-waypoint={w.id}
                aria-label={`Waypoint ${i + 1}, ${formatCoordinate(w)}${sel ? ", selected" : ""}`}
                aria-pressed={sel}
                onClick={() => p.onSelectWaypoint?.(w.id)}
                onKeyDown={e => { if ((e.key === "Delete" || e.key === "Backspace") && !p.readOnly) { e.preventDefault(); e.stopPropagation(); p.onRemoveWaypoint?.(w.id); } }}
                className={`num absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[11px] font-semibold text-white shadow-[0_0_0_2px_rgba(0,0,0,.7)] transition-transform ${p.readOnly ? "" : "cursor-move"} ${sel ? "scale-110 border-white bg-copper-bright ring-4 ring-copper-bright/30" : "border-white/80 bg-copper hover:scale-110"}`}
                style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%` }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        {p.planning && (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/60 via-transparent to-transparent pb-14" role="status" aria-live="polite" data-testid="map-planning">
            <div className="scan-line absolute inset-x-0 h-px bg-copper-bright/70" aria-hidden />
            <span className="rounded-full border border-copper/60 bg-black/70 px-3 py-1.5 text-xs text-copper-bright">Computing route with the expedition service…</span>
          </div>
        )}
      </div>

      {/* controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5" role="group" aria-label="Map controls">
        <button type="button" aria-label="Zoom in" onClick={() => setView(v => clampPan(zoomAt(v, 1.25, frame.w / 2, frame.h / 2), frame, fit))} className="map-btn"><Plus className="h-4 w-4" aria-hidden /></button>
        <button type="button" aria-label="Zoom out" onClick={() => setView(v => clampPan(zoomAt(v, 0.8, frame.w / 2, frame.h / 2), frame, fit))} className="map-btn"><Minus className="h-4 w-4" aria-hidden /></button>
        <button type="button" aria-label="Reset view" onClick={resetView} className="map-btn"><RotateCcw className="h-4 w-4" aria-hidden /></button>
        {!p.readOnly && p.onToolChange && (
          <div className="mt-1 flex flex-col gap-1.5" role="radiogroup" aria-label="Map tool">
            <button type="button" role="radio" aria-checked={p.tool === "add"} aria-label="Add waypoints" title="Add waypoints (click the map)" onClick={() => p.onToolChange?.("add")} className={`map-btn ${p.tool === "add" ? "map-btn-on" : ""}`}><Crosshair className="h-4 w-4" aria-hidden /></button>
            <button type="button" role="radio" aria-checked={p.tool === "pan"} aria-label="Pan the map" title="Pan (drag the map)" onClick={() => p.onToolChange?.("pan")} className={`map-btn ${p.tool === "pan" ? "map-btn-on" : ""}`}><Hand className="h-4 w-4" aria-hidden /></button>
          </div>
        )}
      </div>

      {/* zoom readout + status */}
      <div className="absolute left-3 top-3 flex items-center gap-2">
        <span className="num rounded-full border border-line-strong bg-black/70 px-2 py-0.5 text-[11px] text-fg" aria-live="polite">{Math.round(view.zoom * 100)}%</span>
        {!p.readOnly && <span className="rounded-full border border-line-strong bg-black/70 px-2 py-0.5 text-[11px] text-fg-muted">{p.tool === "add" ? "Click to place a waypoint" : "Drag to pan"}</span>}
      </div>
      <p className="sr-only" role="status" aria-live="polite">{status}</p>

      {/* legend + scale */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col items-start gap-1.5">
        {p.route && p.route.length > 0 && (
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded bg-black/70 px-2 py-1 text-[10.5px] text-fg" aria-label="Route risk legend">
            {(["low", "moderate", "high", "unknown"] as const).filter(r => p.route!.some(s => s.risk === r)).map(r => (
              <li key={r} className="flex items-center gap-1.5"><span className="inline-block h-1 w-5 rounded-full" style={{ background: RISK_STYLE[r].stroke, opacity: r === "unknown" ? 0.7 : 1 }} aria-hidden />{RISK_STYLE[r].label}</li>
            ))}
          </ul>
        )}
        {p.waypoints.length > 0 && !p.route && <span className="rounded bg-black/70 px-2 py-1 text-[10.5px] text-fg-muted">Dashed line: stop order only. This is not a calculated route.</span>}
        {(p.snappedStops ?? []).some(s => s.snapped) && <span className="flex items-center gap-1.5 rounded bg-black/70 px-2 py-1 text-[10.5px] text-fg-muted"><span className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-fg/80" aria-hidden />Dashed ring: the grid cell the service moved a stop to</span>}
        {bar && (
          <div className="rounded bg-black/70 px-2 py-1 text-[11px] text-white" data-testid="map-scale-bar" aria-label={`Scale bar: ${bar.label}`}>
            <div className="h-1.5 border-x-2 border-b-2 border-white" style={{ width: `${Math.round(bar.px)}px` }} aria-hidden />
            <div className="num mt-0.5">{bar.label}</div>
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 max-w-[60%] truncate rounded bg-black/70 px-2 py-1 text-right text-[10.5px] text-fg-muted">
        {entry.credit} · {relationshipLabel(entry)}{p.basemap?.resolution ? ` · ${p.basemap.resolution.toFixed(0)} m/px source` : ""}
      </div>
      {(hiddenTargets > 0 || outsideWaypoints > 0) && (
        <p className="absolute left-1/2 top-3 -translate-x-1/2 rounded bg-black/70 px-2 py-0.5 text-[10.5px] text-warn" role="status">
          {hiddenTargets > 0 && `${hiddenTargets} target${hiddenTargets > 1 ? "s" : ""} outside this basemap`}{hiddenTargets > 0 && outsideWaypoints > 0 && " · "}{outsideWaypoints > 0 && `${outsideWaypoints} waypoint${outsideWaypoints > 1 ? "s" : ""} outside this basemap`}
        </p>
      )}
    </div>
  );
}

export { clampZoom };
