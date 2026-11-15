// End-of-page disclosures: provenance (every source behind both locations and
// the imagery), method (how the index is computed), and limitations including
// the four stated caveats. Collapsed by default; eligibility and missing-data
// notes sit beside the results they concern, not here.
import type { PairColumnData } from "@/components/compare/PairSelectors";
import type { AnalogMatch, AnalogRankResponse, BodyReference, Provenance, SiteImagery } from "@/types";

export const STATED_CAVEATS = [
  "Earth temperatures are NASA POWER 2 m air temperatures. They are not Martian ground temperatures. Temperature comparisons are qualitative only.",
  "Earth elevations use the EGM2008 geoid. Mars elevations use the MOLA areoid. The two cannot be subtracted.",
  "Sunlight at the top of the atmosphere is not sunlight at the surface. It ignores the atmosphere, dust, clouds and terrain shading.",
  "Field work at an Earth analog is not a completed Mars experiment. Similarity is a rough index. It is not evidence that results will transfer to Mars.",
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
          <p>Similarity = 100 / (1 + D). D is the weighted sum of the distances for each feature. Slope, relief and precipitation use scaled absolute differences. Landform and material labels use Jaccard distance. Only features with a positive weight that can be compared for every candidate are used. This way, no site looks better just because a hard feature is missing{rank ? ` (basis: ${rank.basis_features.join(", ")}; excluded: ${rank.excluded_features.map(f => `${f.label} - ${f.reason}`).join("; ") || "none"})` : ""}.</p>
          <p>Rank is the position of this candidate among all candidates for the reference. A pair has the same similarity in either direction. Only the rank changes, because the group of candidates changes. {rank?.tie_rule}</p>
          <p>Terrain values come from matched ~3.7 km Earth and Mars grids over each site's footprint (Mars ±0.5°, Earth ±0.25°). Analog preferences only change the weights of these features. Mission priorities affect the Mars landing ranking in Analyze, but never this page.{rank ? ` Spec ${rank.analog_spec_version}, profile ${rank.profile_version}.` : ""}</p>
        </div>
      </details>
      <details className="rounded border border-line"><summary className="cursor-pointer px-4 py-3 text-sm text-fg-muted">Limitations and caveats</summary>
        <ul className="space-y-1.5 px-4 pb-4 text-xs leading-relaxed text-fg">
          {STATED_CAVEATS.map(c => <li key={c} className="flex gap-2"><span aria-hidden className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-sm bg-warn" /><span>{c}</span></li>)}
          {(pairMatch?.limitations ?? []).map(c => <li key={c} className="flex gap-2"><span aria-hidden className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-sm bg-fg-faint" /><span>{c}</span></li>)}
          <li className="flex gap-2"><span aria-hidden className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-sm bg-fg-faint" /><span>Images give context only. Orbital mosaics are uncontrolled and resampled. Field photos show one place at one moment. Neither shows landing hazards. Each pane says whether the image is regional or of the exact site.</span></li>
        </ul>
      </details>
    </div>
  );
}
