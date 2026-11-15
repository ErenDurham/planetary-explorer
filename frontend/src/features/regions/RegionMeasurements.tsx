import { formatValueWithUnit } from "@/lib/format";
import { measurementDelta, type MeasuredRegion } from "./model";

/** Shared raw-measurement table for both catalog regions and discovered footprints. */
export function RegionMeasurements({region, other, atlas=false}: {region:MeasuredRegion;other?:MeasuredRegion;atlas?:boolean}) {
  const ids=Array.from(new Set([...region.measurements.map(m=>m.id), ...(other?.measurements.map(m=>m.id) ?? [])]));
  return <div className={atlas ? "compare-table-wrap scroll-thin rounded border border-line" : "overflow-x-auto rounded border border-line"} role="region" aria-label="Region measurements" tabIndex={0}>
    <table className={atlas ? "compare-table compare-pair" : "w-full text-left text-sm"} style={atlas ? {minWidth:820} : undefined}><caption className="p-3 text-left text-fg-muted">Measured inputs, not mission-fit scores. Differences are shown only for a shared processing baseline and compatible units. Elevation datums are not compared.</caption>
      <thead><tr><th className="p-3">Measurement</th><th className="p-3">{region.name}</th>{other && <><th className="p-3">{other.name}</th><th className="p-3">Selected − comparison</th></>}</tr></thead>
      <tbody>{ids.map(id=>{const a=region.measurements.find(m=>m.id===id), b=other?.measurements.find(m=>m.id===id);const d=other ? measurementDelta(region,other,id) : null;
        const cell=(m:typeof a)=><td className="p-3 align-top"><span className="num">{m?.value == null ? "Not measured" : formatValueWithUnit(m.value,m.unit)}</span>{m?.method && <p className="mt-1 text-xs text-fg-muted">{m.method}</p>}</td>;
        return <tr className="border-t border-line" key={id}><th scope="row" className="p-3 align-top font-medium">{a?.label ?? b?.label ?? id}</th>{cell(a)}{other && <>{cell(b)}<td className="p-3 align-top">{d ? formatValueWithUnit(d.value,d.unit) : "Not comparable / not measured"}</td></>}</tr>;})}</tbody>
    </table>{!ids.length && <p className="p-3">No measured profile is available for this region.</p>}
  </div>;
}
