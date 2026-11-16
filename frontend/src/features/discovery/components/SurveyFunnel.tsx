// The survey's own audit numbers, as the server reports them: generated ->
// terrain-valid -> eligible, every exclusion reason with its count, the grid
// and footprint specification, dataset versions and the diversification rule.
import { Layers } from "lucide-react";
import { formatBounds, extentKm } from "../lib/geo";
import type { DiscoveryRankResponse, DiscoverySource } from "../adapter";

export function SurveyFunnel({ response, sources }: { response: DiscoveryRankResponse; sources?: DiscoverySource[] }) {
  const s = response.survey;
  const excluded = Object.entries(s.exclusion_counts ?? {});
  const excludedTotal = excluded.reduce((a, [, n]) => a + n, 0);
  const km = extentKm(s.bounds);
  const periods = [...new Set((sources ?? []).map(x => x.observation_period).filter(p => p && !/unspecified/i.test(p)))];
  return (
    <section aria-labelledby="survey-funnel" className="rounded-xl border border-line-strong bg-bg-elev p-4 text-xs">
      <h2 id="survey-funnel" className="eyebrow flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" aria-hidden />Survey coverage and screening</h2>
      <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Screening funnel">
        {[["Generated", s.generated_count], ["Terrain valid", s.terrain_valid_count], ["Eligible", s.eligible_count], ["Excluded", excludedTotal]].map(([label, n]) => (
          <li key={String(label)} className="rounded-lg border border-line p-2.5"><p className="text-[10.5px] uppercase tracking-wide text-fg-faint">{label}</p><p className="num mt-0.5 text-lg text-fg">{n}</p></li>
        ))}
      </ol>
      <p className="mt-2 text-fg-muted">Ranked pool {response.eligible_pool_count} · returned {response.returned_count} after diversification. A small survey may legitimately yield few or no qualifying regions.</p>
      {excluded.length > 0 && (
        <div className="mt-3"><h3 className="text-[10.5px] uppercase tracking-wide text-fg-faint">Exclusion reasons</h3>
          <ul className="mt-1 space-y-0.5">{excluded.map(([reason, n]) => <li key={reason} className="flex justify-between gap-3"><span className="text-fg">{reason.replace(/_/g, " ")}</span><span className="num text-fg-muted">{n}</span></li>)}</ul></div>
      )}
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-fg-faint">Searched extent</dt><dd className="num text-fg">{formatBounds(s.bounds)} · ~{Math.round(km.ew)} × {Math.round(km.ns)} km</dd>
        <dt className="text-fg-faint">Source period</dt><dd className="text-fg">{periods.length ? periods.join(" · ") : "Not stated by the service"}</dd>
        <dt className="text-fg-faint">Spec version</dt><dd className="num text-fg">{s.spec_version} · {response.engine_version}</dd>
        <dt className="text-fg-faint">Basis features</dt><dd className="text-fg">{response.basis_features.join(", ")}</dd>
      </dl>
      {([["Analysis grid", s.grid_specification], ["Footprint", s.footprint_specification], ["Diversification rule (immutable)", s.diversification], ["Dataset versions", s.dataset_versions]] as Array<[string, Record<string, unknown>]>).map(([title, dict]) => (
        <details key={title} className="mt-2 rounded-lg border border-line px-2.5 py-1.5"><summary className="cursor-pointer text-fg-muted">{title}</summary><KeyValues dict={dict} /></details>
      ))}
    </section>
  );
}

/** Rendering of a server dictionary as the service shaped it: primitives inline,
 * one nested level as an indented sub-list, deeper levels compact. Long strings
 * (projection WKT) are clipped with the full text on hover. */
export function KeyValues({ dict, depth = 0 }: { dict: Record<string, unknown> | null | undefined; depth?: number }) {
  const entries = Object.entries(dict ?? {});
  if (!entries.length) return <p className="mt-1 text-fg-faint">Not provided.</p>;
  const show = (v: unknown): string => v == null ? "null" : Array.isArray(v) ? v.map(x => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  return (
    <dl className={`mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 ${depth ? "ml-3 border-l border-line pl-2" : ""}`}>
      {entries.map(([k, v]) => {
        const nested = v && typeof v === "object" && !Array.isArray(v) && depth < 1;
        const text = nested ? "" : show(v);
        return <div key={k} className="contents"><dt className="text-fg-faint">{k.replace(/_/g, " ")}</dt><dd className="num break-words text-fg" title={text.length > 160 ? text : undefined}>{nested ? <KeyValues dict={v as Record<string, unknown>} depth={depth + 1} /> : text.length > 160 ? `${text.slice(0, 160)}…` : text}</dd></div>;
      })}
    </dl>
  );
}
