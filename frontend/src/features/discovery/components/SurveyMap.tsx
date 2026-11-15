// Schematic survey map. Everything drawn is a server-provided coordinate: the
// surveyed boundary, the exact sampling centres (actual coverage), each
// candidate's footprint polygon and the established-catalog sites that fall in
// view. There is no imagery under it, and it says so; footprints are coloured
// by display rank only. A click on empty map drops the user's pin (a drag moves
// it); footprints keep their own click, so the two never compete.
import { useMemo, useRef, useState, useLayoutEffect, type PointerEvent as RPointerEvent } from "react";
import { NOT_RANKED_COLOR, rankColor, rankPosition, RANK_LEGEND_SENTENCE, type RankPalette } from "@/lib/rankColor";
import type { EarthSite } from "@/hooks/useEarthSites";
import { boundsPath, footprintRings, formatPoint, makeFrame, padBounds, project, pxPerKm, readSamplingCentre, ringPath, ringsBounds, unionBounds, unproject, type Frame } from "../lib/geo";
import { PIN_COLOR } from "../lib/globeOverlays";
import type { PinPoint } from "../hooks/useDiscoveryProbe";
import type { DiscoveryCandidate, DiscoveryRunSummary, DiscoverySurvey } from "../adapter";

/** Pointer travel under which a press counts as a click, not a drag. */
const DRAG_THRESHOLD = 4;

