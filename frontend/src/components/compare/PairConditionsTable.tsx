// Compare: the workbook's literature-reported conditions for the two columns,
// side by side (terrain, mineralogy, elevation, thermal, solar, wind, water/ice),
// with each side's sources. Text only: never scored, never parsed into numbers,
// and kept apart from the measured table above. A missing cell reads
// "Not found in sources", never blank or zero.
import type { PairColumnData } from "@/components/compare/PairSelectors";
import type { ComparisonLocation, ReportedCondition, WorkbookSource } from "@/types";

const FEATURES: Array<{ id: ReportedCondition["feature"]; label: string }> = [
  { id: "terrain", label: "Terrain" }, { id: "mineralogy", label: "Mineralogy" }, { id: "elevation", label: "Elevation" },
  { id: "thermal", label: "Thermal" }, { id: "solar", label: "Solar / power" }, { id: "wind", label: "Wind" }, { id: "water_ice", label: "Water / ice" },
];

function Cell({ c, sources }: { c: ReportedCondition | undefined; sources: Record<string, WorkbookSource> }) {
  if (!c) return <span className="italic text-fg-faint">Not reported for this location</span>;
  if (!c.text) {
    return <span className="italic text-fg-muted">{c.status === "excluded_source" ? "Not shown: no approved source" : "Not found in sources"}{c.note ? <span className="block not-italic text-[10.5px]">{c.note}</span> : null}</span>;
  }
  const cites = (c.source_ids ?? []).map((id) => sources[id]).filter((s): s is WorkbookSource => !!s);
  return (
    <>
      <span className="text-fg">{c.text}</span>
      {c.note && <span className="block text-[10.5px] text-fg-muted">{c.note}</span>}
      {cites.length > 0 && (
        <span className="mt-0.5 block text-[10.5px] text-fg-faint">
          {cites.map((s, i) => <span key={s.source_id}>{i > 0 && "; "}<a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-fg">{s.cite}</a></span>)}
          {c.status === "verified" ? " · quoted in source" : c.status === "citation_only" ? " · citation only" : ""}
        </span>
      )}
    </>
  );
}

export function pairNote(a: ComparisonLocation | null, b: ComparisonLocation | null): string | null {
  if (!a || !b) return null;
  if (a.paired_location_id === b.id) return null;
  const mars = a.body === "mars" ? a : b;
  return mars.paired_location_id ? `The workbook pairs ${mars.name} with a different Earth location; these two are shown side by side by your selection.` : null;
}

export function PairConditionsTable({ columns }: { columns: [PairColumnData, PairColumnData] }) {
  const [a, b] = columns;
  const la = a.location, lb = b.location;
  if (!la?.reported_conditions?.length && !lb?.reported_conditions?.length) return null;
  const why = (la?.paired_location_id === lb?.id ? (la?.why_they_match ?? lb?.why_they_match) : null) ?? null;
  const note = pairNote(la ?? null, lb ?? null);
  return (
    <div className="overflow-x-auto" data-testid="pair-conditions">
      {why && <p className="mb-2 text-sm text-fg"><span className="text-fg-muted">Why the workbook pairs them:</span> {why}</p>}
      {note && <p className="mb-2 text-xs text-fg-muted">{note}</p>}
      <table className="w-full min-w-[36rem] text-left text-xs">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wide text-fg-faint">
            <th className="w-28 py-1.5 pr-2 font-semibold">Condition</th>
            {[a, b].map((c) => <th key={c.body} className="py-1.5 pr-2 font-semibold">{c.location?.name ?? c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {FEATURES.map((f) => {
            const ca = la?.reported_conditions?.find((x) => x.feature === f.id);
            const cb = lb?.reported_conditions?.find((x) => x.feature === f.id);
            if (!ca && !cb) return null;
            return (
              <tr key={f.id} className="border-b border-line align-top" data-testid={`pair-condition-${f.id}`}>
                <th scope="row" className="py-1.5 pr-2 font-medium text-fg-muted">{f.label}</th>
                <td className="py-1.5 pr-2"><Cell c={ca} sources={la?.condition_sources ?? {}} /></td>
                <td className="py-1.5 pr-2"><Cell c={cb} sources={lb?.condition_sources ?? {}} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10.5px] text-fg-faint">Literature-reported descriptions from the Lesser-Known Mars Sites workbook. Not measurements; they do not change the similarity index.</p>
    </div>
  );
}
