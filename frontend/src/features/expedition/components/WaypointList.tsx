// Keyboard-reachable twin of the map markers: every waypoint can be selected,
// re-ordered, edited by coordinate and removed without a pointer. Coordinates
// typed here are clamped to the basemap so the map and the request agree.
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import type { ImageBounds } from "@/types";
import { inside } from "../lib/geo";
import type { GeoPoint, SnappedStop, Waypoint } from "../adapter/types";

function offsetText(stop: SnappedStop | undefined): string | null {
  if (!stop?.snapped || stop.offset_m == null) return null;
  const d = stop.offset_m >= 1000 ? `${(stop.offset_m / 1000).toFixed(1)} km` : `${Math.round(stop.offset_m)} m`;
  return `snapped ${d} to a grid cell centre${stop.visited ? "" : " · not visited"}`;
}

export function WaypointList({ waypoints, selectedId, bounds, start, onSelect, onMove, onRemove, onReorder, readOnly, stops }: {
  waypoints: Waypoint[];
  selectedId: string | null;
  bounds: ImageBounds | null;
  start: GeoPoint;
  onSelect: (id: string | null) => void;
  onMove: (id: string, p: GeoPoint) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, direction: -1 | 1) => void;
  readOnly?: boolean;
  /** The last plan's snapped stops, keyed `start` / `waypoint-N` by the service. */
  stops?: SnappedStop[] | null;
}) {
  const stopFor = (id: string) => stops?.find(s => s.stop_id === id);
  return (
    <ol className="space-y-1.5" aria-label="Expedition stops in order">
      <li className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-xs">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/70 bg-fg text-[10px] font-semibold text-bg" aria-hidden>S</span>
        <div className="min-w-0 flex-1"><p className="font-medium text-fg">Start</p><p className="num truncate text-fg-muted">{start.lat.toFixed(4)}°, {start.lon_east.toFixed(4)}°E</p>{offsetText(stopFor("start")) && <p className="text-[10.5px] text-fg-faint">{offsetText(stopFor("start"))}</p>}</div>
      </li>
      {waypoints.map((w, i) => {
        const sel = w.id === selectedId; const off = bounds ? !inside(bounds, w) : false;
        return (
          <li key={w.id} className={`rounded-lg border px-2.5 py-2 text-xs transition-colors ${sel ? "border-copper bg-copper/10" : "border-line hover:border-line-strong"}`}>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onSelect(sel ? null : w.id)} aria-pressed={sel} aria-label={`Select waypoint ${i + 1}`} className="num flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/70 bg-copper text-[10px] font-semibold text-white">{i + 1}</button>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-fg">Waypoint {i + 1}{off && <span className="ml-2 text-warn">· outside basemap</span>}</p>
                {!readOnly && sel ? (
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    <label className="block text-[10.5px] text-fg-muted">Lat °<input type="number" step="0.0001" value={w.lat} aria-label={`Waypoint ${i + 1} latitude`} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onMove(w.id, clampTo(bounds, { lat: v, lon_east: w.lon_east })); }} className="num mt-0.5 w-full rounded border border-line-strong bg-bg px-1.5 py-1 text-xs text-fg" /></label>
                    <label className="block text-[10.5px] text-fg-muted">Lon °E<input type="number" step="0.0001" value={w.lon_east} aria-label={`Waypoint ${i + 1} longitude`} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onMove(w.id, clampTo(bounds, { lat: w.lat, lon_east: v })); }} className="num mt-0.5 w-full rounded border border-line-strong bg-bg px-1.5 py-1 text-xs text-fg" /></label>
                  </div>
                ) : (
                  <p className="num truncate text-fg-muted">{w.lat.toFixed(4)}°, {w.lon_east.toFixed(4)}°E</p>
                )}
                {offsetText(stopFor(`waypoint-${i + 1}`)) && <p className="text-[10.5px] text-fg-faint">{offsetText(stopFor(`waypoint-${i + 1}`))}</p>}
              </div>
              {!readOnly && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <button type="button" aria-label={`Move waypoint ${i + 1} earlier`} disabled={i === 0} onClick={() => onReorder(w.id, -1)} className="rounded p-1 text-fg-muted hover:text-fg disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" aria-hidden /></button>
                  <button type="button" aria-label={`Move waypoint ${i + 1} later`} disabled={i === waypoints.length - 1} onClick={() => onReorder(w.id, 1)} className="rounded p-1 text-fg-muted hover:text-fg disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" aria-hidden /></button>
                  <button type="button" aria-label={`Remove waypoint ${i + 1}`} onClick={() => onRemove(w.id)} className="rounded p-1 text-fg-muted hover:text-danger"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                </div>
              )}
            </div>
          </li>
        );
      })}
      {waypoints.length === 0 && <li className="rounded-lg border border-dashed border-line px-2.5 py-2 text-xs text-fg-faint">No waypoints yet. Click the map with the add tool. You can also press Enter on the map to place one at its centre.</li>}
    </ol>
  );
}

function clampTo(b: ImageBounds | null, p: GeoPoint): GeoPoint {
  if (!b) return p;
  return { lat: Math.max(b.south, Math.min(b.north, p.lat)), lon_east: Math.max(b.west, Math.min(b.east, p.lon_east)) };
}
