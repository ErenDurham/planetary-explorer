import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/services/api";
import { AnalogComparison } from "@/components/intelligence/AnalogComparison";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { Spinner } from "@/components/ui/Spinner";
import { formatLatLon, formatNumber, formatUnit, humanize } from "@/lib/format";
import { COMPARISON_MODES, measurement, terrainDifference, type ComparisonMode } from "@/lib/comparison";
import type { BodyReference, ComparisonLocation, Site } from "@/types";

type Row = { feature: string; label: string; note: string };
const TERRAIN: Row[] = [
  { feature: "slope_regional_median_deg", label: "Regional slope", note: "Median slope at ~3.7 km scale. Earth and Mars use harmonised terrain grids." },
  { feature: "roughness_regional_m", label: "Regional relief", note: "Unevenness after removing broad terrain tilt; ~3.7 km grid. Not rock-scale roughness." },
  { feature: "terrain_morphology", label: "Landforms", note: "Literature descriptions; matching tags do not imply identical terrain." },
  { feature: "mineralogy_tags", label: "Materials", note: "Documented composition tags; not a quantitative mineral abundance." },
  { feature: "elevation_median_m", label: "Elevation", note: "Different reference surfaces: Earth EGM2008 geoid; Mars areoid. Do not subtract these values." },
];
const ENVIRONMENT: Row[] = [
  { feature: "insolation_toa_annual_mean_wm2", label: "Annual sunlight above atmosphere", note: "Modelled annual mean at the site's latitude. Not surface illumination or solar-panel yield." },
  { feature: "surface_sw_annual_mean_wm2", label: "Surface solar radiation", note: "Earth climatology includes atmospheric effects. Lunar horizon and shadow modelling is not loaded." },
  { feature: "surface_temperature_mean_c", label: "Temperature", note: "Earth values are 2 m air-temperature climatology (NASA POWER), not ground temperature. Mars/Lunar surface profiles are not loaded." },
  { feature: "precipitation_mm_day", label: "Precipitation", note: "Earth climatology; Mars zero is a documented model assumption, not a measured rainfall record." },
];
const bodyColor: Record<string, string> = { earth: "#70a6df", mars: "#ee9c44", moon: "#c4b4d7" };

function Value({ location, row, details }: { location: ComparisonLocation; row: Row; details: boolean }) {
  const m = measurement(location, row.feature);
  if (!m) return <><span className="text-fg-muted">Not available</span>{details && <p className="mt-2 text-xs text-fg-faint">No {location.body === "moon" ? "lunar " : ""}measurement loaded for this location.</p>}</>;
  const value = Array.isArray(m.value) ? m.value.map(humanize).join(" · ") : typeof m.value === "number" ? `${formatNumber(m.value)} ${formatUnit(m.unit)}` : m.value;
  const source = m.source_id ? location.sources[m.source_id] : undefined;
  return <>
    <div className={typeof m.value === "number" ? "num text-lg text-fg" : "text-sm leading-relaxed text-fg"}>{value}</div>
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted"><span>{m.measurement_type === "estimated" ? "Modelled" : humanize(m.measurement_type)}</span>{source && /^https?:\/\//.test(source.url) && <a href={source.url} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-4 hover:text-fg">Source ↗<span className="sr-only">: {location.name}, {row.label}</span></a>}{source && !/^https?:\/\//.test(source.url) && <details><summary className="cursor-pointer underline decoration-line-strong underline-offset-4">Method<span className="sr-only">: {location.name}, {row.label}</span></summary><p className="mt-2 max-w-xs leading-relaxed">{source.title}. {m.notes}</p></details>}</div>
    {details && <div className="mt-3 space-y-1 text-xs leading-relaxed text-fg-muted"><p>{m.spatial_resolution}</p><p>{m.uncertainty}</p><p>{m.notes}</p><p>Quality: {humanize(m.quality_flag)}</p></div>}
  </>;
}

