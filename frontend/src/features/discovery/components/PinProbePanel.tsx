// Beneath the ranked candidates: one user-chosen point, scored by the service
// with the survey's own pipeline under the current priorities. The pin is
// placed by clicking the globe or the survey map (or dragging it on the map),
// or by typing coordinates here, which is the keyboard route. It is never a
// candidate: it sits apart from the list, says so, and whatever the service
// could not measure is shown as the service's reasons, never as a number.
import { useEffect, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { isDiscoveryRejected, isDiscoveryUnavailable, type DiscoveryCriterion, type DiscoveryFeatureDistance, type DiscoveryProbeResponse } from "../adapter";
import { formatKm, noveltyRelation } from "../lib/copy";
import { formatPoint } from "../lib/geo";
import type { PinPoint } from "../hooks/useDiscoveryProbe";

const STATUS_LABEL: Record<DiscoveryProbeResponse["status"], string> = {
  scored: "Scored",
  terrain_unavailable: "No terrain data for this footprint",
  insufficient_terrain_coverage: "Too little valid terrain in this footprint",
  features_unavailable: "Not every scored feature can be measured here",
};

function fmt(d: DiscoveryFeatureDistance, v: number): string {
  const digits = d.unit === "deg" ? 2 : d.unit === "m" ? 0 : 2;
  return `${v.toFixed(digits)} ${d.unit}`;
}

export interface ProbeState {
  data: DiscoveryProbeResponse | undefined;
  error: unknown;
  isPending: boolean;
  isRefreshing: boolean;
  fetchStatus: "fetching" | "paused" | "idle";
}

export function PinProbePanel({ pin, onPin, probe, criteria, referenceName, enabled }: {
  pin: PinPoint | null;
  onPin: (pin: PinPoint | null) => void;
  probe: ProbeState;
  criteria: DiscoveryCriterion[];
  referenceName: string;
  /** False until the survey is ranked, so the form says why nothing happens yet. */
  enabled: boolean;
}) {
  const [latText, setLatText] = useState(pin ? String(pin.lat) : "");
  const [lonText, setLonText] = useState(pin ? String(pin.lon) : "");
  // the inputs follow a pin placed on the map or globe, and stay editable
  useEffect(() => { setLatText(pin ? String(pin.lat) : ""); setLonText(pin ? String(pin.lon) : ""); }, [pin]);
  const label = (id: string) => criteria.find(c => c.feature_id === id)?.label ?? id.replace(/_/g, " ");

  const place = (e: FormEvent) => {
    e.preventDefault();
    const lat = Number(latText), lon = Number(lonText);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
    onPin({ lat, lon });
  };

  const data = probe.data;
  const measuring = pin && enabled && probe.isPending && probe.fetchStatus !== "idle";
  const body = !pin ? (
    <p className="mt-2 text-[10.5px] leading-snug text-fg-faint">No pin yet. Click the globe or the survey map where you want one, or type coordinates.</p>
  ) : !enabled ? (
    <p className="mt-2 text-[10.5px] leading-snug text-fg-faint">The pin is scored once the survey has been ranked.</p>
  ) : probe.error ? (
    isDiscoveryUnavailable(probe.error)
      ? <div role="status" className="mt-2 rounded-lg border border-warn/40 bg-warn/10 p-2.5 text-[11px] text-warn" data-testid="pin-unavailable"><p className="font-semibold">Pin scoring is not available here.</p><p className="mt-1 text-fg">{probe.error.reason}</p></div>
      : isDiscoveryRejected(probe.error)
        ? <div role="alert" className="mt-2 rounded-lg border border-warn/40 bg-warn/10 p-2.5 text-[11px] text-warn"><p className="font-semibold">The service declined this point.</p><p className="mt-1 text-fg">{probe.error.message}</p></div>
        : <div className="mt-2"><ErrorNote error={probe.error} context="discovery/probe" /></div>
  ) : measuring || !data ? (
    <p role="status" className="mt-2 text-[11px] text-fg-muted">Measuring the 60 km footprint at {formatPoint(pin.lat, pin.lon)}…</p>
  ) : data.status === "scored" ? (
    <ScoredProbe data={data} referenceName={referenceName} label={label} refreshing={probe.isRefreshing} />
  ) : (
    <div role="status" className="mt-2 rounded-lg border border-warn/40 bg-warn/10 p-2.5 text-[11px]" data-testid="pin-unscored">
      <p className="font-semibold text-warn">{STATUS_LABEL[data.status]}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-fg">{(data.reasons ?? []).map((r, i) => <li key={i}>{r}</li>)}</ul>
      {data.placement && <p className="mt-1.5 text-fg-muted">{data.placement.inside_survey_bounds ? "Inside the surveyed area." : "Outside the surveyed area; the survey did not sample here."}</p>}
    </div>
  );

  return (
    <section aria-labelledby="pin-probe" className="border-t border-line px-3 py-3" data-testid="pin-probe">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="pin-probe" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-muted">Score a dropped pin</h2>
        <Badge tone="neutral">Not a candidate</Badge>
      </div>
      <p className="mt-1 text-[10.5px] leading-snug text-fg-faint">Click the globe or the survey map, away from the candidate footprints, to drop a pin; drag it on the map to move it. The service measures a 60 km footprint there with the survey's own terrain pipeline and scores it under the current priorities. The pin never joins the ranking.</p>
      <form onSubmit={place} className="mt-2 flex flex-wrap items-end gap-1.5" aria-label="Place a pin by coordinates">
        <label className="text-[10.5px] text-fg-muted">Lat<input aria-label="Pin latitude" type="number" step="0.001" min={-90} max={90} value={latText} onChange={e => setLatText(e.target.value)} className="num mt-0.5 block w-20 rounded border border-line-strong bg-bg px-1.5 py-1 text-[11px] text-fg" /></label>
        <label className="text-[10.5px] text-fg-muted">Lon E<input aria-label="Pin longitude" type="number" step="0.001" min={-180} max={180} value={lonText} onChange={e => setLonText(e.target.value)} className="num mt-0.5 block w-20 rounded border border-line-strong bg-bg px-1.5 py-1 text-[11px] text-fg" /></label>
        <button type="submit" className="rounded border border-line-strong px-2 py-1 text-[11px] text-fg hover:border-copper">Place pin</button>
        {pin && <button type="button" onClick={() => onPin(null)} className="rounded border border-transparent px-2 py-1 text-[11px] text-fg-muted hover:text-fg">Clear pin</button>}
      </form>
      {pin && <p className="num mt-1.5 text-[11px] text-fg" data-testid="pin-position">Pin at {formatPoint(pin.lat, pin.lon)}</p>}
      {body}
    </section>
  );
}

function ScoredProbe({ data, referenceName, label, refreshing }: { data: DiscoveryProbeResponse; referenceName: string; label: (id: string) => string; refreshing: boolean }) {
  const p = data.placement;
  const closer = p?.closer_survey_candidates ?? null;
  const pool = p?.eligible_pool_count ?? null;
  const placement = closer == null || pool == null ? null
    : closer === 0 ? `Under the current priorities it is closer to ${referenceName} than every one of the ${pool} surveyed candidates.`
    : closer >= pool ? `Under the current priorities all ${pool} surveyed candidates sit closer to ${referenceName} than this pin.`
    : `Under the current priorities ${closer} of the ${pool} surveyed candidates sit closer to ${referenceName}; ${pool - closer} sit further.`;
  const nov = data.novelty ? noveltyRelation(data.novelty) : null;
  return (
    <div className="mt-2 rounded-lg border border-copper/50 bg-copper/5 p-2.5" data-testid="pin-scored" aria-live="polite">
      <div className="flex items-baseline justify-between gap-2">
        <p className="num text-fg" title="Terrain similarity index on the survey's scored features, 0 to 100. Not a probability."><span className="text-2xl text-copper-bright">{data.similarity_index!.toFixed(1)}</span><span className="ml-1 text-[11px] text-fg-muted">/ 100</span></p>
        {refreshing && <span role="status" className="text-[10.5px] text-copper-bright">Re-scoring…</span>}
      </div>
      <p className="text-[10.5px] text-fg-faint">terrain index · not a probability</p>
      {placement && <p className="mt-1.5 text-[11px] leading-snug text-fg" data-testid="pin-placement">{placement}</p>}
      <p className="mt-1 text-[10.5px] text-fg-muted">{p?.inside_survey_bounds ? "Inside the surveyed area." : "Outside the surveyed area; the survey did not sample here."}{p?.nearest_survey_candidate_distance_km != null ? ` Nearest surveyed candidate ${formatKm(p.nearest_survey_candidate_distance_km)} away.` : ""}</p>
      {nov && <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-fg-muted"><Badge tone={nov.tone}>{nov.label}</Badge><span>{nov.sentence}</span></p>}
      <dl className="mt-2 space-y-1" aria-label="Measured features against the reference" data-testid="pin-features">
        {(data.feature_distances ?? []).map(d => (
          <div key={d.feature_id} className="text-[10.5px]">
            <dt className="text-fg-muted">{label(d.feature_id)}</dt>
            <dd className="num text-fg">{fmt(d, d.earth_value)} here · {fmt(d, d.mars_value)} at {referenceName}</dd>
          </div>
        ))}
      </dl>
      <details className="mt-2 text-[10.5px] text-fg-muted">
        <summary className="cursor-pointer">What this does and does not mean</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">{data.limitations.map((l, i) => <li key={i}>{l}</li>)}{(data.reasons ?? []).map((r, i) => <li key={`r${i}`}>{r}</li>)}</ul>
      </details>
    </div>
  );
}
