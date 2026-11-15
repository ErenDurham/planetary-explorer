// Schematic survey map. Everything drawn is a server-provided coordinate: the
// surveyed boundary, the exact sampling centres (actual coverage), each
// candidate's footprint polygon and the established-catalog sites that fall in
// view. There is no imagery under it, and it says so; footprints are coloured
// by display rank only.
import { useMemo, useRef, useState, useLayoutEffect } from "react";
import { rankColor, rankPosition, RANK_LEGEND_SENTENCE, type RankPalette } from "@/lib/rankColor";
import type { EarthSite } from "@/hooks/useEarthSites";
import { boundsPath, footprintRings, makeFrame, padBounds, project, pxPerKm, readSamplingCentre, ringPath, ringsBounds, unionBounds, type Frame } from "../lib/geo";
import type { DiscoveryCandidate, DiscoveryRunSummary, DiscoverySurvey } from "../adapter";

export function SurveyMap({ run, survey, candidates, selectedId, onSelect, established = [], palette = "roygbiv", className = "h-[420px]" }: {
  run: DiscoveryRunSummary; survey: DiscoverySurvey | null; candidates: DiscoveryCandidate[]; selectedId: string | null; onSelect: (id: string) => void; established?: EarthSite[]; palette?: RankPalette; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
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

  return (
    <div className={`relative overflow-hidden rounded-xl border border-line-strong bg-[#0a1118] ${className}`}>
      <div ref={ref} className="absolute inset-0" data-testid="survey-map-frame">
        <svg width="100%" height="100%" viewBox={`0 0 ${size.w} ${size.h}`} role="img" aria-label={`Schematic map of survey ${run.label}: boundary, ${centres.length} sampling centres, ${n} candidate footprints and ${known.length} established catalog sites in view. No imagery.`}>
          <defs><pattern id="survey-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#17202b" strokeWidth="1" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#survey-grid)" />
          {/* surveyed boundary */}
          <path d={boundsPath(frame, run.bounds)} fill="rgba(110,160,217,0.06)" stroke="#6ea0d9" strokeWidth={1.5} strokeDasharray="6 4" data-testid="survey-boundary" />
          {/* footprints */}
          {rings.map(r => { const c = byId.get(r.id); if (!c || !r.rings.length) return null; const pos = rankPosition(c.display_rank, n); const color = rankColor(pos, palette) ?? "#8a919c"; const sel = r.id === selectedId; return (
            <g key={r.id} role="button" tabIndex={0} aria-label={`Footprint of ${c.name}, rank ${c.display_rank ?? "—"}${sel ? ", selected" : ""}`} aria-pressed={sel} onClick={() => onSelect(r.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(r.id); } }} className="cursor-pointer outline-none focus-visible:[&>path]:stroke-white" data-testid="candidate-footprint">
              {r.rings.map((ring, i) => <path key={i} d={ringPath(frame, ring)} fill={color} fillOpacity={sel ? 0.42 : 0.2} stroke={color} strokeWidth={sel ? 3 : 1.5} />)}
            </g>
          ); })}
          {/* sampling centres */}
          {centres.map((c, i) => { const q = project(frame, { lon: c.lon, lat: c.lat }); const excluded = c.status === "excluded"; return <circle key={`${c.id ?? i}`} cx={q.x} cy={q.y} r={excluded ? 2.5 : 3} fill={excluded ? "none" : "#e6e9ee"} stroke={excluded ? "#9aa5b4" : "#0b0f14"} strokeWidth={1} opacity={0.9} data-testid="sampling-centre"><title>{`Sampling centre ${c.id ?? i + 1}: ${c.lat.toFixed(3)}°, ${c.lon.toFixed(3)}°E${c.status ? ` · ${c.status}` : ""}`}</title></circle>; })}
          {/* candidate centres with rank labels */}
          {candidates.map(c => { const q = project(frame, { lon: c.lon_east, lat: c.lat }); return <g key={`c-${c.id}`} pointerEvents="none"><circle cx={q.x} cy={q.y} r={9} fill="#0b0f14" fillOpacity={0.8} /><text x={q.x} y={q.y + 3.5} textAnchor="middle" fontSize="10" fontFamily="IBM Plex Mono, monospace" fill="#e6e9ee">{c.display_rank ?? "·"}</text></g>; })}
          {/* established catalog sites */}
          {known.map(s => { const q = project(frame, { lon: s.lonEast, lat: s.lat }); return <g key={`k-${s.id}`} data-testid="established-site"><path d={`M${q.x - 6} ${q.y}H${q.x + 6}M${q.x} ${q.y - 6}V${q.y + 6}`} stroke="#9aa5b4" strokeWidth={2} /><title>{`Established analog (catalog): ${s.name}`}</title></g>; })}
        </svg>
      </div>
      <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/70 px-2 py-1 text-[10.5px] text-fg-muted">Schematic map · server coordinates · no imagery</div>
      <div className="pointer-events-none absolute bottom-3 left-3 space-y-1">
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded bg-black/70 px-2 py-1 text-[10.5px] text-fg" aria-label="Map legend">
          <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-5 border border-dashed border-info" aria-hidden />Surveyed boundary</li>
          <li className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-fg" aria-hidden />Sampling centre</li>
          <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded-sm bg-[#f0862a]/40 ring-1 ring-[#f0862a]" aria-hidden />Candidate footprint (rank colour)</li>
          {known.length > 0 && <li className="flex items-center gap-1.5"><span aria-hidden className="text-fg-muted">+</span>Established analog</li>}
        </ul>
        <div className="rounded bg-black/70 px-2 py-1 text-[11px] text-white" aria-label={`Scale bar: ${barKm} km`}><div className="h-1.5 border-x-2 border-b-2 border-white" style={{ width: `${Math.round(barKm * kmPx)}px` }} aria-hidden /><div className="num mt-0.5">{barKm} km</div></div>
      </div>
      <p className="pointer-events-none absolute right-3 top-3 max-w-[40%] rounded bg-black/70 px-2 py-1 text-right text-[10.5px] text-fg-muted">{RANK_LEGEND_SENTENCE}</p>
    </div>
  );
}
