// Earth analog comparison for the selected Mars site. Similarity is a
// heuristic index over comparable features and is a different concept from
// landing suitability; the two never share a chart or a number.
import { useMemo, useState } from "react";
import { RotateCcw, ExternalLink, BookOpenCheck } from "lucide-react";
import { Section, BulletList, EmptyNote } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { useAnalogs } from "@/hooks/useAnalogs";
import { useAppStore } from "@/store/useAppStore";
import { formatLatLon, formatNumber, formatUnit, formatPercent, humanize } from "@/lib/format";
import { AnalogFactorChart } from "@/components/charts/AnalogFactorChart";
import { StudyCardView } from "@/components/intelligence/StudyCard";
import type { AnalogMatch, FeatureDistance, Site, Provenance, StudyCard } from "@/types";

/** proposed_studies arrives as loosely typed dicts; accept only well-formed cards. */
function isStudyCard(x: unknown): x is StudyCard {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (o.kind === "proposed_study" || o.kind === "documented_campaign") && typeof o.title === "string" && typeof o.research_question === "string" && typeof o.method === "string" && typeof o.why_here === "string" && typeof o.cannot_infer === "string";
}

const ANALOG_FEATURES: Array<{ feature_id: string; label: string; default_weight: number }> = [
  { feature_id: "slope_regional_median_deg", label: "Regional slope", default_weight: 25 },
  { feature_id: "roughness_regional_m", label: "Detrended relief", default_weight: 25 },
  { feature_id: "terrain_morphology", label: "Terrain morphology", default_weight: 20 },
  { feature_id: "mineralogy_tags", label: "Mineralogy / composition", default_weight: 20 },
  { feature_id: "precipitation_mm_day", label: "Aridity (precipitation)", default_weight: 10 },
  { feature_id: "insolation_toa_annual_mean_wm2", label: "TOA insolation (informational)", default_weight: 0 },
];

const ANALOG_GUIDE: Record<string, {label: string; effect: string}> = {
  slope_regional_median_deg: { label: "Similar slopes", effect: "Favours Earth terrain with a similar regional slope. This is useful for broad mobility studies." },
  roughness_regional_m: { label: "Similar terrain relief", effect: "Favours a similar amount of regional unevenness, after the broad tilt is removed." },
  terrain_morphology: { label: "Similar landforms", effect: "Matches literature labels such as crater floors or smooth plains. The labels are not detailed terrain maps." },
  mineralogy_tags: { label: "Similar materials", effect: "Matches mineral labels from the literature. This is useful for choosing a geology analog. It is not a spectral match." },
  precipitation_mm_day: { label: "Similar dryness", effect: "Favours low rainfall, which is closer to Mars. Low rainfall alone cannot reproduce Martian conditions." },
  insolation_toa_annual_mean_wm2: { label: "Similar sunlight above the atmosphere", effect: "This is off by default. It compares modelled yearly sunlight, not surface lighting or panel output. Raising it adds this feature to the match." },
};