export function SurveyMap({ run, survey, candidates, selectedId, onSelect, established = [], palette = "roygbiv", className = "h-[420px]", pin = null, onPin, pinFootprint = null }: {
  run: DiscoveryRunSummary; survey: DiscoverySurvey | null; candidates: DiscoveryCandidate[]; selectedId: string | null; onSelect: (id: string) => void; established?: EarthSite[]; palette?: RankPalette; className?: string;
  /** The user's dropped pin, if any. */
  pin?: PinPoint | null;
  /** Place (click on empty map), move (drag the pin) or clear. Absent: the map is not pin-interactive. */
  onPin?: (pin: PinPoint) => void;
  /** The service's measured footprint for the pin, drawn once it exists. */
  pinFootprint?: Record<string, unknown> | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; moved: boolean; dragging: boolean } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 420 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const read = () => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 420 });
    read();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null; ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const rings = useMemo(() => candidates.map(c => ({ id: c.id, rings: footprintRings(c.footprint_geojson) })), [candidates]);
  const extent = useMemo(() => padBounds(unionBounds([run.bounds, ...rings.map(r => ringsBounds(r.rings))]) ?? run.bounds, 0.06), [run.bounds, rings]);
  const frame: Frame = useMemo(() => makeFrame(extent, size.w, size.h), [extent, size]);
  const centres = useMemo(() => (survey?.sampling_centres ?? []).map(readSamplingCentre).filter((c): c is NonNullable<typeof c> => !!c), [survey]);
  const inView = (lat: number, lon: number) => lat >= extent.south && lat <= extent.north && lon >= extent.west && lon <= extent.east;
  const known = established.filter(s => inView(s.lat, s.lonEast));
  const n = candidates.length;
  const kmPx = pxPerKm(frame);
  const barKm = [10, 20, 50, 100].find(k => k * kmPx <= 140) ?? 10;
  const byId = new Map(candidates.map(c => [c.id, c]));
  const pinRings = useMemo(() => (pinFootprint ? footprintRings(pinFootprint) : []), [pinFootprint]);
  const pinAt = pin ? project(frame, { lon: pin.lon, lat: pin.lat }) : null;

  // the svg's viewBox equals its pixel size, so a client offset is a frame coordinate
  const geoAt = (clientX: number, clientY: number): PinPoint | null => {
    const el = ref.current; if (!el) return null;
    const r = el.getBoundingClientRect();
    const p = unproject(frame, { x: clientX - r.left, y: clientY - r.top });
    return { lat: p.lat, lon: p.lon };
  };
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!onPin || (e.button ?? 0) !== 0 || !Number.isFinite(e.clientX)) return;
    const target = e.target as Element;
    if (target.closest("[data-testid=candidate-footprint]")) return; // the footprint's own click selects it
    const dragging = !!target.closest("[data-pin]");
    gesture.current = { x: e.clientX, y: e.clientY, moved: false, dragging };
    if (dragging) ref.current?.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const g = gesture.current; if (!g || !onPin) return;
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) > DRAG_THRESHOLD) g.moved = true;
    if (g.moved && g.dragging) { const p = geoAt(e.clientX, e.clientY); if (p) onPin(p); }
  };
  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    const g = gesture.current; gesture.current = null;
    if (!g || !onPin) return;
    if (g.moved) return; // a drag either moved the pin or was a stray swipe
    const target = e.target as Element;
    if (target.closest("[data-testid=candidate-footprint]") || target.closest("button")) return;
    const p = geoAt(e.clientX, e.clientY); if (p) onPin(p);
  };

  return (
    <div className={`relative overflow-hidden rounded-xl border border-line-strong bg-canvas ${className}`}>
      <div ref={ref} className={`absolute inset-0 ${onPin ? "cursor-crosshair" : ""}`} data-testid="survey-map-frame" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { gesture.current = null; }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${size.w} ${size.h}`} role="img" aria-label={`Schematic map of survey ${run.label}: boundary, ${centres.length} sampling centres, ${n} candidate footprints and ${known.length} established catalog sites in view. No imagery.${onPin ? " Click empty map to drop a pin; drag the pin to move it." : ""}`}>
          <defs><pattern id="survey-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" style={{ stroke: "var(--color-line)" }} strokeWidth="1" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#survey-grid)" />
          {/* surveyed boundary */}
          <path d={boundsPath(frame, run.bounds)} fill="rgba(110,160,217,0.06)" stroke="#6ea0d9" strokeWidth={1.5} strokeDasharray="6 4" data-testid="survey-boundary" />
          {/* footprints */}
          {rings.map(r => { const c = byId.get(r.id); if (!c || !r.rings.length) return null; const pos = rankPosition(c.display_rank, n); const color = rankColor(pos, palette) ?? NOT_RANKED_COLOR; const sel = r.id === selectedId; return (
            <g key={r.id} role="button" tabIndex={0} aria-label={`Footprint of ${c.name}, rank ${c.display_rank ?? "—"}${sel ? ", selected" : ""}`} aria-pressed={sel} onClick={() => onSelect(r.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(r.id); } }} className="cursor-pointer outline-none focus-visible:[&>path]:stroke-white" data-testid="candidate-footprint">
              {r.rings.map((ring, i) => <path key={i} d={ringPath(frame, ring)} fill={color} fillOpacity={sel ? 0.42 : 0.2} stroke={color} strokeWidth={sel ? 3 : 1.5} />)}
            </g>
          ); })}
          {/* sampling centres */}
          {centres.map((c, i) => { const q = project(frame, { lon: c.lon, lat: c.lat }); const excluded = c.status === "excluded"; return <circle key={`${c.id ?? i}`} cx={q.x} cy={q.y} r={excluded ? 2.5 : 3} style={{ fill: excluded ? "none" : "var(--color-fg)", stroke: excluded ? "var(--color-fg-muted)" : "var(--color-canvas)" }} strokeWidth={1} opacity={0.9} data-testid="sampling-centre"><title>{`Sampling centre ${c.id ?? i + 1}: ${c.lat.toFixed(3)}°, ${c.lon.toFixed(3)}°E${c.status ? ` · ${c.status}` : ""}`}</title></circle>; })}
          {/* candidate centres with rank labels */}
          {candidates.map(c => { const q = project(frame, { lon: c.lon_east, lat: c.lat }); return <g key={`c-${c.id}`} pointerEvents="none"><circle cx={q.x} cy={q.y} r={9} style={{ fill: "var(--color-canvas)" }} fillOpacity={0.8} /><text x={q.x} y={q.y + 3.5} textAnchor="middle" fontSize="10" style={{ fill: "var(--color-fg)", fontFamily: "var(--font-mono)" }}>{c.display_rank ?? "·"}</text></g>; })}
          {/* established catalog sites */}
          {known.map(s => { const q = project(frame, { lon: s.lonEast, lat: s.lat }); return <g key={`k-${s.id}`} data-testid="established-site"><path d={`M${q.x - 6} ${q.y}H${q.x + 6}M${q.x} ${q.y - 6}V${q.y + 6}`} style={{ stroke: "var(--color-fg-muted)" }} strokeWidth={2} /><title>{`Catalog context site, not a candidate: ${s.name}`}</title></g>; })}
          {/* the dropped pin: its measured footprint (dashed) and the pin itself, draggable */}
          {pinRings.map((ring, i) => <path key={`pin-ring-${i}`} d={ringPath(frame, ring)} fill={PIN_COLOR} fillOpacity={0.12} stroke={PIN_COLOR} strokeWidth={2} strokeDasharray="5 3" pointerEvents="none" data-testid="pin-footprint" />)}
          {pin && pinAt && (
            <g data-pin role="img" aria-label={`Dropped pin at ${formatPoint(pin.lat, pin.lon)}, not a candidate`} style={{ cursor: onPin ? "grab" : undefined, touchAction: "none" }} data-testid="map-pin">
              <line x1={pinAt.x} y1={pinAt.y} x2={pinAt.x} y2={pinAt.y - 18} stroke={PIN_COLOR} strokeWidth={2} />
              <circle cx={pinAt.x} cy={pinAt.y - 22} r={7} fill={PIN_COLOR} stroke="white" strokeWidth={1.5} />
              <circle cx={pinAt.x} cy={pinAt.y} r={2.5} fill="white" />
              <circle cx={pinAt.x} cy={pinAt.y - 14} r={16} fill="transparent" />
              <title>{`Dropped pin at ${formatPoint(pin.lat, pin.lon)} · drag to move`}</title>
            </g>
          )}
        </svg>
      </div>
      <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/70 px-2 py-1 text-[10.5px] text-fg-muted">Only the dashed area was searched · schematic, no imagery</div>
      <div className="pointer-events-none absolute bottom-3 left-3 space-y-1">
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded bg-black/70 px-2 py-1 text-[10.5px] text-fg" aria-label="Map legend">
          <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-5 border border-dashed border-info" aria-hidden />Area searched</li>
          <li className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-fg" aria-hidden />Sampled centres{centres.length ? ` (${centres.length})` : ""}, evaluated</li>
          <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded-sm bg-[#f0862a]/40 ring-1 ring-[#f0862a]" aria-hidden />Shortlist candidates{n ? ` (${n})` : ""}, by rank</li>
          <li className="flex items-center gap-1.5"><span aria-hidden className="text-fg-muted">+</span>Catalog context site{known.length ? `s (${known.length} in view)` : " (none in view)"}</li>
          {onPin && <li className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PIN_COLOR }} aria-hidden />Dropped pin{pin ? "" : " (click to place)"}, not a candidate</li>}
        </ul>
        <div className="rounded bg-black/70 px-2 py-1 text-[11px] text-white" aria-label={`Scale bar: ${barKm} km`}><div className="h-1.5 border-x-2 border-b-2 border-white" style={{ width: `${Math.round(barKm * kmPx)}px` }} aria-hidden /><div className="num mt-0.5">{barKm} km</div></div>
      </div>
      <p className="pointer-events-none absolute right-3 top-3 max-w-[40%] rounded bg-black/70 px-2 py-1 text-right text-[10.5px] text-fg-muted">{RANK_LEGEND_SENTENCE}</p>
    </div>
  );
}
