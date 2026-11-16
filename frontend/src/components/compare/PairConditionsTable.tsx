// Compare: what the approved sources state about each condition for the two
// columns, side by side (terrain, mineralogy, elevation, thermal, solar, wind,
// water/ice). Each cell is a sentence quoted from its cited source, or
// "Could not be found in sources". Text only: never scored and kept apart
// from the measured table above.
import type { PairColumnData } from "@/components/compare/PairSelectors";
import { NOT_FOUND } from "@/components/sites/SiteConditionPanels";
import type { ComparisonLocation, ReportedCondition, SiteSource } from "@/types";

const FEATURES: Array<{ id: ReportedCondition["feature"]; label: string }> = [
  { id: "terrain", label: "Terrain" }, { id: "mineralogy", label: "Mineralogy" }, { id: "elevation", label: "Elevation" },
  { id: "thermal", label: "Thermal" }, { id: "solar", label: "Solar / power" }, { id: "wind", label: "Wind" }, { id: "water_ice", label: "Water / ice" },
];

function Cell({ c, sources }: { c: ReportedCondition | undefined; sources: Record<string, SiteSource> }) {
  if (!c?.text) return <span className="italic text-fg-muted">{NOT_FOUND}</span>;
  const s = c.source_ids?.[0] ? sources[c.source_ids[0]] : undefined;
  return (
    <>
      <q className="text-fg">{c.text}</q>
      {s && <span className="mt-0.5 block text-[10.5px] text-fg-faint">Source: <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-fg" title={s.title}>{s.cite}</a></span>}
    </>
  );
}

export function pairNote(a: ComparisonLocation | null, b: ComparisonLocation | null): string | null {
  if (!a || !b || a.paired_location_id === b.id) return null;
  const mars = a.body === "mars" ? a : b;
  return mars.paired_location_id ? `${mars.name} is paired with a different Earth location in this project; these two are shown side by side by your selection.` : null;
}

export function PairConditionsTable({ columns }: { columns: [PairColumnData, PairColumnData] }) {
  const [a, b] = columns;
  const la = a.location, lb = b.location;
  if (!la?.reported_conditions?.length && !lb?.reported_conditions?.length) return null;
  const paired = la?.paired_location_id === lb?.id;
  const basis = paired ? (la?.analog_basis ?? lb?.analog_basis ?? null) : null;
  const basisSource = basis ? (la?.condition_sources?.[basis.source_id] ?? lb?.condition_sources?.[basis.source_id]) : undefined;
  const note = pairNote(la ?? null, lb ?? null);
  return (
    <div className="overflow-x-auto" data-testid="pair-conditions">
      {basis && <p className="mb-2 text-sm text-fg" data-testid="analog-basis"><span className="text-fg-muted">What the source says about this pair:</span> <q>{basis.quote}</q>{basisSource && <span className="text-xs text-fg-faint"> ({basisSource.cite})</span>}</p>}
      {note && <p className="mb-2 text-xs text-fg-muted">{note}</p>}
      <table className="w-full min-w-[36rem] text-left text-xs">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wide text-fg-faint">
            <th className="w-28 py-1.5 pr-2 font-semibold">Condition</th>
            {[a, b].map((c) => <th key={c.body} className="py-1.5 pr-2 font-semibold">{c.location?.name ?? c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {FEATURES.map((f) => (
            <tr key={f.id} className="border-b border-line align-top" data-testid={`pair-condition-${f.id}`}>
              <th scope="row" className="py-1.5 pr-2 font-medium text-fg-muted">{f.label}</th>
              <td className="py-1.5 pr-2"><Cell c={la?.reported_conditions?.find((x) => x.feature === f.id)} sources={la?.condition_sources ?? {}} /></td>
              <td className="py-1.5 pr-2"><Cell c={lb?.reported_conditions?.find((x) => x.feature === f.id)} sources={lb?.condition_sources ?? {}} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10.5px] text-fg-faint">Sentences quoted from the approved sources. Not measurements; they do not change the similarity index.</p>
    </div>
  );
}