export function AnalogComparison({ site, sources }: { site: Site | null; sources?: Record<string, Provenance> }) {
  const q = useAnalogs(site?.id ?? null, 5);
  const [activeId, setActiveId] = useState<string | null>(null);
  const analogWeights = useAppStore((s) => s.analogWeights);
  const setAnalogWeight = useAppStore((s) => s.setAnalogWeight);
  const resetAnalogWeights = useAppStore((s) => s.resetAnalogWeights);

  const [changedFeature, setChangedFeature] = useState<string | null>(null);
  const effectiveTotal = ANALOG_FEATURES.reduce((sum, f) => sum + (analogWeights?.[f.feature_id] ?? f.default_weight), 0);
  const matches = q.data?.matches ?? [];
  const active: AnalogMatch | undefined = useMemo(() => matches.find((m) => m.earth_candidate.id === activeId) ?? matches[0], [matches, activeId]);

  if (!site) {
    return (
      <Section title="Earth analog comparison">
        <EmptyNote>Select a Mars site on the globe or in the list to find Earth analogs.</EmptyNote>
      </Section>
    );
  }

  return (
    <div className="grid gap-0 lg:grid-cols-[320px_1fr]">
      <div className="border-b border-line lg:border-b-0 lg:border-r">
        <Section title="Analog candidates" subtitle={<span>for <span className="text-fg">{site.name}</span> · similarity = 100 / (1 + D), heuristic index · spec {q.data?.analog_spec_version ?? "—"}</span>}>
          {q.isPending && <Spinner label="Matching analogs" />}
          {q.error && <ErrorNote error={q.error} context="analogs/match" />}
          {q.data?.warnings && q.data.warnings.length > 0 && (
            <ul className="mb-2 space-y-1">
              {q.data.warnings.map((w, i) => (
                <li key={i} className="rounded border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] text-warn">{w}</li>
              ))}
            </ul>
          )}
          {matches.length > 0 && (
            <ol className="space-y-1" aria-label="Ranked Earth analog candidates">
              {matches.map((m) => {
                const sel = active?.earth_candidate.id === m.earth_candidate.id;
                return (
                  <li key={m.earth_candidate.id}>
                    <button type="button" onClick={() => setActiveId(m.earth_candidate.id)} aria-pressed={sel} className={`grid w-full grid-cols-[22px_1fr_auto] items-center gap-2 rounded border px-2 py-1.5 text-left ${sel ? "border-info bg-info/10" : "border-transparent hover:border-line-strong hover:bg-bg-elev-2"}`}>
                      <span className="num text-xs text-fg-muted">{m.rank}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs text-fg">{m.earth_candidate.name}</span>
                        <span className="block truncate text-[10.5px] text-fg-faint">{m.earth_candidate.region}, {m.earth_candidate.country}</span>
                        <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-sm bg-line" aria-hidden>
                          <span className="block h-full bg-info" style={{ width: `${m.similarity ?? 0}%` }} />
                        </span>
                      </span>
                      <span className="num text-xs text-info">{m.similarity != null ? formatNumber(m.similarity, { maxFractionDigits: 1 }) : "—"}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>

        <details className="m-4 rounded-lg border border-line-strong">
        <summary className="cursor-pointer p-3 text-sm font-semibold text-fg">Adjust comparison priorities {analogWeights ? "· customised" : "· defaults"}</summary>
        <Section
          title="What should match on Earth?"
          subtitle="These controls only reorder the Earth analogs. They do not change the Mars landing ranking or the measurements."
          actions={
            <button type="button" onClick={resetAnalogWeights} disabled={!analogWeights} className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[10.5px] text-fg-muted hover:text-fg disabled:opacity-40" aria-label="Reset analog weights to spec defaults">
              <RotateCcw className="h-3 w-3" aria-hidden /> Defaults
            </button>
          }
        >
          <p className="mb-3 text-xs text-fg-muted">Keep the defaults for a broad comparison. Adjust them when you plan a specific field experiment. The percentages show the relative weight. A longer distance bar means a worse match.</p>
          <ul className="space-y-4">
            {ANALOG_FEATURES.map((f) => {
              const w = analogWeights?.[f.feature_id] ?? f.default_weight;
              const id = `aw-${f.feature_id}`;
              return (
                <li key={f.feature_id}>
                  <div className="mb-0.5 flex justify-between text-[11px]">
                    <label htmlFor={id} className="text-sm text-fg">{ANALOG_GUIDE[f.feature_id].label}</label>
                    <span className="num text-sm text-fg-muted">{effectiveTotal ? Math.round(w / effectiveTotal * 100) : 0}%</span>
                  </div>
                  <p id={`${id}-effect`} className="mb-2 text-xs text-fg-muted">{ANALOG_GUIDE[f.feature_id].effect}</p>
                  <input aria-describedby={`${id}-effect`} id={id} type="range" min={0} max={100} step={1} value={w} aria-label={`${f.label} analog weight`} style={{ ["--pct" as string]: `${w}%` }} onChange={(e) => {
                    // seed all defaults on first touch so the request carries every feature
                    if (!analogWeights) for (const g of ANALOG_FEATURES) setAnalogWeight(g.feature_id, g.default_weight);
                    setAnalogWeight(f.feature_id, Number(e.target.value));
                    setChangedFeature(f.feature_id);
                  }} />
                </li>
              );
            })}
          </ul>
          {effectiveTotal === 0 && <p role="alert" className="mt-3 text-sm text-warn">Choose at least one feature to compare.</p>}
          {changedFeature && <p role="status" className="mt-4 rounded-lg border border-info/50 bg-info/10 p-3 text-sm text-fg">More emphasis on {ANALOG_GUIDE[changedFeature].label.toLowerCase()} favours Earth sites that are closer on that feature. The other features get less weight. The Earth ranking above updates. The Mars landing scores do not change.</p>}
        </Section>
        </details>

        <Section title="Planetary differences" subtitle="Always shown, never compared">
          <BulletList items={q.data?.planetary_differences} tone="warn" />
        </Section>
      </div>

      <div>
        {active ? <AnalogDetail match={active} marsSite={site} sources={sources} /> : !q.isPending && <Section title="Analog detail"><EmptyNote>No analog candidates returned.</EmptyNote></Section>}
      </div>
    </div>
  );
}

function AnalogDetail({ match, marsSite, sources }: { match: AnalogMatch; marsSite: Site; sources?: Record<string, Provenance> }) {
  const c = match.earth_candidate;
  const comparable = match.feature_distances.filter((d) => d.comparable);
  const nonComparable = match.feature_distances.filter((d) => !d.comparable);
  // documented_analog_use is authoritative; research_applications is its
  // deprecated alias and known_analog_use the candidate's own list. One set,
  // so a campaign is never shown twice.
  const documented = [...new Set([...(match.documented_analog_use ?? match.research_applications ?? []), ...(c.known_analog_use ?? [])])];
  const proposed = (match.proposed_studies ?? []).filter(isStudyCard);
  return (
    <>
      <Section title="Analog detail" subtitle={<span>Earth candidate matched to <span className="text-fg">{marsSite.name}</span></span>}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-medium text-fg">{c.name}</h3>
            <p className="text-xs text-fg-muted">{c.region}, {c.country} · <span className="num">{formatLatLon(c.lat, c.lon_east)}</span></p>
            <p className="num text-[11px] text-fg-faint">footprint {c.footprint.shape}, ~{formatNumber(c.footprint.approx_width_km ?? 0, { maxFractionDigits: 1 })} km wide · {c.footprint.crs}</p>
          </div>
          <div className="text-right">
            <div className="num text-3xl font-medium leading-none text-info">{match.similarity != null ? formatNumber(match.similarity, { maxFractionDigits: 1 }) : "—"}</div>
            <div className="text-[10.5px] uppercase tracking-wide text-fg-faint">similarity index · rank {match.rank}</div>
            <div className="num text-[10.5px] text-fg-faint">D = {match.distance != null ? match.distance.toFixed(3) : "—"} · comparable {formatPercent(match.completeness_fraction ?? 0)}</div>
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-fg-muted">{c.description}</p>
        {(c.tags ?? []).length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1" aria-label="Candidate tags">
            {(c.tags ?? []).map((t) => (
              <li key={t} className="rounded border border-line-strong bg-bg-elev-2 px-1.5 py-0.5 text-[10.5px] text-fg-muted">{humanize(t)}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Feature distances" subtitle="Comparable features are used in D. The others are listed but not scored.">
        <AnalogFactorChart distances={match.feature_distances} />
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="text-[10px] uppercase tracking-wide text-fg-faint">
              <tr>
                <th className="py-1 pr-2 font-medium">Feature</th>
                <th className="py-1 pr-2 font-medium">Mars</th>
                <th className="py-1 pr-2 font-medium">Earth</th>
                <th className="num py-1 pr-2 text-right font-medium">d</th>
                <th className="num py-1 pr-2 text-right font-medium">w</th>
                <th className="num py-1 text-right font-medium">w·d</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {comparable.map((d) => (
                <FeatureRow key={d.feature_id} d={d} />
              ))}
            </tbody>
          </table>
          {nonComparable.length > 0 && (
            <>
              <h4 className="mt-3 mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-warn">Not comparable (left out of D)</h4>
              <table className="w-full text-left text-[11px]">
                <tbody className="divide-y divide-line/70">
                  {nonComparable.map((d) => (
                    <FeatureRow key={d.feature_id} d={d} />
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </Section>

      <div className="grid gap-0 md:grid-cols-2">
        <Section title="Shared characteristics">
          <BulletList items={match.shared_characteristics} tone="ok" empty="No feature is close at the matched scale." />
        </Section>
        <Section title="Important differences">
          <BulletList items={match.important_differences} tone="danger" empty="No large difference among the compared features." />
        </Section>
      </div>
      <Section title="Non-comparable variables" subtitle="Differences between the planets that no Earth site can match">
        <BulletList items={match.noncomparable_variables} tone="warn" />
      </Section>
      <Section title="Documented analog use" subtitle="Past programmes recorded at this Earth site. These are not proposals.">
        {documented.length === 0 ? (
          <EmptyNote>No analog campaigns are recorded for this site.</EmptyNote>
        ) : (
          <ul className="space-y-1.5" aria-label="Documented analog programmes">
            {documented.map((u) => (
              <li key={u} className="flex items-center gap-2 text-xs text-fg">
                <Badge tone="ok"><BookOpenCheck className="h-3 w-3" aria-hidden /> Documented programme</Badge>
                <span>{u}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Proposed studies (hypotheses)" subtitle="Based on the matched features. Similarity is a rough index. It does not prove that results transfer.">
        {proposed.length === 0 ? (
          <EmptyNote>The matched features do not suggest a study for this pair.</EmptyNote>
        ) : (
          <ol className="space-y-3" aria-label="Proposed studies">
            {proposed.map((s, i) => <StudyCardView key={`${s.title}-${i}`} study={s} analogName={c.name} similarityNote />)}
          </ol>
        )}
      </Section>
      <Section title="Limitations">
        <BulletList items={match.limitations} tone="warn" />
      </Section>
      <Section title="Citations" subtitle="Source ids referenced by this comparison">
        <ul className="space-y-0.5 text-[11px]">
          {(match.citations ?? []).map((id) => {
            const s = sources?.[id];
            return (
              <li key={id} className="text-fg-muted">
                <span className="num text-fg-faint">{id}</span>
                {s ? (
                  <>
                    {" — "}
                    <span className="text-fg">{s.title}</span>
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center text-copper-bright hover:text-fg" aria-label={`Open ${s.title}`}>
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    )}
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Section>
    </>
  );
}

function fmtVal(v: FeatureDistance["mars_value"], unit: string | null | undefined): string {
  if (v === null || v === undefined) return "No data";
  if (typeof v === "number") return `${formatNumber(v)}${unit ? ` ${formatUnit(unit)}` : ""}`;
  if (Array.isArray(v)) return v.map(humanize).join(", ");
  return String(v);
}

function FeatureRow({ d }: { d: FeatureDistance }) {
  return (
    <tr className={d.comparable ? "text-fg" : "text-fg-faint"}>
      <td className="py-1 pr-2">
        {d.label}
        <div className="text-[10px] text-fg-faint">{d.method.replace(/_/g, " ")}{d.scale != null ? ` · scale ${d.scale}${d.unit ? ` ${formatUnit(d.unit)}` : ""}` : ""}{d.note ? ` · ${d.note}` : ""}</div>
      </td>
      <td className="py-1 pr-2 text-[10.5px]">{fmtVal(d.mars_value, d.unit)}</td>
      <td className="py-1 pr-2 text-[10.5px]">{fmtVal(d.earth_value, d.unit)}</td>
      <td className="num py-1 pr-2 text-right">{d.distance != null ? d.distance.toFixed(3) : "—"}</td>
      <td className="num py-1 pr-2 text-right">{d.normalized_weight != null ? d.normalized_weight.toFixed(2) : "—"}</td>
      <td className="num py-1 text-right">{d.contribution != null ? d.contribution.toFixed(3) : "—"}</td>
    </tr>
  );
}
