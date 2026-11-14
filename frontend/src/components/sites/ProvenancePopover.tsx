import { ExternalLink } from "lucide-react";
import { InfoTip } from "@/components/ui/InfoTip";
import type { EnvironmentalMeasurement, Provenance } from "@/types";

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2 py-0.5">
      <dt className="text-fg-faint">{k}</dt>
      <dd className="break-words text-fg">{v}</dd>
    </div>
  );
}

export function ProvenancePopover({ measurement, source }: { measurement: EnvironmentalMeasurement; source: Provenance | undefined }) {
  return (
    <InfoTip label={`Provenance for ${measurement.label}`}>
      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-fg-faint">Provenance</div>
      {source ? (
        <dl>
          <Row k="Source" v={source.title} />
          <Row k="Institution" v={source.institution} />
          <Row k="Instrument" v={source.instrument_or_model} />
          <Row k="Dataset" v={source.dataset_id} />
          <Row k="Resolution" v={measurement.spatial_resolution ?? source.spatial_resolution} />
          <Row k="Period" v={source.observation_period} />
          <Row k="Uncertainty" v={measurement.uncertainty ?? source.uncertainty_notes} />
          <Row k="Type" v={measurement.measurement_type} />
          <Row k="Licence" v={source.license} />
          {source.url && (
            <div className="mt-1.5">
              <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-copper-bright underline decoration-dotted hover:text-fg">
                Open source <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </div>
          )}
        </dl>
      ) : (
        <p className="text-fg-muted">
          {measurement.source_id ? `Source id "${measurement.source_id}" is not in this profile's source table.` : "No source recorded for this metric."}
        </p>
      )}
      {measurement.notes && <p className="mt-2 border-t border-line pt-1.5 text-fg-muted">{measurement.notes}</p>}
    </InfoTip>
  );
}
