// Earth analog comparison for the selected Mars site. Similarity is a
// heuristic index over comparable features and is a different concept from
// landing suitability; the two never share a chart or a number.
import { useMemo, useState } from "react";
import { RotateCcw, ExternalLink } from "lucide-react";
import { Section, BulletList, EmptyNote } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { useAnalogs } from "@/hooks/useAnalogs";
import { useAppStore } from "@/store/useAppStore";
import { formatLatLon, formatNumber, formatUnit, formatPercent, humanize } from "@/lib/format";
import { AnalogFactorChart } from "@/components/charts/AnalogFactorChart";
import type { AnalogMatch, FeatureDistance, Site, Provenance } from "@/types";

const ANALOG_FEATURES: Array<{ feature_id: string; label: string; default_weight: number }> = [
  { feature_id: "slope_regional_median_deg", label: "Regional slope", default_weight: 25 },
  { feature_id: "roughness_regional_m", label: "Detrended relief", default_weight: 25 },
  { feature_id: "terrain_morphology", label: "Terrain morphology", default_weight: 20 },
  { feature_id: "mineralogy_tags", label: "Mineralogy / composition", default_weight: 20 },
  { feature_id: "precipitation_mm_day", label: "Aridity (precipitation)", default_weight: 10 },
  { feature_id: "insolation_toa_annual_mean_wm2", label: "TOA insolation (informational)", default_weight: 0 },
];

export function AnalogComparison({ site, sources }: { site: Site | null; sources?: Record<string, Provenance> }) {
  const q = useAnalogs(site?.id ?? null, 5);
  const [activeId, setActiveId] = useState<string | null>(null);
  const analogWeights = useAppStore((s) => s.analogWeights);
  const setAnalogWeight = useAppStore((s) => s.setAnalogWeight);
  const resetAnalogWeights = useAppStore((s) => s.resetAnalogWeights);

  const matches = q.data?.matches ?? [];
  const active: AnalogMatch | undefined = useMemo(() => matches.find((m) => m.earth_candidate.id === activeId) ?? matches[0], [matches, activeId]);

  if (!site) {
    return (
      <Section title="Earth analog comparison">
        <EmptyNote>Select a Mars site on the globe or in the ranked list to find Earth analogs.</EmptyNote>
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

        <Section
          title="Analog weights"
          subtitle="Optional: re-weight the comparable features (0–100)"
          actions={
            <button type="button" onClick={resetAnalogWeights} disabled={!analogWeights} className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[10.5px] text-fg-muted hover:text-fg disabled:opacity-40" aria-label="Reset analog weights to spec defaults">
              <RotateCcw className="h-3 w-3" aria-hidden /> Defaults
            </button>
          }
        >
          <ul className="space-y-2.5">
            {ANALOG_FEATURES.map((f) => {
              const w = analogWeights?.[f.feature_id] ?? f.default_weight;
              const id = `aw-${f.feature_id}`;
              return (
                <li key={f.feature_id}>
                  <div className="mb-0.5 flex justify-between text-[11px]">
                    <label htmlFor={id} className="text-fg">{f.label}</label>
                    <span className="num text-fg-muted">{w}</span>
                  </div>
                  <input id={id} type="range" min={0} max={100} step={1} value={w} aria-label={`${f.label} analog weight`} style={{ ["--pct" as string]: `${w}%` }} onChange={(e) => {
                    // seed all defaults on first touch so the request carries every feature
                    if (!analogWeights) for (const g of ANALOG_FEATURES) setAnalogWeight(g.feature_id, g.default_weight);
                    setAnalogWeight(f.feature_id, Number(e.target.value));
                  }} />
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="Planetary differences" subtitle="Never compared; always disclosed">
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

      <Section title="Feature distances" subtitle="Comparable features enter D; non-comparable ones are listed, not scored">
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
              <h4 className="mt-3 mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-warn">Non-comparable (excluded from D)</h4>
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
          <BulletList items={match.shared_characteristics} tone="ok" empty="No features close at the harmonised scale." />
        </Section>
        <Section title="Important differences">
          <BulletList items={match.important_differences} tone="danger" empty="No large differences among comparable features." />
        </Section>
      </div>
      <Section title="Non-comparable variables" subtitle="Planetary differences that no Earth site can match">
        <BulletList items={match.noncomparable_variables} tone="warn" />
      </Section>
      <Section title="Research applications">
        {(c.known_analog_use ?? []).length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {(c.known_analog_use ?? []).map((u) => (
              <Badge key={u} tone="info">{u}</Badge>
            ))}
          </div>
        )}
        <BulletList items={match.research_applications} empty="No documented analog campaigns." />
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
