// Renders one measurement's value with its unit. A missing value is rendered
// as "No data" - never as 0. Notes live in the source disclosure.
import { formatUnit, formatValueWithUnit, humanize } from "@/lib/format";
import type { EnvironmentalMeasurement } from "@/types";

export function MeasurementValue({ m }: { m: EnvironmentalMeasurement }) {
  if (m.is_missing || m.value === null || m.value === undefined) {
    return (
      <div>
        <span className="text-sm text-fg-muted">No data</span>
        {m.unit && <span className="ml-1 text-[10.5px] text-fg-faint">({formatUnit(m.unit)})</span>}
      </div>
    );
  }
  if (typeof m.value === "number") {
    return <span className="num text-sm text-fg">{formatValueWithUnit(m.value, m.unit)}</span>;
  }
  if (Array.isArray(m.value)) {
    return (
      <ul className="flex flex-wrap gap-1" aria-label={`${m.label} values`}>
        {m.value.map((v) => (
          <li key={v} className="rounded border border-line-strong bg-bg-elev-2 px-1.5 py-0.5 text-[11px] text-fg">
            {humanize(v)}
          </li>
        ))}
      </ul>
    );
  }
  return <span className="text-xs leading-snug text-fg">{String(m.value)}{m.unit ? ` ${formatUnit(m.unit)}` : ""}</span>;
}