export function CompareView({ sites, selectedId, onSelect }: { sites: Site[] | undefined; selectedId: string | null; onSelect: (id: string) => void }) {
  const q = useQuery({ queryKey: ["comparison-catalog"], queryFn: api.comparisonCatalog, staleTime: Infinity });
  const { mode, earthId, moonId, details, section } = useAppStore(s => s.comparison);
  const setComparison = useAppStore(s => s.setComparison);
  const setMode = (mode: ComparisonMode) => setComparison({ mode });
  const setEarthId = (earthId: string) => setComparison({ earthId });
  const setMoonId = (moonId: string) => setComparison({ moonId });
  const setDetails = (details: boolean) => setComparison({ details });
  const setSection = (section: string) => setComparison({ section });
  const [analogsOpen, setAnalogsOpen] = useState(false);
  const data = q.data;
  const visibleBodies = COMPARISON_MODES.find(m => m.id === mode)!.bodies;
  const selected = visibleBodies.map(body => {
    const locations = data?.locations.filter(s => s.body === body) ?? [];
    const id = body === "earth" ? earthId : body === "moon" ? moonId : selectedId;
    return { body: data?.bodies.find(b => b.id === body), location: locations.find(s => s.id === id) ?? locations[0], locations };
  });
  const earth = data?.locations.find(s => s.body === "earth" && s.id === earthId) ?? data?.locations.find(s => s.body === "earth");
  const mars = data?.locations.find(s => s.body === "mars" && s.id === selectedId) ?? data?.locations.find(s => s.body === "mars");
  const originalMars = sites?.find(s => s.id === mars?.id) ?? null;
  const slopeGap = earth && mars ? terrainDifference(earth, mars, "slope_regional_median_deg") : null;
  const reliefGap = earth && mars ? terrainDifference(earth, mars, "roughness_regional_m") : null;
  const showTerrain = section === "all" || section === "terrain";
  const showEnvironment = section === "all" || section === "energy";
  const showBody = section === "all" || section === "body";
  const columns = selected.length + 1;
  const sources = new Map(selected.flatMap(s => [
    ...Object.values(s.location?.sources ?? {}),
    ...(s.body ? [s.body.fact_source, s.body.atmosphere_source] : []),
  ]).map(s => [s.url, s]));
  const group = (name: string, note: string) => <tr><th colSpan={columns} scope="colgroup" className="compare-group"><span>{name}</span><span className="ml-3 font-normal normal-case tracking-normal text-fg-muted">{note}</span></th></tr>;
  const rows = (items: Row[]) => items.map(row => <tr key={row.feature}><th scope="row" className="compare-metric"><span className="font-medium text-fg">{row.label}</span><p className="mt-2 text-xs font-normal leading-relaxed text-fg-muted">{row.note}</p></th>{selected.map(s => <td key={s.location.id}><Value location={s.location} row={row} details={details}/></td>)}</tr>);
  const referenceRow = (label: string, note: string, value: (body: BodyReference) => string, atmosphere = false) => <tr><th scope="row" className="compare-metric"><span className="font-medium text-fg">{label}</span><p className="mt-2 text-xs font-normal leading-relaxed text-fg-muted">{note}</p></th>{selected.map(s => <td key={s.location.id}><div className="text-base text-fg">{value(s.body!)}</div><a className="mt-2 inline-block text-xs text-fg-muted underline decoration-line-strong underline-offset-4" href={(atmosphere ? s.body!.atmosphere_source : s.body!.fact_source).url} target="_blank" rel="noreferrer">NASA reference ↗<span className="sr-only">: {s.body!.name}, {label}</span></a></td>)}</tr>;
  return <div className="scroll-thin h-full overflow-y-auto bg-bg" aria-label="Planetary comparison">
    <div className="mx-auto max-w-[1800px] px-4 py-6 md:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-semibold text-fg">Compare worlds</h1><p className="mt-2 text-sm text-fg-muted">Choose locations. Compare terrain, energy and operating conditions side by side.</p></div>
        <div className="flex flex-wrap gap-1 rounded border border-line p-1" role="group" aria-label="Bodies to compare">{COMPARISON_MODES.map(m => <button key={m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)} className={`rounded px-3 py-2 text-sm ${mode === m.id ? "bg-copper/15 text-copper-bright" : "text-fg-muted hover:bg-bg-elev"}`}>{m.label}</button>)}</div>
      </header>
      {q.isPending && <Spinner label="Loading comparison locations"/>}
      {q.error && <div className="mb-4"><ErrorNote error={q.error} context="comparison/catalog"/><button className="mt-3 text-sm text-copper-bright underline" onClick={() => q.refetch()}>Retry comparison</button></div>}
      {data && selected.every(s => s.location && s.body) && <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-fg-muted">Show<select value={section} onChange={e => setSection(e.target.value)} className="rounded border border-line-strong bg-bg-elev px-3 py-2 text-fg"><option value="all">All comparisons</option><option value="terrain">Terrain & materials</option><option value="energy">Energy & climate</option><option value="body">Planetary conditions</option></select></label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted"><input type="checkbox" checked={details} onChange={e => setDetails(e.target.checked)}/>Measurement details</label>
        </div>
        <p className="mb-3 text-xs text-fg-muted md:hidden">Swipe across the table to compare locations. The metric column stays visible.</p>
        <div className="compare-table-wrap scroll-thin rounded border border-line" role="region" aria-label="Side-by-side location measurements" tabIndex={0}>
          <table className={`compare-table ${selected.length === 2 ? "compare-pair" : ""}`}>
            <caption className="sr-only">Selected Earth, Mars and Moon locations. Local measurements and planetary reference conditions are separate groups.</caption>
            <colgroup><col className="compare-label-col"/>{selected.map(s => <col key={s.location.id}/>)}</colgroup>
            <thead><tr><th scope="col" className="compare-metric"><div className="text-xs uppercase tracking-widest text-fg-muted">Comparison</div><p className="mt-3 text-xs font-normal leading-relaxed text-fg-muted">Values retain their original units, methods and geographic coverage.</p></th>{selected.map(s => <th scope="col" key={s.location.id} style={{ borderTop: `3px solid ${bodyColor[s.body!.id]}` }}>
              <div className="mb-3 flex items-center justify-between gap-2"><span className="text-lg font-semibold" style={{ color: bodyColor[s.body!.id] }}>{s.body!.name}</span><span className="text-xs font-normal text-fg-muted">{s.locations.length} locations</span></div>
              <label htmlFor={`compare-${s.body!.id}`} className="sr-only">{s.body!.name} location</label>
              <select id={`compare-${s.body!.id}`} value={s.location.id} onChange={e => s.body!.id === "earth" ? setEarthId(e.target.value) : s.body!.id === "moon" ? setMoonId(e.target.value) : onSelect(e.target.value)} className="w-full min-w-0 rounded border border-line-strong bg-bg px-2 py-2 text-sm font-medium text-fg">{s.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
              <p className="mt-3 text-xs font-normal text-fg-muted">{formatLatLon(s.location.lat, s.location.lon_east)}</p>
              <p className="mt-1 text-xs font-normal text-fg-muted">{s.location.coverage}</p>
              <details className="mt-3 text-xs font-normal text-fg-muted"><summary className="cursor-pointer">About this location</summary><p className="mt-2 text-sm leading-relaxed text-fg">{s.location.description}</p></details>
            </th>)}</tr></thead>
            <tbody>
              {showBody && <>{group("Planetary conditions", "Body reference values · independent of selected location")}
                {referenceRow("Surface gravity", "Reference gravity; affects mobility and hardware tests. Values rounded to 0.01 m/s².", b => `${b.gravity_ms2.toFixed(2)} m/s²`)}
                {referenceRow("Atmosphere", "An Earth field site cannot reproduce Mars or lunar pressure conditions.", b => b.atmosphere, true)}
                {referenceRow("Mean solar day", "Full solar cycle, not daylight duration. Lunar synodic period: 29.53 Earth days (~709 h); polar shadows need local modelling.", b => `${formatNumber(b.solar_day_hours, { maxFractionDigits: 2 })} h`)}
                {referenceRow("Incident solar irradiance", "Sunlight normal to incoming rays at mean orbital distance, above any atmosphere. Not annual site illumination.", b => `${formatNumber(b.solar_irradiance_wm2)} W/m²`)}
              </>}
              {showTerrain && <>{group("Terrain & materials", "Local and regional evidence")}{rows(TERRAIN)}</>}
              {showEnvironment && <>{group("Energy & climate", "Definitions and coverage vary by dataset")}{rows(ENVIRONMENT)}</>}
            </tbody>
          </table>
        </div>
        {visibleBodies.includes("earth") && visibleBodies.includes("mars") && (showTerrain || section === "all") && <div className="mt-4 border-l-2 border-copper pl-4 text-sm leading-relaxed text-fg-muted"><p className="font-medium text-fg">Earth ↔ Mars terrain difference</p><p className="mt-1">{slopeGap === null ? "Slope difference unavailable." : `Regional slope: ${formatNumber(slopeGap)}° apart.`} {reliefGap === null ? "Relief difference unavailable." : `Regional relief: ${formatNumber(reliefGap)} m apart.`} These describe regional terrain similarity, not landing suitability.</p></div>}
        <details className="mt-6 rounded border border-line bg-bg-elev" open={analogsOpen} onToggle={e => setAnalogsOpen(e.currentTarget.open)}><summary className="cursor-pointer px-4 py-4 text-sm font-medium text-fg">Find ranked Earth analogs for {mars?.name ?? "a Mars site"}<span className="ml-2 font-normal text-fg-muted">· optional matching model</span></summary>{analogsOpen && <AnalogComparison site={originalMars} sources={mars?.sources}/>}</details>
        <details className="mt-3 rounded border border-line"><summary className="cursor-pointer px-4 py-3 text-sm text-fg-muted">Sources & comparison limits</summary><div className="space-y-4 px-4 pb-4 text-sm leading-relaxed text-fg-muted"><p>Earth and Mars terrain grids are harmonised to roughly 3.7 km, over different regional footprints. This scale cannot resolve landing hazards. Lunar entries currently provide sourced landing-region descriptions; numeric terrain, illumination and thermal profiles have not been ingested. Missing values are not zero.</p><p>There is no universal cross-body suitability score. Earth analog weights affect only the optional Earth–Mars matching model; mission priorities affect Mars ranking in Analyze.</p><ul className="space-y-2">{[...sources.values()].map(s => <li key={s.url}>{/^https?:\/\//.test(s.url) ? <a className="text-blue underline underline-offset-4" href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a> : <span>{s.title} · documented model method</span>}<span className="ml-2 text-xs">{s.institution}</span></li>)}</ul></div></details>
      </>}
    </div>
  </div>;
}
