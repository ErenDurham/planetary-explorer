// End-of-page disclosures: provenance (every source behind both locations and
// the imagery), method (how the index is computed), and limitations including
// the four stated caveats. Collapsed by default; eligibility and missing-data
// notes sit beside the results they concern, not here.
import type { PairColumnData } from "@/components/compare/PairSelectors";
import type { AnalogMatch, AnalogRankResponse, BodyReference, Provenance, SiteImagery } from "@/types";

export const STATED_CAVEATS = [
  "Earth temperature values are NASA POWER 2 m air-temperature climatology, not Martian ground temperature; thermal comparisons are qualitative only.",
  "Earth elevations are relative to the EGM2008 geoid and Mars elevations to the MOLA areoid; the two cannot be subtracted.",
  "Top-of-atmosphere sunlight is not surface irradiance: it ignores atmosphere, dust, clouds and terrain shading.",
  "Terrestrial field use of an analog site is not a completed Mars experiment; similarity is a heuristic index, not evidence that findings transfer.",
];

export function ProvenanceDisclosures({ columns, bodies, rank, pairMatch, imagery }: { columns: [PairColumnData, PairColumnData]; bodies: BodyReference[]; rank: AnalogRankResponse | undefined; pairMatch: AnalogMatch | undefined; imagery: (SiteImagery | null)[] }) {
  const sources = new Map<string, Provenance>();
  for (const c of columns) for (const s of Object.values(c.location?.sources ?? {})) sources.set(s.url, s);
  for (const b of bodies) if (b.id === "earth" || b.id === "mars") { sources.set(b.fact_source.url, b.fact_source); sources.set(b.atmosphere_source.url, b.atmosphere_source); }
  const imagerySources = new Map<string, { title: string; institution: string; url: string; license: string }>();
  for (const im of imagery) for (const e of im?.entries ?? []) imagerySources.set(e.source_page_url, { title: e.title, institution: e.institution, url: e.source_page_url, license: e.license });
  return (
    <div className="space-y-2">
      <details className="rounded border border-line"><summary className="cursor-pointer px-4 py-3 text-sm text-fg-muted">Provenance: measurement and imagery sources</summary>
        <div className="space-y-3 px-4 pb-4 text-sm text-fg-muted">
          <ul className="space-y-1 text-xs">{[...sources.values()].map(s => <li key={s.url}>{/^https?:\/\//.test(s.url) ? <a className="text-info underline underline-offset-4" href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a> : <span>{s.title} · documented model method</span>}<span className="ml-2 text-fg-faint">{s.institution}{s.retrieved_at ? ` · retrieved ${s.retrieved_at}` : ""}</span></li>)}</ul>
          {imagerySources.size > 0 && <><p className="text-xs font-semibold uppercase tracking-wide text-fg-faint">Imagery</p><ul className="space-y-1 text-xs">{[...imagerySources.values()].map(s => <li key={s.url}><a className="text-info underline underline-offset-4" href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a><span className="ml-2 text-fg-faint">{s.institution} · {s.license}</span></li>)}</ul></>}
          {pairMatch?.citations && pairMatch.citations.length > 0 && <p className="text-xs">Analog citations: <span className="num">{pairMatch.citations.join(", ")}</span></p>}
        </div>
      </details>
      <details className="rounded border border-line"><summary className="cursor-pointer px-4 py-3 text-sm text-fg-muted">Method: how the similarity index is computed</summary>
        <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-fg-muted">
          <p>Similarity = 100 / (1 + D), where D is the weighted sum of per-feature distances: scaled absolute differences for regional slope, detrended relief and precipitation, Jaccard distance for landform and material tags. The basis is the set of positively weighted features comparable for EVERY candidate on the candidate body, so no location looks better merely because a difficult feature is missing{rank ? ` (basis: ${rank.basis_features.join(", ")}; excluded: ${rank.excluded_features.map(f => `${f.label} - ${f.reason}`).join("; ") || "none"})` : ""}.</p>
          <p>Rank is the position of this pair's candidate in that pool against the reference; the same pair has the same similarity in either direction, only the rank changes because the pool does. {rank?.tie_rule}</p>
          <p>Terrain statistics come from harmonised ~3.7 km Earth and Mars grids over each location's analysis footprint (Mars ±0.5°, Earth ±0.25°). Analog preferences only reweight these features; mission priorities affect Mars landing ranking in Analyze and never this page.{rank ? ` Spec ${rank.analog_spec_version}, profile ${rank.profile_version}.` : ""}</p>
        </div>
      </details>
      <details className="rounded border border-line"><summary className="cursor-pointer px-4 py-3 text-sm text-fg-muted">Limitations and caveats</summary>
        <ul className="space-y-1.5 px-4 pb-4 text-xs leading-relaxed text-fg">
          {STATED_CAVEATS.map(c => <li key={c} className="flex gap-2"><span aria-hidden className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-sm bg-warn" /><span>{c}</span></li>)}
          {(pairMatch?.limitations ?? []).map(c => <li key={c} className="flex gap-2"><span aria-hidden className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-sm bg-fg-faint" /><span>{c}</span></li>)}
          <li className="flex gap-2"><span aria-hidden className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-sm bg-fg-faint" /><span>Imagery is contextual: orbital mosaics are uncontrolled and resampled, field photographs show one place and one moment, and neither resolves landing hazards. Regional and exact-site imagery are labelled on each pane.</span></li>
        </ul>
      </details>
    </div>
  );
}
